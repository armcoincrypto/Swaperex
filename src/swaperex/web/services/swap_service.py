"""Swap service for non-custodial web mode.

This service provides swap quotes with unsigned transaction data.
Actual swap execution happens client-side - the backend NEVER signs or broadcasts.

SECURITY: This service does NOT:
- Access private keys
- Sign transactions
- Broadcast transactions

It ONLY:
- Fetches quotes from DEX aggregators
- Builds unsigned transaction calldata
- Returns data for client-side execution
"""

import logging
import time
import uuid
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.config import get_settings, ExecutionMode
from swaperex.web.contracts.swaps import (
    SwapQuoteRequest,
    SwapQuoteResponse,
    SwapRouteMetadata,
    RouteStep,
    GasEstimate,
    UnsignedSwapTransaction,
)

logger = logging.getLogger(__name__)

# Chain configurations
CHAIN_CONFIG = {
    "ethereum": {"chain_id": 1, "native": "ETH", "gas_price_gwei": Decimal("30")},
    "bsc": {"chain_id": 56, "native": "BNB", "gas_price_gwei": Decimal("3")},
    "polygon": {"chain_id": 137, "native": "MATIC", "gas_price_gwei": Decimal("50")},
    "avalanche": {"chain_id": 43114, "native": "AVAX", "gas_price_gwei": Decimal("25")},
    "arbitrum": {"chain_id": 42161, "native": "ETH", "gas_price_gwei": Decimal("0.1")},
}

# 1inch router addresses (v6)
ONEINCH_ROUTER = "0x111111125421cA6dc452d289314280a0f8842A65"
ONEINCH_API = "https://api.1inch.dev/swap/v6.0"

# Native token address (used by 1inch for native swaps)
NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"


