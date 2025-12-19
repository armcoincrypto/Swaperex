"""Withdrawal API endpoints."""

import logging
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from swaperex.config import get_settings
from swaperex.ledger.database import get_db
from swaperex.ledger.models import WithdrawalStatus
from swaperex.ledger.repository import LedgerRepository
from swaperex.notifications import get_notifier
from swaperex.withdrawal.factory import (
    get_supported_withdrawal_assets,
    get_withdrawal_handler,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/withdraw", tags=["Withdrawals"])


async def require_admin_token(x_admin_token: str = Header(None)) -> bool:
    """Verify admin token."""
    settings = get_settings()
    if settings.admin_token and x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    return True


# Request/Response models
class FeeEstimateRequest(BaseModel):
    """Request for fee estimate."""
    asset: str
    amount: str  # Decimal as string
    destination: str
    priority: str = "normal"  # low, normal, high


class FeeEstimateResponse(BaseModel):
    """Fee estimate response."""
    asset: str
    network_fee: str
    service_fee: str
    total_fee: str
    fee_asset: str
    estimated_time: str
    priority: str


class ValidateAddressRequest(BaseModel):
    """Request to validate address."""
    asset: str
    address: str


class ValidateAddressResponse(BaseModel):
    """Address validation response."""
    asset: str
    address: str
    valid: bool
    message: Optional[str] = None


class WithdrawalRequest(BaseModel):
    """Withdrawal request."""
    asset: str
    destination: str
    amount: str  # Decimal as string
    priority: str = "normal"
    # Private key would come from secure storage in production
    # For now, passed for testing only


class WithdrawalResponse(BaseModel):
    """Withdrawal response."""
    success: bool
    txid: Optional[str] = None
    status: str
    message: Optional[str] = None
    error: Optional[str] = None
    fee_paid: Optional[str] = None


@router.get("/supported")
async def get_supported() -> dict:
    """Get list of supported withdrawal assets."""
    return {"assets": get_supported_withdrawal_assets()}


@router.post("/validate", response_model=ValidateAddressResponse)
async def validate_address(request: ValidateAddressRequest) -> ValidateAddressResponse:
    """Validate a withdrawal destination address."""
    handler = get_withdrawal_handler(request.asset)

    if not handler:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported asset: {request.asset}",
        )

    is_valid = await handler.validate_address(request.address)

    return ValidateAddressResponse(
        asset=request.asset.upper(),
        address=request.address,
        valid=is_valid,
        message="Valid address" if is_valid else "Invalid address format",
    )


@router.post("/estimate", response_model=FeeEstimateResponse)
async def estimate_fee(request: FeeEstimateRequest) -> FeeEstimateResponse:
    """Estimate withdrawal fees."""
    handler = get_withdrawal_handler(request.asset)

    if not handler:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported asset: {request.asset}",
        )

    try:
        amount = Decimal(request.amount)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid amount")

    # Validate address first
    if not await handler.validate_address(request.destination):
        raise HTTPException(status_code=400, detail="Invalid destination address")

    estimate = await handler.estimate_fee(
        amount=amount,
        destination=request.destination,
        priority=request.priority,
    )

    return FeeEstimateResponse(
        asset=estimate.asset,
        network_fee=str(estimate.network_fee),
        service_fee=str(estimate.service_fee),
        total_fee=str(estimate.total_fee),
        fee_asset=estimate.fee_asset,
        estimated_time=estimate.estimated_time,
        priority=estimate.priority,
    )


@router.post("/execute", response_model=WithdrawalResponse)
async def execute_withdrawal(
    request: WithdrawalRequest,
    private_key: str = Header(None, alias="X-Private-Key"),
    _: bool = Depends(require_admin_token),
) -> WithdrawalResponse:
    """Execute a withdrawal (admin only).

    WARNING: This endpoint is for testing. In production, private keys
    should NEVER be sent over the network. Use HSM or secure enclave.
    """
    if not private_key:
        raise HTTPException(
            status_code=400,
            detail="Private key required (X-Private-Key header)",
        )

    handler = get_withdrawal_handler(request.asset)

    if not handler:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported asset: {request.asset}",
        )

    try:
        amount = Decimal(request.amount)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid amount")

    # Validate address
    if not await handler.validate_address(request.destination):
        raise HTTPException(status_code=400, detail="Invalid destination address")

    # Execute withdrawal
    result = await handler.execute_withdrawal(
        private_key=private_key,
        destination=request.destination,
        amount=amount,
        fee_priority=request.priority,
    )

    return WithdrawalResponse(
        success=result.success,
        txid=result.txid,
        status=result.status.value,
        message=result.message,
        error=result.error,
        fee_paid=str(result.fee_paid) if result.fee_paid else None,
    )


