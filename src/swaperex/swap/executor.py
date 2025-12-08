"""Swap execution engine.

Handles actual swap execution across different DEXes:
- THORChain: Cross-chain swaps (BTC, LTC)
- Uniswap/PancakeSwap: EVM swaps (ETH, BNB, LINK)
- Jupiter: Solana swaps (SOL)
- Osmosis: Cosmos swaps (ATOM)
"""

import logging
from decimal import Decimal
from typing import Optional
from dataclasses import dataclass

from swaperex.config import get_settings
from swaperex.routing.base import Quote, SwapRoute, RouteProvider
from swaperex.routing.factory import create_default_aggregator

logger = logging.getLogger(__name__)


@dataclass
class SwapResult:
    """Result of a swap execution."""
    success: bool
    provider: str
    from_asset: str
    to_asset: str
    from_amount: Decimal
    to_amount: Optional[Decimal] = None
    tx_hash: Optional[str] = None
    error: Optional[str] = None
    status: str = "pending"
    instructions: Optional[dict] = None


class SwapExecutor:
    """Executes swaps across different DEXes."""

    def __init__(self):
        self.settings = get_settings()
        self.aggregator = create_default_aggregator()

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Get best quote for a swap."""
        return await self.aggregator.get_best_quote(
            from_asset, to_asset, amount, slippage
        )

    async def get_all_quotes(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage: Decimal = Decimal("0.01"),
    ) -> list[Quote]:
        """Get all available quotes for a swap."""
        return await self.aggregator.get_all_quotes(
            from_asset, to_asset, amount, slippage
        )

    async def execute_swap(
        self,
        quote: Quote,
        destination_address: str,
        user_id: int,
    ) -> SwapResult:
        """Execute a swap based on a quote.

        Args:
            quote: The quote to execute
            destination_address: Address to receive output
            user_id: User's Telegram ID for tracking

        Returns:
            SwapResult with execution details
        """
        provider_name = quote.provider

        # Find the provider
        provider = self._find_provider(provider_name)
        if not provider:
            return SwapResult(
                success=False,
                provider=provider_name,
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                error=f"Provider {provider_name} not found",
                status="failed",
            )

        # Create swap route
        route = SwapRoute(
            quote=quote,
            destination_address=destination_address,
            expiry_seconds=300,  # 5 minute expiry
        )

        # Execute based on provider type
        if "THORChain" in provider_name:
            return await self._execute_thorchain_swap(provider, route, user_id)
        elif provider_name in ["Uniswap", "PancakeSwap"]:
            return await self._execute_evm_swap(provider, route, user_id)
        elif provider_name == "Jupiter":
            return await self._execute_jupiter_swap(provider, route, user_id)
        elif provider_name == "Osmosis":
            return await self._execute_osmosis_swap(provider, route, user_id)
        elif provider_name == "DryRun":
            return await self._execute_dry_run_swap(quote, user_id)
        else:
            # Generic execution
            result = await provider.execute_swap(route)
            return SwapResult(
                success=result.get("success", False),
                provider=provider_name,
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                to_amount=quote.to_amount if result.get("success") else None,
                tx_hash=result.get("tx_hash"),
                error=result.get("error"),
                status="completed" if result.get("success") else "failed",
                instructions=result.get("instructions"),
            )

    def _find_provider(self, name: str) -> Optional[RouteProvider]:
        """Find provider by name."""
        for provider in self.aggregator.providers:
            if provider.name == name or name in provider.name:
                return provider
        return None

    async def _execute_thorchain_swap(
        self,
        provider: RouteProvider,
        route: SwapRoute,
        user_id: int,
    ) -> SwapResult:
        """Execute THORChain cross-chain swap.

        THORChain swaps work by:
        1. User sends funds to THORChain inbound address with memo
        2. THORChain processes the swap
        3. User receives output at destination address
        """
        result = await provider.execute_swap(route)

        if not result.get("success"):
            return SwapResult(
                success=False,
                provider=provider.name,
                from_asset=route.quote.from_asset,
                to_asset=route.quote.to_asset,
                from_amount=route.quote.from_amount,
                error=result.get("error", "THORChain execution failed"),
                status="failed",
            )

        instructions = result.get("instructions", {})

        return SwapResult(
            success=True,
            provider=provider.name,
            from_asset=route.quote.from_asset,
            to_asset=route.quote.to_asset,
            from_amount=route.quote.from_amount,
            to_amount=route.quote.to_amount,
            status="awaiting_deposit",
            instructions={
                "type": "thorchain",
                "action": "Send funds to inbound address",
                "inbound_address": instructions.get("inbound_address"),
                "memo": instructions.get("memo"),
                "amount": str(route.quote.from_amount),
                "asset": route.quote.from_asset,
                "expected_output": str(route.quote.to_amount),
                "output_asset": route.quote.to_asset,
                "destination": route.destination_address,
                "expiry": instructions.get("expiry_timestamp"),
            },
        )

    async def _execute_evm_swap(
        self,
        provider: RouteProvider,
        route: SwapRoute,
        user_id: int,
    ) -> SwapResult:
        """Execute EVM-based swap (Uniswap, PancakeSwap).

        For now, returns instructions for manual execution.
        Full automation requires web3.py integration.
        """
        result = await provider.execute_swap(route)
        details = route.quote.route_details or {}

        return SwapResult(
            success=True,
            provider=provider.name,
            from_asset=route.quote.from_asset,
            to_asset=route.quote.to_asset,
            from_amount=route.quote.from_amount,
            to_amount=route.quote.to_amount,
            status="pending_execution",
            instructions={
                "type": "evm",
                "action": "EVM swap pending",
                "router": details.get("router"),
                "from_token": details.get("from_token"),
                "to_token": details.get("to_token"),
                "amount": str(route.quote.from_amount),
                "min_output": str(route.quote.to_amount),
                "note": "Auto-execution coming soon",
            },
        )

    async def _execute_jupiter_swap(
        self,
        provider: RouteProvider,
        route: SwapRoute,
        user_id: int,
    ) -> SwapResult:
        """Execute Jupiter (Solana) swap.

        Jupiter provides a serialized transaction that needs signing.
        """
        result = await provider.execute_swap(route)

        if not result.get("success"):
            return SwapResult(
                success=False,
                provider=provider.name,
                from_asset=route.quote.from_asset,
                to_asset=route.quote.to_asset,
                from_amount=route.quote.from_amount,
                error=result.get("error", "Jupiter execution failed"),
                status="failed",
            )

        return SwapResult(
            success=True,
            provider=provider.name,
            from_asset=route.quote.from_asset,
            to_asset=route.quote.to_asset,
            from_amount=route.quote.from_amount,
            to_amount=route.quote.to_amount,
            status="pending_execution",
            instructions={
                "type": "jupiter",
                "action": "Solana swap pending",
                "transaction": result.get("transaction"),
                "note": "Auto-execution coming soon",
            },
        )

    async def _execute_osmosis_swap(
        self,
        provider: RouteProvider,
        route: SwapRoute,
        user_id: int,
    ) -> SwapResult:
        """Execute Osmosis (Cosmos) swap."""
        result = await provider.execute_swap(route)

        return SwapResult(
            success=True,
            provider=provider.name,
            from_asset=route.quote.from_asset,
            to_asset=route.quote.to_asset,
            from_amount=route.quote.from_amount,
            to_amount=route.quote.to_amount,
            status="pending_execution",
            instructions={
                "type": "osmosis",
                "action": "Cosmos swap pending",
                "note": "Auto-execution coming soon",
            },
        )

    async def _execute_dry_run_swap(
        self,
        quote: Quote,
        user_id: int,
    ) -> SwapResult:
        """Execute simulated swap (for testing)."""
        return SwapResult(
            success=True,
            provider="DryRun",
            from_asset=quote.from_asset,
            to_asset=quote.to_asset,
            from_amount=quote.from_amount,
            to_amount=quote.to_amount,
            tx_hash=f"dryrun_{user_id}_{quote.from_asset}_{quote.to_asset}",
            status="completed",
            instructions={
                "type": "simulated",
                "note": "This is a simulated swap (dry-run mode)",
            },
        )


# Singleton instance
_executor: Optional[SwapExecutor] = None


def get_swap_executor() -> SwapExecutor:
    """Get or create swap executor instance."""
    global _executor
    if _executor is None:
        _executor = SwapExecutor()
    return _executor