class SwapService:
    """Non-custodial swap service that returns unsigned transactions.

    This service:
    1. Fetches quotes from DEX aggregators
    2. Builds unsigned transaction calldata
    3. Returns all data needed for client-side signing

    NO execution happens server-side in WEB_NON_CUSTODIAL mode.
    """

    def __init__(self):
        """Initialize swap service."""
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=30.0)
        return self._http_client

    def _check_mode(self) -> None:
        """Verify we're in web mode for non-custodial operations."""
        settings = get_settings()
        if settings.mode != ExecutionMode.WEB_NON_CUSTODIAL:
            logger.warning(
                "SwapService should only be used in WEB_NON_CUSTODIAL mode. "
                "Current mode: %s",
                settings.mode.value
            )

    async def get_swap_quote(self, request: SwapQuoteRequest) -> SwapQuoteResponse:
        """Get a swap quote with unsigned transaction data.

        Args:
            request: Swap quote request parameters

        Returns:
            SwapQuoteResponse with quote and unsigned transaction
        """
        self._check_mode()

        try:
            # Determine chain
            chain = self._detect_chain(request.from_asset, request.to_asset, request.chain)
            if not chain:
                return self._error_response(
                    request, f"Cannot determine chain for {request.from_asset}/{request.to_asset}"
                )

            chain_config = CHAIN_CONFIG.get(chain)
            if not chain_config:
                return self._error_response(request, f"Unsupported chain: {chain}")

            # Try to get quote from 1inch (or fallback to simulated)
            quote_data = await self._fetch_1inch_quote(
                chain=chain,
                from_asset=request.from_asset,
                to_asset=request.to_asset,
                amount=request.amount,
                from_address=request.from_address,
                slippage=request.slippage,
            )

            if quote_data is None:
                # Fallback to simulated quote
                return await self._get_simulated_quote(request, chain)

            return self._build_response_from_1inch(request, chain, quote_data)

        except Exception as e:
            logger.error(f"Swap quote failed: {e}")
            return self._error_response(request, str(e))

    async def _fetch_1inch_quote(
        self,
        chain: str,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        from_address: str,
        slippage: Decimal,
    ) -> Optional[dict]:
        """Fetch quote and calldata from 1inch API.

        Returns None if API is unavailable or tokens not supported.
        """
        try:
            chain_id = CHAIN_CONFIG[chain]["chain_id"]

            # Get token addresses (would need token registry in production)
            from_token = self._get_token_address(from_asset, chain)
            to_token = self._get_token_address(to_asset, chain)

            if not from_token or not to_token:
                return None

            # Convert amount to wei (assuming 18 decimals)
            amount_wei = int(amount * Decimal(10**18))

            client = await self._get_client()

            # Get swap calldata from 1inch
            url = f"{ONEINCH_API}/{chain_id}/swap"
            params = {
                "src": from_token,
                "dst": to_token,
                "amount": str(amount_wei),
                "from": from_address,
                "slippage": str(slippage),
                "disableEstimate": "true",  # We'll estimate gas separately
            }

            # Note: In production, would need 1inch API key
            response = await client.get(url, params=params)

            if response.status_code == 200:
                return response.json()
            else:
                logger.debug(f"1inch API returned {response.status_code}")
                return None

        except Exception as e:
            logger.debug(f"1inch quote failed: {e}")
            return None

    async def _get_simulated_quote(
        self,
        request: SwapQuoteRequest,
        chain: str,
    ) -> SwapQuoteResponse:
        """Generate a simulated quote for testing/demo purposes.

        This is used when real DEX aggregator is unavailable.
        """
        from swaperex.routing.dry_run import DryRunRouter

        router = DryRunRouter()
        quote = await router.get_quote(
            from_asset=request.from_asset,
            to_asset=request.to_asset,
            amount=request.amount,
        )

        if quote is None:
            return self._error_response(
                request, f"No route available for {request.from_asset}/{request.to_asset}"
            )

        chain_config = CHAIN_CONFIG.get(chain, CHAIN_CONFIG["ethereum"])

        # Build simulated unsigned transaction
        gas_limit = 200000
        gas_price_wei = int(chain_config["gas_price_gwei"] * Decimal(10**9))

        minimum_received = quote.to_amount * (1 - request.slippage / 100)

        return SwapQuoteResponse(
            success=True,
            from_asset=quote.from_asset,
            to_asset=quote.to_asset,
            from_amount=quote.from_amount,
            to_amount=quote.to_amount,
            minimum_received=minimum_received,
            rate=quote.effective_rate,
            fee_amount=quote.fee_amount,
            fee_asset=quote.fee_asset,
            gas_estimate=GasEstimate(
                gas_limit=gas_limit,
                gas_price_gwei=chain_config["gas_price_gwei"],
                estimated_cost_native=Decimal(gas_limit * gas_price_wei) / Decimal(10**18),
                estimated_cost_usd=None,
            ),
            route=SwapRouteMetadata(
                provider="dry_run (simulated)",
                route_type="single",
                steps=[
                    RouteStep(
                        protocol="simulated",
                        from_token=request.from_asset,
                        to_token=request.to_asset,
                    )
                ],
                protocols_used=["simulated"],
                estimated_gas=gas_limit,
                price_impact_percent=Decimal("0.1"),
                minimum_received=minimum_received,
            ),
            transaction=UnsignedSwapTransaction(
                chain=chain,
                chain_id=chain_config["chain_id"],
                to=ONEINCH_ROUTER,
                value=hex(int(request.amount * Decimal(10**18))) if request.from_asset in ("ETH", "BNB", "MATIC", "AVAX") else "0x0",
                data="0x",  # Simulated - no real calldata
                gas_limit=hex(gas_limit),
                gas_price=hex(gas_price_wei),
                description=f"Simulated swap {request.from_asset} → {request.to_asset}",
                warnings=[
                    "This is a SIMULATED quote for demonstration.",
                    "Real DEX integration required for live swaps.",
                ],
            ),
            approval_needed=request.from_asset not in ("ETH", "BNB", "MATIC", "AVAX"),
            expires_at=int(time.time()) + 300,  # 5 minutes
            quote_id=str(uuid.uuid4()),
        )

    def _build_response_from_1inch(
        self,
        request: SwapQuoteRequest,
        chain: str,
        quote_data: dict,
    ) -> SwapQuoteResponse:
        """Build response from 1inch API data."""
        chain_config = CHAIN_CONFIG[chain]

        tx_data = quote_data.get("tx", {})
        to_amount = Decimal(quote_data.get("toAmount", "0")) / Decimal(10**18)
        from_amount = Decimal(quote_data.get("fromAmount", "0")) / Decimal(10**18)

        gas_limit = int(tx_data.get("gas", 200000))
        gas_price = int(tx_data.get("gasPrice", chain_config["gas_price_gwei"] * 10**9))

        minimum_received = to_amount * (1 - request.slippage / 100)

        # Extract route info
        protocols = []
        if "protocols" in quote_data:
            for route in quote_data["protocols"]:
                for step in route:
                    for hop in step:
                        protocols.append(hop.get("name", "unknown"))

        return SwapQuoteResponse(
            success=True,
            from_asset=request.from_asset,
            to_asset=request.to_asset,
            from_amount=from_amount,
            to_amount=to_amount,
            minimum_received=minimum_received,
            rate=to_amount / from_amount if from_amount > 0 else None,
            gas_estimate=GasEstimate(
                gas_limit=gas_limit,
                gas_price_gwei=Decimal(gas_price) / Decimal(10**9),
                estimated_cost_native=Decimal(gas_limit * gas_price) / Decimal(10**18),
                estimated_cost_usd=None,
            ),
            route=SwapRouteMetadata(
                provider="1inch",
                route_type="multi-hop" if len(protocols) > 1 else "single",
                protocols_used=list(set(protocols)),
                estimated_gas=gas_limit,
                minimum_received=minimum_received,
            ),
            transaction=UnsignedSwapTransaction(
                chain=chain,
                chain_id=chain_config["chain_id"],
                to=tx_data.get("to", ONEINCH_ROUTER),
                value=tx_data.get("value", "0"),
                data=tx_data.get("data", "0x"),
                gas_limit=hex(gas_limit),
                gas_price=hex(gas_price),
                description=f"Swap {request.from_asset} → {request.to_asset} via 1inch",
            ),
            approval_needed=request.from_asset not in ("ETH", "BNB", "MATIC", "AVAX"),
            expires_at=int(time.time()) + 300,
            quote_id=str(uuid.uuid4()),
        )

    def _detect_chain(
        self,
        from_asset: str,
        to_asset: str,
        preferred: Optional[str],
    ) -> Optional[str]:
        """Detect the appropriate chain for the swap."""
        if preferred:
            return preferred.lower()

        # Simple chain detection based on asset
        if any(a in ("BNB", "CAKE", "BUSD") for a in (from_asset, to_asset)):
            return "bsc"
        if any(a in ("MATIC", "QUICK") for a in (from_asset, to_asset)):
            return "polygon"
        if any(a in ("AVAX", "JOE") for a in (from_asset, to_asset)):
            return "avalanche"

        # Default to Ethereum for ERC-20 tokens
        return "ethereum"

    def _get_token_address(self, symbol: str, chain: str) -> Optional[str]:
        """Get token contract address.

        In production, would use a token registry.
        """
        # Native tokens
        if symbol in ("ETH", "BNB", "MATIC", "AVAX"):
            return NATIVE_TOKEN

        # Would need comprehensive token registry here
        # For now, return None to trigger simulated fallback
        return None

    def _error_response(
        self,
        request: SwapQuoteRequest,
        error: str,
    ) -> SwapQuoteResponse:
        """Build error response."""
        return SwapQuoteResponse(
            success=False,
            from_asset=request.from_asset,
            to_asset=request.to_asset,
            from_amount=request.amount,
            error=error,
        )

    async def close(self) -> None:
        """Close HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
