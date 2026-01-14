"""Withdrawal API endpoints for non-custodial web mode.

These endpoints provide withdrawal transaction TEMPLATES only.
NO execution happens server-side - clients sign and broadcast themselves.

SECURITY: Backend withdrawals are BLOCKED in WEB_NON_CUSTODIAL mode.
All execution must happen client-side.
"""

import logging

from fastapi import APIRouter, HTTPException

from swaperex.config import get_settings, ExecutionMode
from swaperex.web.contracts.withdrawals import (
    WithdrawalRequest,
    WithdrawalResponse,
)
from swaperex.web.services.withdrawal_service import WithdrawalService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/withdrawals", tags=["withdrawals"])

# Service instance
_withdrawal_service = WithdrawalService()


@router.post("/template", response_model=WithdrawalResponse)
async def get_withdrawal_template(request: WithdrawalRequest) -> WithdrawalResponse:
    """Get a withdrawal transaction template.

    This endpoint returns an UNSIGNED transaction template.
    The client must:
    1. Review the transaction details
    2. Sign with their private key
    3. Broadcast to the network

    NO execution happens server-side. This is non-custodial.

    SECURITY NOTE:
    - Backend withdrawal execution is BLOCKED
    - Private keys are NEVER accessed server-side
    - Transaction signing is NEVER done server-side
    """
    settings = get_settings()

    # Extra safety: Log and warn if this endpoint is hit
    if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
        logger.info(
            "Withdrawal template requested in WEB_NON_CUSTODIAL mode - "
            "returning unsigned transaction only"
        )

    return await _withdrawal_service.get_withdrawal_template(request)


@router.post("/execute")
async def execute_withdrawal_blocked() -> dict:
    """Backend withdrawal execution is DISABLED in web mode.

    This endpoint exists to explicitly block any attempt to execute
    withdrawals server-side. All execution must happen client-side.

    Raises:
        HTTPException: Always, with explanation
    """
    settings = get_settings()

    logger.warning(
        "SECURITY ALERT: Attempted to call /execute endpoint in %s mode. "
        "Backend withdrawal execution is BLOCKED.",
        settings.mode.value,
    )

    if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Backend withdrawal execution DISABLED in WEB mode",
                "message": "Use /template endpoint to get unsigned transaction, then sign and broadcast client-side",
                "mode": settings.mode.value,
            }
        )
    else:
        # In TELEGRAM_CUSTODIAL mode, direct user to use Telegram bot
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Use Telegram bot for custodial withdrawals",
                "message": "This web endpoint is for non-custodial mode only",
                "mode": settings.mode.value,
            }
        )


@router.get("/fee-estimate")
async def estimate_withdrawal_fee(
    asset: str,
    chain: str = "ethereum",
) -> dict:
    """Estimate withdrawal fees without building full transaction.

    Returns estimated network fees for the given asset and chain.
    """
    from swaperex.web.services.withdrawal_service import CHAIN_CONFIG
    from decimal import Decimal

    config = CHAIN_CONFIG.get(chain.lower())
    if not config:
        raise HTTPException(status_code=400, detail=f"Unsupported chain: {chain}")

    # Simple fee estimation
    if chain.lower() in ("ethereum", "bsc", "polygon"):
        is_token = asset.upper() != config["native"]
        gas_limit = config["gas_limit_token"] if is_token else config["gas_limit_native"]
        gas_price_wei = config["gas_price_gwei"] * Decimal(10**9)
        fee = Decimal(gas_limit) * gas_price_wei / Decimal(10**18)

        return {
            "success": True,
            "asset": asset,
            "chain": chain,
            "estimated_fee": str(fee),
            "fee_asset": config["native"],
            "gas_limit": gas_limit,
            "gas_price_gwei": str(config["gas_price_gwei"]),
        }

    elif chain.lower() == "bitcoin":
        fee_btc = Decimal("0.00005")  # ~5000 sats
        return {
            "success": True,
            "asset": asset,
            "chain": chain,
            "estimated_fee": str(fee_btc),
            "fee_asset": "BTC",
            "sat_per_vbyte": config["sat_per_vbyte"],
        }

    else:
        return {
            "success": True,
            "asset": asset,
            "chain": chain,
            "estimated_fee": "varies",
            "note": "Fee estimation not available for this chain",
        }
