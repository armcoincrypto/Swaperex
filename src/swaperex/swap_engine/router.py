"""Swap Router - Central coordinator for hybrid swap engine.

Flow:
1. Try mm2 atomic swap first (cheapest, P2P)
2. Wait up to WAIT_MS for mm2 counterparty
3. If timeout/no match:
   - UTXO chains (BTC/LTC/DASH) → THORChain
   - Smart contract chains (ETH/BSC/TRX) → DEX
4. Monitor and finalize swap

Configuration:
- WAIT_MS: 180000 (3 minutes) for mm2 matching
- MIN_SWAP_USD: 100 (minimum swap amount)
- PLATFORM_FEE_PCT: 0.5%
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Optional, Callable, Any

logger = logging.getLogger(__name__)


class SwapRoute(str, Enum):
    """Available swap routes."""
    MM2 = "mm2"
    THORCHAIN = "thorchain"
    DEX = "dex"
    SIMULATED = "simulated"


class SwapState(str, Enum):
    """Swap state machine states."""
    CREATED = "created"
    RESERVED = "reserved"
    MM2_WAITING = "mm2_waiting"
    MM2_MATCHED = "mm2_matched"
    MM2_INPROGRESS = "mm2_inprogress"
    THOR_PENDING = "thor_pending"
    THOR_INBOUND_SENT = "thor_inbound_sent"
    THOR_OUTBOUND_PENDING = "thor_outbound_pending"
    DEX_PENDING = "dex_pending"
    DEX_BROADCASTED = "dex_broadcasted"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


@dataclass
class SwapConfig:
    """Configuration for swap router."""

    # Timing
    mm2_wait_ms: int = 180000  # 3 minutes
    mm2_poll_ms: int = 5000    # Poll every 5 seconds

    # Limits
    min_swap_usd: Decimal = Decimal("100")  # Minimum $100
    max_swap_usd: Decimal = Decimal("100000")  # Maximum $100k

    # Fees
    platform_fee_pct: Decimal = Decimal("0.5")  # 0.5% platform fee

    # Assets
    utxo_chains: list[str] = field(default_factory=lambda: ["BTC", "LTC", "DASH", "DOGE", "BCH"])
    smart_contract_chains: list[str] = field(default_factory=lambda: ["ETH", "BSC", "TRX", "AVAX", "MATIC"])

    # mm2 config
    mm2_enabled: bool = True
    mm2_rpc_url: str = "http://127.0.0.1:7783"

    # THORChain config
    thor_enabled: bool = True
    thor_min_usd: Decimal = Decimal("50")  # THORChain min $50 (outbound fees)

    # DEX config
    dex_enabled: bool = True


@dataclass
class SwapQuote:
    """Quote for a swap."""
    route: SwapRoute
    from_asset: str
    to_asset: str
    from_amount: Decimal
    to_amount: Decimal
    fee_usd: Decimal
    slippage_pct: Decimal
    estimated_time_seconds: int
    expires_at: int  # Unix timestamp

    # Route-specific details
    mm2_order_id: Optional[str] = None
    thor_vault_address: Optional[str] = None
    thor_memo: Optional[str] = None
    dex_router: Optional[str] = None
    dex_path: Optional[list[str]] = None

    extra: dict = field(default_factory=dict)


@dataclass
class SwapResult:
    """Result of swap execution."""
    success: bool
    route: SwapRoute
    state: SwapState
    from_amount: Decimal
    to_amount: Optional[Decimal] = None
    inbound_txid: Optional[str] = None
    outbound_txid: Optional[str] = None
    error: Optional[str] = None
    execution_time_ms: int = 0


class SwapRouter:
    """Central coordinator for hybrid swap engine.

    Tries mm2 first, falls back to THORChain/DEX after timeout.
    """

    def __init__(
        self,
        config: Optional[SwapConfig] = None,
        mm2_adapter=None,
        thor_adapter=None,
        dex_adapter=None,
    ):
        self.config = config or SwapConfig()
        self.mm2 = mm2_adapter
        self.thor = thor_adapter
        self.dex = dex_adapter

        # Callbacks for state updates
        self._on_state_change: Optional[Callable[[int, SwapState, dict], Any]] = None

    def set_state_callback(self, callback: Callable[[int, SwapState, dict], Any]):
        """Set callback for swap state changes."""
        self._on_state_change = callback

    async def _notify_state(self, swap_id: int, state: SwapState, data: dict = None):
        """Notify state change."""
        if self._on_state_change:
            await self._on_state_change(swap_id, state, data or {})

    def get_route_for_pair(self, from_asset: str, to_asset: str) -> SwapRoute:
        """Determine best route based on asset types."""
        from_asset = from_asset.upper()
        to_asset = to_asset.upper()

        # If mm2 is enabled and we have the adapter, try mm2 first
        if self.config.mm2_enabled and self.mm2:
            return SwapRoute.MM2

        # UTXO → anything: THORChain
        if from_asset in self.config.utxo_chains:
            return SwapRoute.THORCHAIN

        # Smart contract chains: DEX
        if from_asset in self.config.smart_contract_chains:
            return SwapRoute.DEX

        # Fallback to simulated
        return SwapRoute.SIMULATED

    def get_fallback_route(self, from_asset: str) -> SwapRoute:
        """Get fallback route when mm2 times out."""
        from_asset = from_asset.upper()

        if from_asset in self.config.utxo_chains:
            return SwapRoute.THORCHAIN
        else:
            return SwapRoute.DEX

    async def get_all_quotes(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        dest_address: Optional[str] = None,
    ) -> list[SwapQuote]:
        """Get quotes from all available routes."""
        quotes = []

        # mm2 quote
        if self.config.mm2_enabled and self.mm2:
            try:
                mm2_quote = await self.mm2.get_quote(from_asset, to_asset, amount)
                if mm2_quote:
                    quotes.append(mm2_quote)
            except Exception as e:
                logger.warning(f"mm2 quote failed: {e}")

        # THORChain quote (for UTXO chains)
        if self.config.thor_enabled and self.thor:
            try:
                thor_quote = await self.thor.get_quote(
                    from_asset, to_asset, amount, dest_address
                )
                if thor_quote:
                    quotes.append(thor_quote)
            except Exception as e:
                logger.warning(f"THORChain quote failed: {e}")

        # DEX quote (for smart contract chains)
        if self.config.dex_enabled and self.dex:
            try:
                dex_quote = await self.dex.get_quote(
                    from_asset, to_asset, amount, dest_address
                )
                if dex_quote:
                    quotes.append(dex_quote)
            except Exception as e:
                logger.warning(f"DEX quote failed: {e}")

        # Sort by best output amount
        quotes.sort(key=lambda q: q.to_amount, reverse=True)

        return quotes

    async def execute_swap(
        self,
        swap_id: int,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        dest_address: str,
        user_id: int,
    ) -> SwapResult:
        """Execute swap with mm2-first, fallback strategy.

        1. Try mm2 (P2P atomic swap)
        2. Wait up to 3 minutes for counterparty
        3. If timeout: fallback to THORChain/DEX
        """
        start_time = time.time()

        await self._notify_state(swap_id, SwapState.CREATED)

        # Step 1: Reserve funds
        await self._notify_state(swap_id, SwapState.RESERVED)

        # Step 2: Try mm2 first
        if self.config.mm2_enabled and self.mm2:
            result = await self._try_mm2_swap(
                swap_id, from_asset, to_asset, amount, dest_address
            )

            if result.success:
                result.execution_time_ms = int((time.time() - start_time) * 1000)
                return result

            # mm2 failed or timed out - continue to fallback
            logger.info(f"Swap {swap_id}: mm2 not matched, trying fallback")

        # Step 3: Fallback based on chain type
        fallback_route = self.get_fallback_route(from_asset)

        if fallback_route == SwapRoute.THORCHAIN and self.thor:
            result = await self._execute_thorchain_swap(
                swap_id, from_asset, to_asset, amount, dest_address
            )
        elif fallback_route == SwapRoute.DEX and self.dex:
            result = await self._execute_dex_swap(
                swap_id, from_asset, to_asset, amount, dest_address
            )
        else:
            result = SwapResult(
                success=False,
                route=SwapRoute.SIMULATED,
                state=SwapState.FAILED,
                from_amount=amount,
                error="No swap route available",
            )

        result.execution_time_ms = int((time.time() - start_time) * 1000)
        return result

    async def _try_mm2_swap(
        self,
        swap_id: int,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        dest_address: str,
    ) -> SwapResult:
        """Try mm2 atomic swap with timeout."""
        await self._notify_state(swap_id, SwapState.MM2_WAITING)

        try:
            # Create mm2 order
            order = await self.mm2.create_order(from_asset, to_asset, amount)

            if not order:
                return SwapResult(
                    success=False,
                    route=SwapRoute.MM2,
                    state=SwapState.MM2_WAITING,
                    from_amount=amount,
                    error="Failed to create mm2 order",
                )

            # Wait for match with timeout
            deadline = time.time() + (self.config.mm2_wait_ms / 1000)
            poll_interval = self.config.mm2_poll_ms / 1000

            while time.time() < deadline:
                status = await self.mm2.check_order_status(order["order_id"])

                if status.get("matched"):
                    await self._notify_state(swap_id, SwapState.MM2_MATCHED)

                    # Execute the matched swap
                    result = await self.mm2.execute_swap(order["order_id"])

                    if result.get("success"):
                        await self._notify_state(swap_id, SwapState.COMPLETED)
                        return SwapResult(
                            success=True,
                            route=SwapRoute.MM2,
                            state=SwapState.COMPLETED,
                            from_amount=amount,
                            to_amount=Decimal(str(result.get("to_amount", 0))),
                            inbound_txid=result.get("maker_txid"),
                            outbound_txid=result.get("taker_txid"),
                        )

                if status.get("failed"):
                    break

                await asyncio.sleep(poll_interval)

            # Timeout - cancel order
            await self.mm2.cancel_order(order["order_id"])

            return SwapResult(
                success=False,
                route=SwapRoute.MM2,
                state=SwapState.MM2_WAITING,
                from_amount=amount,
                error="mm2 timeout - no counterparty",
            )

        except Exception as e:
            logger.error(f"mm2 swap error: {e}")
            return SwapResult(
                success=False,
                route=SwapRoute.MM2,
                state=SwapState.FAILED,
                from_amount=amount,
                error=str(e),
            )

    async def _execute_thorchain_swap(
        self,
        swap_id: int,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        dest_address: str,
    ) -> SwapResult:
        """Execute swap via THORChain."""
        await self._notify_state(swap_id, SwapState.THOR_PENDING)

        try:
            # Get quote with vault address
            quote = await self.thor.get_quote(from_asset, to_asset, amount, dest_address)

            if not quote:
                return SwapResult(
                    success=False,
                    route=SwapRoute.THORCHAIN,
                    state=SwapState.FAILED,
                    from_amount=amount,
                    error="No THORChain quote available",
                )

            # Send funds to THORChain vault
            await self._notify_state(swap_id, SwapState.THOR_INBOUND_SENT, {
                "vault_address": quote.thor_vault_address,
                "memo": quote.thor_memo,
            })

            # Execute the inbound transaction
            inbound_result = await self.thor.send_inbound(
                from_asset=from_asset,
                amount=amount,
                vault_address=quote.thor_vault_address,
                memo=quote.thor_memo,
            )

            if not inbound_result.get("success"):
                return SwapResult(
                    success=False,
                    route=SwapRoute.THORCHAIN,
                    state=SwapState.FAILED,
                    from_amount=amount,
                    error=inbound_result.get("error", "Inbound tx failed"),
                )

            inbound_txid = inbound_result.get("txid")

            # Wait for outbound
            await self._notify_state(swap_id, SwapState.THOR_OUTBOUND_PENDING, {
                "inbound_txid": inbound_txid,
            })

            # Monitor for outbound (can take 5-15 minutes)
            outbound = await self.thor.wait_for_outbound(inbound_txid, timeout=1200)

            if outbound.get("success"):
                await self._notify_state(swap_id, SwapState.COMPLETED)
                return SwapResult(
                    success=True,
                    route=SwapRoute.THORCHAIN,
                    state=SwapState.COMPLETED,
                    from_amount=amount,
                    to_amount=Decimal(str(outbound.get("amount_out", 0))),
                    inbound_txid=inbound_txid,
                    outbound_txid=outbound.get("outbound_txid"),
                )
            else:
                return SwapResult(
                    success=False,
                    route=SwapRoute.THORCHAIN,
                    state=SwapState.FAILED,
                    from_amount=amount,
                    inbound_txid=inbound_txid,
                    error=outbound.get("error", "Outbound failed"),
                )

        except Exception as e:
            logger.error(f"THORChain swap error: {e}")
            return SwapResult(
                success=False,
                route=SwapRoute.THORCHAIN,
                state=SwapState.FAILED,
                from_amount=amount,
                error=str(e),
            )

    async def _execute_dex_swap(
        self,
        swap_id: int,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        dest_address: str,
    ) -> SwapResult:
        """Execute swap via on-chain DEX."""
        await self._notify_state(swap_id, SwapState.DEX_PENDING)

        try:
            # Get quote
            quote = await self.dex.get_quote(from_asset, to_asset, amount, dest_address)

            if not quote:
                return SwapResult(
                    success=False,
                    route=SwapRoute.DEX,
                    state=SwapState.FAILED,
                    from_amount=amount,
                    error="No DEX quote available",
                )

            # Execute swap transaction
            result = await self.dex.execute_swap(
                from_asset=from_asset,
                to_asset=to_asset,
                amount=amount,
                min_out=quote.to_amount * Decimal("0.99"),  # 1% slippage
                dest_address=dest_address,
            )

            if result.get("success"):
                await self._notify_state(swap_id, SwapState.COMPLETED)
                return SwapResult(
                    success=True,
                    route=SwapRoute.DEX,
                    state=SwapState.COMPLETED,
                    from_amount=amount,
                    to_amount=Decimal(str(result.get("amount_out", 0))),
                    outbound_txid=result.get("txid"),
                )
            else:
                return SwapResult(
                    success=False,
                    route=SwapRoute.DEX,
                    state=SwapState.FAILED,
                    from_amount=amount,
                    error=result.get("error", "DEX swap failed"),
                )

        except Exception as e:
            logger.error(f"DEX swap error: {e}")
            return SwapResult(
                success=False,
                route=SwapRoute.DEX,
                state=SwapState.FAILED,
                from_amount=amount,
                error=str(e),
            )


def get_swap_router(config: Optional[SwapConfig] = None) -> SwapRouter:
    """Get swap router with default adapters."""
    # Import adapters lazily to avoid circular imports
    router = SwapRouter(config=config)

    # TODO: Initialize adapters when available
    # router.mm2 = MM2Adapter(config.mm2_rpc_url)
    # router.thor = THORChainSwapAdapter()
    # router.dex = DEXAdapter()

    return router