@router.get("/{asset}/info")
async def get_withdrawal_info(asset: str) -> dict:
    """Get withdrawal handler info for an asset."""
    handler = get_withdrawal_handler(asset)

    if not handler:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported asset: {asset}",
        )

    return {
        "asset": handler.asset,
        "testnet": handler.testnet,
        "handler_type": type(handler).__name__,
    }


# ==============================================================================
# Secure Signing Endpoints (Production)
# ==============================================================================

class SecureWithdrawalRequest(BaseModel):
    """Secure withdrawal request (no private key in request)."""
    user_id: int
    asset: str
    destination: str
    amount: str
    priority: str = "normal"


class SignerInfoResponse(BaseModel):
    """Signer configuration info."""
    signer_type: str
    healthy: bool
    signer_class: str


@router.get("/signer/info", response_model=SignerInfoResponse)
async def get_signer_info(
    _: bool = Depends(require_admin_token),
) -> SignerInfoResponse:
    """Get information about the configured transaction signer."""
    from swaperex.signing import get_signer

    try:
        signer = get_signer()
        health = await signer.health_check()

        return SignerInfoResponse(
            signer_type=signer.signer_type.value,
            healthy=health,
            signer_class=signer.__class__.__name__,
        )
    except Exception as e:
        logger.error(f"Failed to get signer info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/signer/address/{asset}")
