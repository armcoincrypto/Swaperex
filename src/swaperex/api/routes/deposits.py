"""Deposit webhook and management endpoints."""

import hmac
import hashlib
import re
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel, Field, field_validator

from swaperex.config import get_settings
from swaperex.ledger.database import get_db
from swaperex.ledger.models import DepositStatus
from swaperex.ledger.repository import LedgerRepository

router = APIRouter()

# Supported assets for validation
SUPPORTED_ASSETS = {
    "BTC", "ETH", "LTC", "DASH", "TRX", "BSC", "SOL",
    "USDT", "USDC", "USDT-ERC20", "USDT-TRC20"
}


class DepositWebhookPayload(BaseModel):
    """Payload for deposit webhook from provider."""

    address: str = Field(..., min_length=10, max_length=100, description="Deposit address")
    asset: str = Field(..., min_length=2, max_length=20, description="Asset symbol (e.g., BTC, ETH)")
    amount: str = Field(..., description="Amount deposited as string")
    tx_hash: str = Field(..., min_length=10, max_length=100, description="Transaction hash")
    from_address: Optional[str] = Field(None, max_length=100, description="Sender address")
    confirmations: int = Field(default=0, ge=0, le=10000, description="Number of confirmations")
    status: str = Field(default="confirmed", description="Deposit status")

    @field_validator("asset")
    @classmethod
    def validate_asset(cls, v: str) -> str:
        """Validate and normalize asset symbol."""
        upper = v.upper().strip()
        if upper not in SUPPORTED_ASSETS:
            raise ValueError(f"Unsupported asset: {v}. Supported: {', '.join(sorted(SUPPORTED_ASSETS))}")
        return upper

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: str) -> str:
        """Validate amount is a positive decimal number."""
        try:
            amount = Decimal(v)
            if amount <= 0:
                raise ValueError("Amount must be positive")
            if amount > Decimal("1000000000"):  # 1 billion max
                raise ValueError("Amount exceeds maximum limit")
            return str(amount)
        except InvalidOperation:
            raise ValueError(f"Invalid amount format: {v}")

    @field_validator("tx_hash")
    @classmethod
    def validate_tx_hash(cls, v: str) -> str:
        """Validate transaction hash format."""
        v = v.strip()
        # Basic validation - should be hex characters
        if not re.match(r'^(0x)?[a-fA-F0-9]+$', v):
            raise ValueError("Invalid transaction hash format")
        return v


class DepositResponse(BaseModel):
    """Response for deposit operations."""

    success: bool
    deposit_id: Optional[int] = None
    message: str
    user_telegram_id: Optional[int] = None


class SimulatedDepositRequest(BaseModel):
    """Request for simulated deposit (testing only)."""

    telegram_id: int = Field(..., gt=0, description="User's Telegram ID")
    asset: str = Field(..., min_length=2, max_length=20, description="Asset symbol")
    amount: str = Field(..., description="Amount to deposit")

    @field_validator("asset")
    @classmethod
    def validate_asset(cls, v: str) -> str:
        """Validate and normalize asset symbol."""
        upper = v.upper().strip()
        if upper not in SUPPORTED_ASSETS:
            raise ValueError(f"Unsupported asset: {v}")
        return upper

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: str) -> str:
        """Validate amount is a positive decimal number."""
        try:
            amount = Decimal(v)
            if amount <= 0:
                raise ValueError("Amount must be positive")
            if amount > Decimal("1000000"):  # 1 million max for simulated
                raise ValueError("Simulated amount too large")
            return str(amount)
        except InvalidOperation:
            raise ValueError(f"Invalid amount format: {v}")


