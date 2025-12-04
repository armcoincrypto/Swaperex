"""Admin API endpoints (token-protected)."""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from swaperex.config import get_settings
from swaperex.ledger.database import get_db
from swaperex.ledger.models import AuditLog, AuditLogType, Balance, Deposit, Swap, User, Withdrawal, WithdrawalStatus
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


# ==============================================================================
# Deposit Management
# ==============================================================================


class ManualDepositRequest(BaseModel):
    """Request to manually credit a deposit."""

    telegram_id: int
    asset: str
    amount: str
    tx_hash: Optional[str] = None
    note: Optional[str] = None


class DepositInfo(BaseModel):
    """Deposit details for admin view."""

    id: int
    user_id: int
    telegram_id: int
    username: Optional[str]
    asset: str
    amount: str
    tx_hash: Optional[str]
    to_address: Optional[str]
    status: str
    created_at: str
    confirmed_at: Optional[str]


@router.get("/deposits")
async def list_deposits(
    status: Optional[str] = None,
    asset: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    _: bool = Depends(require_admin_token),
) -> dict:
    """List all deposits with optional filters."""
    async with get_db() as session:
        from sqlalchemy import select
        from swaperex.ledger.models import DepositStatus

        stmt = select(Deposit).order_by(Deposit.created_at.desc())

        if status:
            try:
                status_enum = DepositStatus(status)
                stmt = stmt.where(Deposit.status == status_enum)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

        if asset:
            stmt = stmt.where(Deposit.asset == asset.upper())

        stmt = stmt.limit(limit).offset(offset)
        result = await session.execute(stmt)
        deposits = result.scalars().all()

        items = []
        for d in deposits:
            user = await session.get(User, d.user_id)
            items.append({
                "id": d.id,
                "user_id": d.user_id,
                "telegram_id": user.telegram_id if user else 0,
                "username": user.username if user else None,
                "asset": d.asset,
                "amount": str(d.amount),
                "tx_hash": d.tx_hash,
                "to_address": d.to_address,
                "status": d.status.value if hasattr(d.status, 'value') else str(d.status),
                "created_at": d.created_at.isoformat() if d.created_at else "",
                "confirmed_at": d.confirmed_at.isoformat() if d.confirmed_at else None,
            })

        from sqlalchemy import func
        count_stmt = select(func.count(Deposit.id))
        total = await session.scalar(count_stmt) or 0

        return {
            "deposits": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        }