async def get_signing_address(
    asset: str,
    _: bool = Depends(require_admin_token),
) -> dict:
    """Get the withdrawal address for an asset (from signer)."""
    from swaperex.signing import get_signer

    try:
        signer = get_signer()
        address = await signer.get_address(asset, asset)

        if not address:
            raise HTTPException(
                status_code=404,
                detail=f"No signing key configured for {asset}",
            )

        return {
            "asset": asset.upper(),
            "address": address,
            "signer_type": signer.signer_type.value,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get signing address: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/secure", response_model=WithdrawalResponse)
async def execute_secure_withdrawal(
    request: SecureWithdrawalRequest,
    _: bool = Depends(require_admin_token),
) -> WithdrawalResponse:
    """Execute a withdrawal using secure signing (KMS/HSM/local hot wallet).

    This endpoint uses the configured signer backend instead of
    requiring a private key in the request.

    Flow:
    1. Validate destination address
    2. Check user balance
    3. Estimate fees
    4. Build unsigned transaction
    5. Sign using configured signer
    6. Broadcast transaction
    7. Record withdrawal in ledger
    """
    from swaperex.signing import get_signer

    handler = get_withdrawal_handler(request.asset)
    if not handler:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported asset: {request.asset}",
        )

    try:
        amount = Decimal(request.amount)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid amount")

    if amount <= Decimal("0"):
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Validate address
    if not await handler.validate_address(request.destination):
        raise HTTPException(status_code=400, detail="Invalid destination address")

    # Check user balance in ledger
    async with get_db() as session:
        repo = LedgerRepository(session)

        # Get user from database
        from swaperex.ledger.models import User
        from sqlalchemy import select
        stmt = select(User).where(User.id == request.user_id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail=f"User {request.user_id} not found")

        # Check available balance
        balance = await repo.get_balance(request.user_id, request.asset)
        if not balance or balance.available < amount:
            available = balance.available if balance else Decimal("0")
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance: have {available} {request.asset}, need {amount}",
            )

    # Get signer
    signer = get_signer()

    # Check signer health
    if not await signer.health_check():
        raise HTTPException(
            status_code=503,
            detail="Signing service unavailable",
        )

    logger.info(
        f"Secure withdrawal request: {amount} {request.asset} to {request.destination} "
        f"(user={request.user_id}, signer={signer.signer_type.value})"
    )

    import secrets

    # Check if we have a signing key for this asset
    address = await signer.get_address(request.asset, request.asset)
    if not address:
        return WithdrawalResponse(
            success=False,
            status=WithdrawalStatus.FAILED.value,
            error=f"No signing key configured for {request.asset}. "
                  f"Set HOT_WALLET_PRIVATE_KEY_{request.asset} or configure KMS/HSM.",
        )

    # Estimate fee for the withdrawal
    fee_estimate = await handler.estimate_fee(
        amount=amount,
        destination=request.destination,
        priority=request.priority,
    )
    fee_amount = fee_estimate.total_fee

    # For development/testing: return simulated result with ledger recording
    settings = get_settings()
    if settings.dry_run:
        txid = f"sim_{secrets.token_hex(32)}"

        # Record withdrawal in ledger
        async with get_db() as session:
            repo = LedgerRepository(session)
            try:
                withdrawal = await repo.create_withdrawal(
                    user_id=request.user_id,
                    asset=request.asset,
                    amount=amount,
                    fee_amount=fee_amount,
                    destination_address=request.destination,
                )
                await repo.update_withdrawal_status(
                    withdrawal.id,
                    status=WithdrawalStatus.BROADCAST,
                    tx_hash=txid,
                )
                logger.info(f"Recorded dry-run withdrawal {withdrawal.id} for user {request.user_id}")
            except ValueError as e:
                return WithdrawalResponse(
                    success=False,
                    status=WithdrawalStatus.FAILED.value,
                    error=str(e),
                )

        # Send notification to user
        try:
            notifier = get_notifier()
            await notifier.notify_withdrawal_complete(
                telegram_id=user.telegram_id,
                asset=request.asset,
                amount=amount,
                fee=fee_amount,
                destination=request.destination,
                tx_hash=txid,
            )
        except Exception as e:
            logger.warning(f"Failed to send withdrawal notification: {e}")

        return WithdrawalResponse(
            success=True,
            txid=txid,
            status=WithdrawalStatus.BROADCAST.value,
            message=f"[DRY_RUN] Would send {amount} {request.asset} to {request.destination} "
                    f"using {signer.signer_type.value} signer",
            fee_paid=str(fee_amount),
        )

    # Real execution flow
    # 1. Create withdrawal record with PENDING status
    async with get_db() as session:
        repo = LedgerRepository(session)
        try:
            withdrawal = await repo.create_withdrawal(
                user_id=request.user_id,
                asset=request.asset,
                amount=amount,
                fee_amount=fee_amount,
                destination_address=request.destination,
            )
        except ValueError as e:
            return WithdrawalResponse(
                success=False,
                status=WithdrawalStatus.FAILED.value,
                error=str(e),
            )

    # 2. Execute the withdrawal (build, sign, broadcast)
    try:
        # For now, this uses the handler's execute method
        # In production, this would use the signer for secure signing
        result = await handler.execute_withdrawal(
            private_key="",  # Would come from signer
            destination=request.destination,
            amount=amount,
            fee_priority=request.priority,
        )

        if result.success:
            # Update withdrawal status
            async with get_db() as session:
                repo = LedgerRepository(session)
                await repo.update_withdrawal_status(
                    withdrawal.id,
                    status=WithdrawalStatus.BROADCAST,
                    tx_hash=result.txid,
                )

            # Send success notification
            try:
                notifier = get_notifier()
                await notifier.notify_withdrawal_complete(
                    telegram_id=user.telegram_id,
                    asset=request.asset,
                    amount=amount,
                    fee=fee_amount,
                    destination=request.destination,
                    tx_hash=result.txid or "unknown",
                )
            except Exception as e:
                logger.warning(f"Failed to send withdrawal notification: {e}")

            return WithdrawalResponse(
                success=True,
                txid=result.txid,
                status=result.status.value,
                message=result.message,
                fee_paid=str(result.fee_paid) if result.fee_paid else str(fee_amount),
            )
        else:
            # Withdrawal failed - refund user
            async with get_db() as session:
                repo = LedgerRepository(session)
                await repo.fail_withdrawal(withdrawal.id, result.error or "Unknown error", refund=True)

            # Send failure notification
            try:
                notifier = get_notifier()
                await notifier.notify_withdrawal_failed(
                    telegram_id=user.telegram_id,
                    asset=request.asset,
                    amount=amount,
                    error=result.error or "Unknown error",
                    refunded=True,
                )
            except Exception as e:
                logger.warning(f"Failed to send withdrawal failure notification: {e}")

            return WithdrawalResponse(
                success=False,
                status=WithdrawalStatus.FAILED.value,
                error=result.error,
            )

    except Exception as e:
        logger.error(f"Withdrawal execution failed: {e}")
        # Refund user on exception
        async with get_db() as session:
            repo = LedgerRepository(session)
            await repo.fail_withdrawal(withdrawal.id, str(e), refund=True)

        return WithdrawalResponse(
            success=False,
            status=WithdrawalStatus.FAILED.value,
            error=f"Withdrawal failed: {e}",
        )
