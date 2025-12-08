"""Admin API endpoints (token-protected)."""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from swaperex.config import get_settings
from swaperex.ledger.database import get_db
from swaperex.ledger.models import Balance, Deposit, Swap, User, Withdrawal, WithdrawalStatus
from swaperex.ledger.repository import LedgerRepository
from swaperex.providers import get_provider

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin_token(x_admin_token: str = Header(None)) -> bool:
    """Verify admin token from header.

    If ADMIN_TOKEN is not set, allows access (dev mode).
    """
    settings = get_settings()

    if not settings.admin_token:
        # Dev mode - no token required (warn in production)
        return True

    if x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")

    return True


class BalanceSummary(BaseModel):
    """Balance summary for an asset."""

    asset: str
    total: float
    user_count: int


class SystemStats(BaseModel):
    """System statistics."""

    users: int
    deposits: int
    swaps: int
    balances: int
    provider: str
    dry_run: bool


class ProviderStatus(BaseModel):
    """Provider status."""

    name: str
    configured: bool
    valid: bool


@router.get("/balances", response_model=list[BalanceSummary])
async def get_balances(_: bool = Depends(require_admin_token)) -> list[BalanceSummary]:
    """Get aggregated balances per asset."""
    async with get_db() as session:
        # Aggregate balances by asset
        result = await session.execute(
            select(
                Balance.asset,
                func.sum(Balance.amount).label("total"),
                func.count(Balance.user_id.distinct()).label("user_count"),
            ).group_by(Balance.asset)
        )
        rows = result.all()

        return [
            BalanceSummary(
                asset=row.asset,
                total=float(row.total),
                user_count=row.user_count,
            )
            for row in rows
        ]


@router.get("/stats", response_model=SystemStats)
async def get_stats(_: bool = Depends(require_admin_token)) -> SystemStats:
    """Get system statistics."""
    settings = get_settings()

    async with get_db() as session:
        user_count = await session.scalar(select(func.count(User.id))) or 0
        deposit_count = await session.scalar(select(func.count(Deposit.id))) or 0
        swap_count = await session.scalar(select(func.count(Swap.id))) or 0
        balance_count = await session.scalar(select(func.count(Balance.id))) or 0

        return SystemStats(
            users=user_count,
            deposits=deposit_count,
            swaps=swap_count,
            balances=balance_count,
            provider=settings.provider,
            dry_run=settings.dry_run,
        )


@router.get("/provider", response_model=ProviderStatus)
async def get_provider_status(_: bool = Depends(require_admin_token)) -> ProviderStatus:
    """Get provider configuration status."""
    provider = get_provider()
    valid = await provider.validate_config()

    return ProviderStatus(
        name=provider.name,
        configured=True,
        valid=valid,
    )


@router.get("/users")
async def list_users(
    limit: int = 50,
    offset: int = 0,
    _: bool = Depends(require_admin_token),
) -> dict:
    """List users with their balances."""
    async with get_db() as session:
        # Get users
        result = await session.execute(
            select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
        )
        users = result.scalars().all()

        user_list = []
        for user in users:
            # Get balances for each user
            balance_result = await session.execute(
                select(Balance).where(Balance.user_id == user.id)
            )
            balances = balance_result.scalars().all()

            user_list.append(
                {
                    "id": user.id,
                    "telegram_id": user.telegram_id,
                    "username": user.username,
                    "first_name": user.first_name,
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                    "balances": {b.asset: float(b.amount) for b in balances},
                }
            )

        # Get total count
        total = await session.scalar(select(func.count(User.id))) or 0

        return {
            "users": user_list,
            "total": total,
            "limit": limit,
            "offset": offset,
        }


# ==============================================================================
# Withdrawal Management (Manual Processing)
# ==============================================================================


class WithdrawalInfo(BaseModel):
    """Withdrawal details for admin view."""

    id: int
    reference: str
    user_id: int
    telegram_id: int
    username: Optional[str]
    asset: str
    amount: str
    fee_amount: str
    net_amount: str
    destination_address: str
    status: str
    tx_hash: Optional[str]
    created_at: str
    completed_at: Optional[str]


class CompleteWithdrawalRequest(BaseModel):
    """Request to mark withdrawal as completed."""

    tx_hash: str


class CancelWithdrawalRequest(BaseModel):
    """Request to cancel withdrawal."""

    reason: Optional[str] = None


class CreditBalanceRequest(BaseModel):
    """Request to credit user balance (admin operation)."""

    telegram_id: int
    asset: str
    amount: float


@router.post("/credit")
async def credit_user_balance(
    request: CreditBalanceRequest,
    _: bool = Depends(require_admin_token),
) -> dict:
    """Credit balance to a user (admin only).

    Use this to manually adjust user balances for operations like
    internal reserve swaps or deposit reconciliation.
    """
    from decimal import Decimal

    async with get_db() as session:
        repo = LedgerRepository(session)
        user = await repo.get_user_by_telegram_id(request.telegram_id)

        if not user:
            raise HTTPException(status_code=404, detail=f"User with telegram_id {request.telegram_id} not found")

        balance = await repo.credit_balance(
            user_id=user.id,
            asset=request.asset.upper(),
            amount=Decimal(str(request.amount)),
        )

        return {
            "success": True,
            "user_id": user.id,
            "telegram_id": request.telegram_id,
            "asset": request.asset.upper(),
            "credited": request.amount,
            "new_balance": float(balance.amount),
        }