@router.post("/deposits/credit")
async def manual_credit_deposit(
    request: ManualDepositRequest,
    _: bool = Depends(require_admin_token),
) -> dict:
    """Manually credit a deposit to a user's balance.

    Use this when:
    - A deposit was received but not detected by scanner
    - You need to credit funds manually
    - Testing with real transactions

    Args:
        telegram_id: User's Telegram ID
        asset: Asset symbol (BTC, DASH, ETH, etc.)
        amount: Amount to credit
        tx_hash: Optional real transaction hash for reference
        note: Optional note for records
    """
    from decimal import Decimal, InvalidOperation
    from swaperex.ledger.models import DepositStatus

    try:
        amount = Decimal(request.amount)
        if amount <= 0:
            raise ValueError("Amount must be positive")
    except (InvalidOperation, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid amount: {e}")

    async with get_db() as session:
        repo = LedgerRepository(session)

        # Get or create user
        user = await repo.get_or_create_user(telegram_id=request.telegram_id)

        # Get or create deposit address for records
        addr = await repo.get_or_create_deposit_address(user.id, request.asset.upper())

        # Create deposit record
        tx_hash = request.tx_hash or f"manual_{user.id}_{request.asset}_{amount}"
        deposit = await repo.create_deposit(
            user_id=user.id,
            asset=request.asset.upper(),
            amount=amount,
            to_address=addr.address,
            tx_hash=tx_hash,
            status=DepositStatus.PENDING,
        )

        # Confirm and credit balance
        await repo.confirm_deposit(deposit.id)

        return {
            "success": True,
            "deposit_id": deposit.id,
            "message": f"Credited {amount} {request.asset.upper()} to user {request.telegram_id}",
            "user_id": user.id,
            "telegram_id": user.telegram_id,
            "balance_credited": str(amount),
            "note": request.note,
        }


@router.get("/addresses")
async def list_deposit_addresses(
    asset: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    _: bool = Depends(require_admin_token),
) -> dict:
    """List all deposit addresses (useful for finding user by address)."""
    from swaperex.ledger.models import DepositAddress

    async with get_db() as session:
        stmt = select(DepositAddress).order_by(DepositAddress.created_at.desc())

        if asset:
            stmt = stmt.where(DepositAddress.asset == asset.upper())

        stmt = stmt.limit(limit).offset(offset)
        result = await session.execute(stmt)
        addresses = result.scalars().all()

        items = []
        for a in addresses:
            user = await session.get(User, a.user_id)
            items.append({
                "id": a.id,
                "user_id": a.user_id,
                "telegram_id": user.telegram_id if user else 0,
                "username": user.username if user else None,
                "asset": a.asset,
                "address": a.address,
                "derivation_path": a.derivation_path if hasattr(a, 'derivation_path') else None,
                "derivation_index": a.derivation_index if hasattr(a, 'derivation_index') else None,
                "created_at": a.created_at.isoformat() if a.created_at else "",
            })

        return {
            "addresses": items,
            "count": len(items),
            "limit": limit,
            "offset": offset,
        }


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


# ==============================================================================
# Audit Logs
# ==============================================================================


@router.get("/audit-logs")
async def list_audit_logs(
    user_id: Optional[int] = None,
    telegram_id: Optional[int] = None,
    asset: Optional[str] = None,
    log_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    _: bool = Depends(require_admin_token),
) -> dict:
    """List audit logs with optional filters.

    Provides full audit trail of all balance changes.
    """
    async with get_db() as session:
        stmt = select(AuditLog).order_by(AuditLog.created_at.desc())

        if user_id:
            stmt = stmt.where(AuditLog.user_id == user_id)
        elif telegram_id:
            # Find user by telegram_id first
            user_stmt = select(User).where(User.telegram_id == telegram_id)
            user_result = await session.execute(user_stmt)
            user = user_result.scalar_one_or_none()
            if user:
                stmt = stmt.where(AuditLog.user_id == user.id)
            else:
                return {"logs": [], "total": 0}

        if asset:
            stmt = stmt.where(AuditLog.asset == asset.upper())

        if log_type:
            stmt = stmt.where(AuditLog.log_type == log_type)

        stmt = stmt.limit(limit).offset(offset)
        result = await session.execute(stmt)
        logs = result.scalars().all()

        items = []
        for log in logs:
            user = await session.get(User, log.user_id)
            items.append({
                "id": log.id,
                "user_id": log.user_id,
                "telegram_id": user.telegram_id if user else 0,
                "asset": log.asset,
                "log_type": log.log_type.value if hasattr(log.log_type, 'value') else str(log.log_type),
                "amount": str(log.amount),
                "balance_before": str(log.balance_before),
                "balance_after": str(log.balance_after),
                "reference_type": log.reference_type,
                "reference_id": log.reference_id,
                "description": log.description,
                "tx_hash": log.tx_hash,
                "actor_type": log.actor_type,
                "actor_id": log.actor_id,
                "created_at": log.created_at.isoformat() if log.created_at else "",
            })

        count_stmt = select(func.count(AuditLog.id))
        total = await session.scalar(count_stmt) or 0

        return {
            "logs": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        }


# ==============================================================================
# Health & Monitoring
# ==============================================================================


class HealthStatus(BaseModel):
    """System health status."""

    status: str
    database: str
    hot_wallets: dict
    users: int
    pending_withdrawals: int


@router.get("/health", response_model=HealthStatus)
async def get_system_health(_: bool = Depends(require_admin_token)) -> HealthStatus:
    """Get detailed system health status.

    Checks:
    - Database connectivity
    - Hot wallet configuration
    - Pending operations
    """
    import os

    try:
        async with get_db() as session:
            repo = LedgerRepository(session)

            # User count
            user_count = await session.scalar(select(func.count(User.id))) or 0

            # Pending withdrawals
            pending = await repo.get_pending_withdrawals()

            # Check hot wallets
            hot_wallets = {}
            for asset in ["BTC", "ETH", "DASH", "LTC", "TRX"]:
                wif_key = os.getenv(f"{asset}_HOT_WALLET_WIF")
                address = os.getenv(f"{asset}_HOT_WALLET_ADDRESS")

                hot_wallets[asset] = {
                    "configured": bool(wif_key or address),
                    "address": address[:10] + "..." if address else None,
                }

            return HealthStatus(
                status="healthy",
                database="connected",
                hot_wallets=hot_wallets,
                users=user_count,
                pending_withdrawals=len(pending),
            )

    except Exception as e:
        return HealthStatus(
            status="unhealthy",
            database=f"error: {str(e)}",
            hot_wallets={},
            users=0,
            pending_withdrawals=0,
        )


# ==============================================================================
# Manual Balance Adjustment with Audit
# ==============================================================================


class AdjustBalanceRequest(BaseModel):
    """Request to adjust user balance."""

    telegram_id: int
    asset: str
    amount: str  # Positive for credit, negative for debit
    reason: str


@router.post("/balance/adjust")
async def adjust_balance(
    request: AdjustBalanceRequest,
    _: bool = Depends(require_admin_token),
) -> dict:
    """Adjust user balance with full audit trail.

    Use positive amount to credit, negative to debit.
    All adjustments are logged for audit purposes.
    """
    from decimal import Decimal, InvalidOperation

    try:
        amount = Decimal(request.amount)
    except InvalidOperation:
        raise HTTPException(status_code=400, detail="Invalid amount format")

    async with get_db() as session:
        repo = LedgerRepository(session)

        # Get or create user
        user = await repo.get_or_create_user(telegram_id=request.telegram_id)

        # Get current balance
        balance = await repo.get_or_create_balance(user.id, request.asset.upper())
        balance_before = balance.amount

        if amount > 0:
            # Credit
            await repo.credit_balance(user.id, request.asset.upper(), amount)
            log_type = AuditLogType.ADMIN_CREDIT
        else:
            # Debit
            if balance.available < abs(amount):
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient balance: {balance.available} available"
                )
            await repo.debit_balance(user.id, request.asset.upper(), abs(amount))
            log_type = AuditLogType.ADMIN_DEBIT

        balance_after = balance_before + amount

        # Add audit log
        await repo.add_audit_log(
            user_id=user.id,
            asset=request.asset.upper(),
            log_type=log_type,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            description=f"Admin adjustment: {request.reason}",
            actor_type="admin",
        )

        return {
            "success": True,
            "user_id": user.id,
            "telegram_id": request.telegram_id,
            "asset": request.asset.upper(),
            "adjustment": str(amount),
            "balance_before": str(balance_before),
            "balance_after": str(balance_after),
            "reason": request.reason,
        }
