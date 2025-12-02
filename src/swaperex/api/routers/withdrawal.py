"""Withdrawal API endpoints."""

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from swaperex.config import get_settings
from swaperex.withdrawal.factory import (
    get_supported_withdrawal_assets,
    get_withdrawal_handler,
)

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