@router.get("/withdrawals/pending")
async def list_pending_withdrawals(
    _: bool = Depends(require_admin_token),
) -> dict:
    """List all pending withdrawals awaiting manual processing.

    Use this to see which withdrawals need to be sent from Electrum/Trust Wallet.
    """
    async with get_db() as session:
        repo = LedgerRepository(session)
        withdrawals = await repo.get_pending_withdrawals()

        items = []
        for w in withdrawals:
            user = await session.get(User, w.user_id)
            items.append(
                WithdrawalInfo(
                    id=w.id,
                    reference=f"W-{w.id:06d}",
                    user_id=w.user_id,
                    telegram_id=user.telegram_id if user else 0,
                    username=user.username if user else None,
                    asset=w.asset,
                    amount=str(w.amount),
                    fee_amount=str(w.fee_amount),
                    net_amount=str(w.net_amount),
                    destination_address=w.destination_address,
                    status=w.status.value if isinstance(w.status, WithdrawalStatus) else w.status,
                    tx_hash=w.tx_hash,
                    created_at=w.created_at.isoformat() if w.created_at else "",
                    completed_at=w.completed_at.isoformat() if w.completed_at else None,
                )
            )

        return {
            "pending_count": len(items),
            "withdrawals": [w.model_dump() for w in items],
        }


@router.get("/withdrawals/{withdrawal_id}")
async def get_withdrawal_details(
    withdrawal_id: int,
    _: bool = Depends(require_admin_token),
) -> WithdrawalInfo:
    """Get details of a specific withdrawal."""
    async with get_db() as session:
        repo = LedgerRepository(session)
        w = await repo.get_withdrawal_by_id(withdrawal_id)

        if not w:
            raise HTTPException(status_code=404, detail="Withdrawal not found")

        user = await session.get(User, w.user_id)

        return WithdrawalInfo(
            id=w.id,
            reference=f"W-{w.id:06d}",
            user_id=w.user_id,
            telegram_id=user.telegram_id if user else 0,
            username=user.username if user else None,
            asset=w.asset,
            amount=str(w.amount),
            fee_amount=str(w.fee_amount),
            net_amount=str(w.net_amount),
            destination_address=w.destination_address,
            status=w.status.value if isinstance(w.status, WithdrawalStatus) else w.status,
            tx_hash=w.tx_hash,
            created_at=w.created_at.isoformat() if w.created_at else "",
            completed_at=w.completed_at.isoformat() if w.completed_at else None,
        )


@router.post("/withdrawals/{withdrawal_id}/complete")
async def complete_withdrawal(
    withdrawal_id: int,
    request: CompleteWithdrawalRequest,
    _: bool = Depends(require_admin_token),
) -> dict:
    """Mark withdrawal as completed after sending from Electrum/Trust Wallet.

    Call this after you've manually sent the transaction and have the tx hash.
    """
    async with get_db() as session:
        repo = LedgerRepository(session)

        try:
            w = await repo.complete_withdrawal(
                withdrawal_id=withdrawal_id,
                tx_hash=request.tx_hash,
            )

            return {
                "success": True,
                "message": f"Withdrawal W-{w.id:06d} marked as completed",
                "tx_hash": w.tx_hash,
                "status": w.status.value if isinstance(w.status, WithdrawalStatus) else w.status,
            }

        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))


@router.post("/withdrawals/{withdrawal_id}/cancel")
async def cancel_withdrawal(
    withdrawal_id: int,
    request: CancelWithdrawalRequest,
    _: bool = Depends(require_admin_token),
) -> dict:
    """Cancel a pending withdrawal and refund user balance."""
    async with get_db() as session:
        repo = LedgerRepository(session)

        try:
            w = await repo.cancel_withdrawal(withdrawal_id=withdrawal_id)

            return {
                "success": True,
                "message": f"Withdrawal W-{w.id:06d} cancelled and refunded",
                "status": w.status.value if isinstance(w.status, WithdrawalStatus) else w.status,
            }

        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))


@router.get("/withdrawals")
async def list_all_withdrawals(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    _: bool = Depends(require_admin_token),
) -> dict:
    """List all withdrawals with optional status filter."""
    async with get_db() as session:
        stmt = select(Withdrawal).order_by(Withdrawal.created_at.desc())

        if status:
            try:
                status_enum = WithdrawalStatus(status)
                stmt = stmt.where(Withdrawal.status == status_enum)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

        stmt = stmt.limit(limit).offset(offset)
        result = await session.execute(stmt)
        withdrawals = result.scalars().all()

        items = []
        for w in withdrawals:
            user = await session.get(User, w.user_id)
            items.append({
                "id": w.id,
                "reference": f"W-{w.id:06d}",
                "user_id": w.user_id,
                "telegram_id": user.telegram_id if user else 0,
                "username": user.username if user else None,
                "asset": w.asset,
                "amount": str(w.amount),
                "net_amount": str(w.net_amount),
                "destination_address": w.destination_address,
                "status": w.status.value if isinstance(w.status, WithdrawalStatus) else w.status,
                "tx_hash": w.tx_hash,
                "created_at": w.created_at.isoformat() if w.created_at else "",
            })

        count_stmt = select(func.count(Withdrawal.id))
        if status:
            count_stmt = count_stmt.where(Withdrawal.status == WithdrawalStatus(status))
        total = await session.scalar(count_stmt) or 0

        return {
            "withdrawals": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
