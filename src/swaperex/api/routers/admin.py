"""Admin API endpoints (token-protected)."""

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from swaperex.config import get_settings
from swaperex.ledger.database import get_db
from swaperex.ledger.models import Balance, Deposit, Swap, User
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
