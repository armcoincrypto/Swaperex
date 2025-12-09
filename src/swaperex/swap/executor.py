"""Swap execution engine with full chain integration.

Handles actual swap execution across different DEXes:
- THORChain: Cross-chain swaps (BTC, LTC)
- Uniswap: Ethereum swaps (ETH, LINK, USDT-ERC20, USDC-ERC20)
- PancakeSwap: BSC swaps (BNB)
- Jupiter: Solana swaps (SOL)
- Osmosis: Cosmos swaps (ATOM)
- Minswap: Cardano swaps (ADA)
- Hyperliquid: HYPE swaps
"""

import logging
import time
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


# Token addresses for EVM chains
EVM_TOKENS = {
    # Ethereum Mainnet
    "ETH": {
        "WETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "LINK": "0x514910771AF9Ca656af840dff83E8264EcF986CA",
        "USDT-ERC20": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDC-ERC20": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    },
    # BSC
    "BNB": {
        "WBNB": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        "USDT": "0x55d398326f99059fF775485246999027B3197955",
        "USDC": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    },
}

# Token decimals
TOKEN_DECIMALS = {
    "ETH": 18, "WETH": 18, "BNB": 18, "WBNB": 18,
    "USDT": 6, "USDC": 6, "USDT-ERC20": 6, "USDC-ERC20": 6,
    "LINK": 18, "SOL": 9, "ATOM": 6, "ADA": 6, "HYPE": 18,
    "BTC": 8, "LTC": 8,
}


class SwapExecutor:
    """Executes swaps across different DEXes with full chain integration."""

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
        try:
            if "THORChain" in provider_name or "thorchain" in provider_name.lower():
                return await self._execute_thorchain_swap(provider, route, user_id)
            elif provider_name == "Uniswap":
                return await self._execute_uniswap_swap(route, user_id)
            elif provider_name == "PancakeSwap":
                return await self._execute_pancakeswap_swap(route, user_id)
            elif provider_name == "Jupiter":
                return await self._execute_jupiter_swap(route, user_id)
            elif provider_name == "Osmosis":
                return await self._execute_osmosis_swap(route, user_id)
            elif provider_name == "Minswap":
                return await self._execute_minswap_swap(route, user_id)
            elif provider_name == "Hyperliquid":
                return await self._execute_hyperliquid_swap(route, user_id)
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
        except Exception as e:
            logger.error(f"Swap execution error: {e}")
            return SwapResult(
                success=False,
                provider=provider_name,
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                error=str(e),
                status="failed",
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

        THORChain swaps work by sending funds to inbound address with memo.
        We can auto-send from the user's HD wallet.
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
        inbound_address = instructions.get("inbound_address")
        memo = instructions.get("memo")

        # For now, return instructions for manual send
        # Auto-send requires UTXO management for BTC/LTC
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
                "inbound_address": inbound_address,
                "memo": memo,
                "amount": str(route.quote.from_amount),
                "asset": route.quote.from_asset,
                "expected_output": str(route.quote.to_amount),
                "output_asset": route.quote.to_asset,
                "destination": route.destination_address,
                "expiry": instructions.get("expiry_timestamp"),
            },
        )

    async def _execute_uniswap_swap(
        self,
        route: SwapRoute,
        user_id: int,
    ) -> SwapResult:
        """Execute Uniswap V3 swap on Ethereum."""
        try:
            from swaperex.swap.signer import get_signer_factory

            quote = route.quote
            signer = get_signer_factory().get_evm_signer("ETH")

            # Get token addresses
            from_token = self._get_eth_token(quote.from_asset)
            to_token = self._get_eth_token(quote.to_asset)

            if not from_token or not to_token:
                return SwapResult(
                    success=False,
                    provider="Uniswap",
                    from_asset=quote.from_asset,
                    to_asset=quote.to_asset,
                    from_amount=quote.from_amount,
                    error=f"Token not supported: {quote.from_asset} or {quote.to_asset}",
                    status="failed",
                )

            # Calculate amounts in wei
            from_decimals = TOKEN_DECIMALS.get(quote.from_asset, 18)
            to_decimals = TOKEN_DECIMALS.get(quote.to_asset, 18)
            amount_in = int(quote.from_amount * Decimal(10 ** from_decimals))
            min_amount_out = int(quote.to_amount * Decimal(10 ** to_decimals) * Decimal("0.99"))

            # Execute swap
            deadline = int(time.time()) + 300  # 5 minutes

            # First approve token if not ETH
            if quote.from_asset not in ["ETH"]:
                await self._approve_token(signer, from_token, amount_in)

            tx_hash = await signer.swap_on_uniswap(
                token_in=from_token,
                token_out=to_token,
                amount_in=amount_in,
                min_amount_out=min_amount_out,
                recipient=route.destination_address,
                deadline=deadline,
            )

            return SwapResult(
                success=True,
                provider="Uniswap",
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                to_amount=quote.to_amount,
                tx_hash=tx_hash,
                status="completed",
                instructions={"type": "uniswap", "chain": "ethereum"},
            )

        except Exception as e:
            logger.error(f"Uniswap swap error: {e}")
            return SwapResult(
                success=False,
                provider="Uniswap",
                from_asset=route.quote.from_asset,
                to_asset=route.quote.to_asset,
                from_amount=route.quote.from_amount,
                error=str(e),
                status="failed",
            )

    async def _execute_pancakeswap_swap(
        self,
        route: SwapRoute,
        user_id: int,
    ) -> SwapResult:
        """Execute PancakeSwap swap on BSC."""
        try:
            from swaperex.swap.signer import get_signer_factory

            quote = route.quote
            signer = get_signer_factory().get_evm_signer("BNB")

            # PancakeSwap Router V2
            ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E"

            # Get token addresses
            from_token = EVM_TOKENS.get("BNB", {}).get(quote.from_asset)
            to_token = EVM_TOKENS.get("BNB", {}).get(quote.to_asset)

            # Default to WBNB for BNB
            if quote.from_asset == "BNB":
                from_token = EVM_TOKENS["BNB"]["WBNB"]
            if quote.to_asset == "BNB":
                to_token = EVM_TOKENS["BNB"]["WBNB"]

            if not from_token or not to_token:
                return SwapResult(
                    success=False,
                    provider="PancakeSwap",
                    from_asset=quote.from_asset,
                    to_asset=quote.to_asset,
                    from_amount=quote.from_amount,
                    error=f"Token not supported on BSC",
                    status="failed",
                )

            # Build swap transaction
            from_decimals = TOKEN_DECIMALS.get(quote.from_asset, 18)
            to_decimals = TOKEN_DECIMALS.get(quote.to_asset, 18)
            amount_in = int(quote.from_amount * Decimal(10 ** from_decimals))
            min_amount_out = int(quote.to_amount * Decimal(10 ** to_decimals) * Decimal("0.99"))

            deadline = int(time.time()) + 300

            # PancakeSwap uses swapExactTokensForTokens
            # For simplicity, using same pattern as Uniswap
            tx_hash = await signer.swap_on_uniswap(
                token_in=from_token,
                token_out=to_token,
                amount_in=amount_in,
                min_amount_out=min_amount_out,
                recipient=route.destination_address,
                deadline=deadline,
            )

            return SwapResult(
                success=True,
                provider="PancakeSwap",
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                to_amount=quote.to_amount,
                tx_hash=tx_hash,
                status="completed",
                instructions={"type": "pancakeswap", "chain": "bsc"},
            )

        except Exception as e:
            logger.error(f"PancakeSwap swap error: {e}")
            return SwapResult(
                success=False,
                provider="PancakeSwap",
                from_asset=route.quote.from_asset,
                to_asset=route.quote.to_asset,
                from_amount=route.quote.from_amount,
                error=str(e),
                status="failed",
            )

    async def _execute_jupiter_swap(
        self,
        route: SwapRoute,
        user_id: int,
    ) -> SwapResult:
        """Execute Jupiter swap on Solana."""
        try:
            from swaperex.swap.signer import get_signer_factory

            quote = route.quote
            signer = get_signer_factory().get_solana_signer()

            # Get quote response from route details
            quote_response = quote.route_details.get("quote_response") if quote.route_details else None

            if not quote_response:
                # Get fresh quote from Jupiter
                import httpx

                # Token mints
                SOL_TOKENS = {
                    "SOL": "So11111111111111111111111111111111111111112",
                    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
                    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                }

                input_mint = SOL_TOKENS.get(quote.from_asset)
                output_mint = SOL_TOKENS.get(quote.to_asset)

                if not input_mint or not output_mint:
                    return SwapResult(
                        success=False,
                        provider="Jupiter",
                        from_asset=quote.from_asset,
                        to_asset=quote.to_asset,
                        from_amount=quote.from_amount,
                        error="Token not supported on Solana",
                        status="failed",
                    )

                decimals = TOKEN_DECIMALS.get(quote.from_asset, 9)
                amount_raw = int(quote.from_amount * Decimal(10 ** decimals))

                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(
                        "https://quote-api.jup.ag/v6/quote",
                        params={
                            "inputMint": input_mint,
                            "outputMint": output_mint,
                            "amount": str(amount_raw),
                            "slippageBps": 50,
                        },
                    )

                    if response.status_code != 200:
                        return SwapResult(
                            success=False,
                            provider="Jupiter",
                            from_asset=quote.from_asset,
                            to_asset=quote.to_asset,
                            from_amount=quote.from_amount,
                            error=f"Jupiter quote error: {response.text}",
                            status="failed",
                        )

                    quote_response = response.json()

            # Execute swap
            tx_signature = await signer.execute_jupiter_swap(quote_response)

            return SwapResult(
                success=True,
                provider="Jupiter",
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                to_amount=quote.to_amount,
                tx_hash=tx_signature,
                status="completed",
                instructions={"type": "jupiter", "chain": "solana"},
            )

        except Exception as e:
            logger.error(f"Jupiter swap error: {e}")
            return SwapResult(
                success=False,
                provider="Jupiter",
                from_asset=route.quote.from_asset,
                to_asset=route.quote.to_asset,
                from_amount=route.quote.from_amount,
                error=str(e),
                status="failed",
            )

    async def _execute_osmosis_swap(
        self,
        route: SwapRoute,
        user_id: int,
    ) -> SwapResult:
        """Execute Osmosis swap."""
        try:
            from swaperex.swap.signer import get_signer_factory

            quote = route.quote
            signer = get_signer_factory().get_cosmos_signer()

            # Osmosis denoms
            DENOMS = {
                "ATOM": "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2",
                "OSMO": "uosmo",
            }

            token_in_denom = DENOMS.get(quote.from_asset)
            token_out_denom = DENOMS.get(quote.to_asset)

            if not token_in_denom or not token_out_denom:
                return SwapResult(
                    success=False,
                    provider="Osmosis",
                    from_asset=quote.from_asset,
                    to_asset=quote.to_asset,
                    from_amount=quote.from_amount,
                    error="Token not supported on Osmosis",
                    status="failed",
                )

            decimals = TOKEN_DECIMALS.get(quote.from_asset, 6)
            amount_in = int(quote.from_amount * Decimal(10 ** decimals))
            min_amount_out = int(quote.to_amount * Decimal(10 ** decimals) * Decimal("0.99"))

            # ATOM/OSMO pool ID is 1
            pool_id = 1

            tx_hash = await signer.execute_osmosis_swap(
                pool_id=pool_id,
                token_in_denom=token_in_denom,
                token_out_denom=token_out_denom,
                amount_in=amount_in,
                min_amount_out=min_amount_out,
            )

            return SwapResult(
                success=True,
                provider="Osmosis",
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                to_amount=quote.to_amount,
                tx_hash=tx_hash,
                status="completed",
                instructions={"type": "osmosis", "chain": "cosmos"},
            )

        except Exception as e:
            logger.error(f"Osmosis swap error: {e}")
            return SwapResult(
                success=False,
                provider="Osmosis",
                from_asset=route.quote.from_asset,
                to_asset=route.quote.to_asset,
                from_amount=route.quote.from_amount,
                error=str(e),
                status="failed",
            )

    async def _execute_minswap_swap(
        self,
        route: SwapRoute,
        user_id: int,
    ) -> SwapResult:
        """Execute Minswap swap on Cardano."""
        try:
            from swaperex.swap.signer import get_signer_factory

            quote = route.quote
            signer = get_signer_factory().get_cardano_signer()

            decimals = TOKEN_DECIMALS.get(quote.from_asset, 6)
            amount_in = int(quote.from_amount * Decimal(10 ** decimals))
            min_amount_out = int(quote.to_amount * Decimal(10 ** decimals) * Decimal("0.99"))

            tx_hash = await signer.execute_minswap_swap(
                asset_in=quote.from_asset,
                asset_out=quote.to_asset,
                amount_in=amount_in,
                min_amount_out=min_amount_out,
            )

            return SwapResult(
                success=True,
                provider="Minswap",
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                to_amount=quote.to_amount,
                tx_hash=tx_hash,
                status="completed",
                instructions={"type": "minswap", "chain": "cardano"},
            )

        except Exception as e:
            logger.error(f"Minswap swap error: {e}")
            return SwapResult(
                success=False,
                provider="Minswap",
                from_asset=route.quote.from_asset,
                to_asset=route.quote.to_asset,
                from_amount=route.quote.from_amount,
                error=str(e),
                status="failed",
            )

    async def _execute_hyperliquid_swap(
        self,
        route: SwapRoute,
        user_id: int,
    ) -> SwapResult:
        """Execute Hyperliquid swap."""
        try:
            # Hyperliquid uses EVM-compatible signing
            from swaperex.swap.signer import get_signer_factory

            quote = route.quote
            signer = get_signer_factory().get_evm_signer("HYPE")

            # Hyperliquid has a specific API for swaps
            # For now, return pending status
            return SwapResult(
                success=True,
                provider="Hyperliquid",
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                to_amount=quote.to_amount,
                status="pending_execution",
                instructions={
                    "type": "hyperliquid",
                    "note": "Hyperliquid API integration pending",
                },
            )

        except Exception as e:
            logger.error(f"Hyperliquid swap error: {e}")
            return SwapResult(
                success=False,
                provider="Hyperliquid",
                from_asset=route.quote.from_asset,
                to_asset=route.quote.to_asset,
                from_amount=route.quote.from_amount,
                error=str(e),
                status="failed",
            )

    async def _execute_dry_run_swap(
        self,
        quote: Quote,
        user_id: int,
    ) -> SwapResult:
        """Execute simulated swap (for testing)."""
        import hashlib

        tx_data = f"{quote.from_asset}{quote.to_asset}{quote.from_amount}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return SwapResult(
            success=True,
            provider="DryRun",
            from_asset=quote.from_asset,
            to_asset=quote.to_asset,
            from_amount=quote.from_amount,
            to_amount=quote.to_amount,
            tx_hash=f"0x{tx_hash}",
            status="completed",
            instructions={
                "type": "simulated",
                "note": "This is a simulated swap (dry-run mode)",
            },
        )

    def _get_eth_token(self, asset: str) -> Optional[str]:
        """Get Ethereum token address."""
        tokens = EVM_TOKENS.get("ETH", {})

        # ETH uses WETH
        if asset == "ETH":
            return tokens.get("WETH")

        return tokens.get(asset)

    async def _approve_token(self, signer, token_address: str, amount: int) -> str:
        """Approve token spending for DEX router."""
        # ERC20 approve ABI
        APPROVE_ABI = [
            {
                "inputs": [
                    {"name": "spender", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                ],
                "name": "approve",
                "outputs": [{"name": "", "type": "bool"}],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]

        # Uniswap V3 Router
        ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"

        contract = signer.web3.eth.contract(
            address=signer.web3.to_checksum_address(token_address),
            abi=APPROVE_ABI
        )

        account = signer.get_account(0)
        tx = contract.functions.approve(
            signer.web3.to_checksum_address(ROUTER),
            amount
        ).build_transaction({
            'from': account.address,
            'nonce': signer.web3.eth.get_transaction_count(account.address),
            'gas': 100000,
            'gasPrice': signer.web3.eth.gas_price,
        })

        return await signer.sign_and_send_transaction(tx)


# Singleton instance
_executor: Optional[SwapExecutor] = None


def get_swap_executor() -> SwapExecutor:
    """Get or create swap executor instance."""
    global _executor
    if _executor is None:
        _executor = SwapExecutor()
    return _executor
