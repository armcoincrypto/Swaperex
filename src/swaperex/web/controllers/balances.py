"""Balance API endpoints for non-custodial web mode.

These endpoints fetch balances from blockchain state (RPC/indexers),
NOT from the internal ledger. The ledger is only used in TELEGRAM_CUSTODIAL mode.

SECURITY: These endpoints:
- Only query public blockchain data
- Never access private keys
- Never sign transactions
"""

import logging

from fastapi import APIRouter, HTTPException

from swaperex.config import get_settings, ExecutionMode
from swaperex.web.contracts.balances import (
    WalletBalanceRequest,
    WalletBalanceResponse,
    MultiChainBalanceRequest,
    MultiChainBalanceResponse,
)
from swaperex.web.services.balance_service import BalanceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/balances", tags=["balances"])

# Service instance
_balance_service = BalanceService()


@router.post("/wallet", response_model=WalletBalanceResponse)
async def get_wallet_balance(request: WalletBalanceRequest) -> WalletBalanceResponse:
    """Get wallet balances from blockchain state.

    This endpoint fetches real balances from the blockchain via RPC calls,
    NOT from any internal database. It queries:
    - Native token balance (ETH, BNB, MATIC, etc.)
    - ERC-20 token balances

    Use this in WEB_NON_CUSTODIAL mode for accurate on-chain balances.

    Args:
        request: Wallet address and chain to query

    Returns:
        WalletBalanceResponse with native and token balances
    """
    settings = get_settings()

    if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
        logger.info(
            "Fetching blockchain balances (WEB_NON_CUSTODIAL mode) for %s",
            request.address[:10] + "...",
        )
    else:
        logger.info(
            "Note: Using blockchain balance query in %s mode",
            settings.mode.value,
        )

    return await _balance_service.get_wallet_balance(request)


@router.post("/multi-chain", response_model=MultiChainBalanceResponse)
async def get_multi_chain_balance(
    request: MultiChainBalanceRequest,
) -> MultiChainBalanceResponse:
    """Get wallet balances across multiple chains.

    Queries balances on all specified chains in parallel and
    aggregates the results with total USD value.

    Args:
        request: Wallet address and list of chains to query

    Returns:
        MultiChainBalanceResponse with per-chain balances and totals
    """
    return await _balance_service.get_multi_chain_balance(request)


@router.get("/address/{address}/chain/{chain}")
async def get_balance_simple(address: str, chain: str = "ethereum") -> dict:
    """Simple balance query endpoint.

    Convenience endpoint for quick balance lookups.

    Args:
        address: Wallet address
        chain: Chain ID (ethereum, bsc, polygon, etc.)

    Returns:
        Balance information
    """
    if not address.startswith("0x") or len(address) != 42:
        raise HTTPException(status_code=400, detail="Invalid address format")

    request = WalletBalanceRequest(
        address=address,
        chain=chain,
        include_tokens=True,
    )

    response = await _balance_service.get_wallet_balance(request)

    if not response.success:
        raise HTTPException(status_code=400, detail=response.error)

    return {
        "address": response.address,
        "chain": response.chain,
        "native": {
            "symbol": response.native_balance.symbol,
            "balance": str(response.native_balance.balance),
            "usd_value": str(response.native_balance.usd_value)
            if response.native_balance.usd_value
            else None,
        },
        "tokens": [
            {
                "symbol": t.symbol,
                "balance": str(t.balance),
                "contract": t.contract_address,
            }
            for t in response.token_balances
        ],
        "total_usd": str(response.total_usd_value) if response.total_usd_value else None,
    }


@router.get("/ledger-warning")
async def ledger_balance_warning() -> dict:
    """Explain the difference between ledger and chain balances.

    This endpoint exists to clarify the balance model:
    - TELEGRAM_CUSTODIAL: Balances from internal ledger (exchange-like)
    - WEB_NON_CUSTODIAL: Balances from blockchain state (real wallet)
    """
    settings = get_settings()

    return {
        "current_mode": settings.mode.value,
        "balance_source": (
            "internal_ledger"
            if settings.mode == ExecutionMode.TELEGRAM_CUSTODIAL
            else "blockchain_state"
        ),
        "explanation": {
            "TELEGRAM_CUSTODIAL": (
                "Balances are stored in an internal ledger database. "
                "Users deposit to custodial addresses and the bot manages funds. "
                "This is like a centralized exchange."
            ),
            "WEB_NON_CUSTODIAL": (
                "Balances are fetched directly from the blockchain via RPC calls. "
                "Users maintain control of their own wallets. "
                "The backend never holds funds."
            ),
        },
        "recommendation": (
            "In web mode, always use the /balances/wallet endpoint "
            "to fetch real blockchain balances. Do not rely on any cached state."
        ),
    }