def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify webhook signature using HMAC-SHA256."""
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/deposits/webhook", response_model=DepositResponse)
async def deposit_webhook(
    payload: DepositWebhookPayload,
    x_webhook_signature: Optional[str] = Header(None),
):
    """
    Receive deposit notification from provider.

    In production, this would verify the webhook signature.
    For PoC, signature verification is optional.
    """
    settings = get_settings()

    # Verify signature if secret is configured (Stage 2)
    # For PoC, we skip strict verification
    if settings.deposit_webhook_secret and x_webhook_signature:
        # Would verify signature here in production
        pass

    async with get_db() as session:
        repo = LedgerRepository(session)

        # Find user by deposit address
        addr_record = await repo.get_deposit_address_record(payload.address)
        if addr_record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unknown deposit address: {payload.address}",
            )

        # Parse amount
        try:
            amount = Decimal(payload.amount)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid amount: {payload.amount}",
            )

        # Determine status
        deposit_status = (
            DepositStatus.CONFIRMED
            if payload.status == "confirmed"
            else DepositStatus.PENDING
        )

        # Create deposit record
        deposit = await repo.create_deposit(
            user_id=addr_record.user_id,
            asset=payload.asset.upper(),
            amount=amount,
            to_address=payload.address,
            tx_hash=payload.tx_hash,
            from_address=payload.from_address,
            status=deposit_status,
        )

        # If confirmed, credit balance
        if deposit_status == DepositStatus.CONFIRMED:
            await repo.confirm_deposit(deposit.id)

        # Get user for response
        user = await repo.get_user_by_telegram_id(addr_record.user_id)
        telegram_id = user.telegram_id if user else None

        return DepositResponse(
            success=True,
            deposit_id=deposit.id,
            message=f"Deposit of {amount} {payload.asset} processed",
            user_telegram_id=telegram_id,
        )


@router.post("/deposits/simulate", response_model=DepositResponse)
async def simulate_deposit(request: SimulatedDepositRequest):
    """
    Simulate a deposit for testing purposes.

    This endpoint is only available in non-production environments.
    """
    settings = get_settings()

    if settings.is_production:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Simulated deposits are not available in production",
        )

    async with get_db() as session:
        repo = LedgerRepository(session)

        # Get or create user
        user = await repo.get_or_create_user(telegram_id=request.telegram_id)

        # Get or create deposit address
        addr = await repo.get_or_create_deposit_address(user.id, request.asset)

        # Parse amount
        try:
            amount = Decimal(request.amount)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid amount: {request.amount}",
            )

        # Create and confirm deposit
        deposit = await repo.create_deposit(
            user_id=user.id,
            asset=request.asset.upper(),
            amount=amount,
            to_address=addr.address,
            tx_hash=f"sim_{user.id}_{request.asset}_{amount}",
            status=DepositStatus.PENDING,
        )
        await repo.confirm_deposit(deposit.id)

        return DepositResponse(
            success=True,
            deposit_id=deposit.id,
            message=f"Simulated deposit of {amount} {request.asset} credited to user {request.telegram_id}",
            user_telegram_id=request.telegram_id,
        )


@router.get("/deposits/{deposit_id}")
async def get_deposit(deposit_id: int):
    """Get deposit details by ID."""
    async with get_db() as session:
        repo = LedgerRepository(session)

        # We need to add a method to get deposit by ID
        from sqlalchemy import select
        from swaperex.ledger.models import Deposit

        stmt = select(Deposit).where(Deposit.id == deposit_id)
        result = await session.execute(stmt)
        deposit = result.scalar_one_or_none()

        if deposit is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Deposit {deposit_id} not found",
            )

        return {
            "id": deposit.id,
            "user_id": deposit.user_id,
            "asset": deposit.asset,
            "amount": str(deposit.amount),
            "tx_hash": deposit.tx_hash,
            "from_address": deposit.from_address,
            "to_address": deposit.to_address,
            "status": deposit.status,
            "confirmations": deposit.confirmations,
            "created_at": deposit.created_at.isoformat() if deposit.created_at else None,
            "confirmed_at": deposit.confirmed_at.isoformat() if deposit.confirmed_at else None,
        }
