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
import re
import time
from decimal import Decimal
from typing import Optional
from dataclasses import dataclass

from swaperex.config import get_settings
from swaperex.routing.base import Quote, SwapRoute, RouteProvider
from swaperex.routing.factory import create_default_aggregator, create_production_aggregator

logger = logging.getLogger(__name__)


def validate_address(address: str, asset: str, provider: str = None) -> tuple[bool, str]:
    """Validate address format for a given asset and provider context.

    For same-chain DEX swaps (PancakeSwap, Uniswap), validation is based on chain.
    For cross-chain swaps, validation is based on destination asset.

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not address or not isinstance(address, str):
        return False, "Address is required"

    address = address.strip()

    # Determine validation type based on provider context
    # For same-chain DEXes, validate based on chain, not asset
    if provider == "PancakeSwap":
        # All PancakeSwap destinations are BSC/EVM addresses
        if not re.match(r"^0x[a-fA-F0-9]{40}$", address):
            return False, f"Invalid BSC address format"
        return True, ""

    if provider == "Uniswap":
        # All Uniswap destinations are Ethereum/EVM addresses
        if not re.match(r"^0x[a-fA-F0-9]{40}$", address):
            return False, f"Invalid Ethereum address format"
        return True, ""

    if provider == "Jupiter":
        # All Jupiter destinations are Solana addresses
        if not re.match(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$", address):
            return False, f"Invalid Solana address format"
        return True, ""

    if provider == "Osmosis":
        # All Osmosis destinations are Cosmos addresses
        if not address.startswith("osmo1") and not address.startswith("cosmos1"):
            return False, f"Invalid Cosmos/Osmosis address"
        return True, ""

    # For cross-chain or unknown provider, validate by asset
    base_asset = asset.upper()
    if base_asset in ["USDT-ERC20", "USDC-ERC20", "LINK"]:
        base_asset = "ETH"
    elif base_asset == "HYPE":
        base_asset = "ETH"

    # EVM addresses (ETH, BNB, etc.)
    if base_asset in ["ETH", "BNB"]:
        if not re.match(r"^0x[a-fA-F0-9]{40}$", address):
            return False, f"Invalid EVM address format for {asset}"
        return True, ""

    # Bitcoin (native segwit)
    if base_asset == "BTC":
        if not re.match(r"^(bc1|tb1)[a-zA-HJ-NP-Z0-9]{25,87}$", address):
            if not re.match(r"^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$", address):
                return False, f"Invalid Bitcoin address format"
        return True, ""

    # Litecoin
    if base_asset == "LTC":
        if not re.match(r"^(ltc1|L|M|3)[a-km-zA-HJ-NP-Z1-9]{25,87}$", address):
            return False, f"Invalid Litecoin address format"
        return True, ""

    # Solana
    if base_asset == "SOL":
        if not re.match(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$", address):
            return False, f"Invalid Solana address format"
        return True, ""

    # Cosmos/ATOM
    if base_asset == "ATOM":
        if not address.startswith("cosmos1"):
            return False, f"Invalid Cosmos address: must start with 'cosmos1'"
        if not re.match(r"^cosmos1[a-z0-9]{38}$", address):
            return False, f"Invalid Cosmos address format"
        return True, ""

    # Cardano (only for native Cardano, not BSC tokens)
    if base_asset == "ADA" and provider not in ["PancakeSwap", None]:
        if not address.startswith("addr1"):
            return False, f"Invalid Cardano address: must start with 'addr1'"
        if len(address) < 50:
            return False, f"Invalid Cardano address: too short"
        return True, ""

    # Unknown asset - allow any non-empty address
    logger.warning(f"No address validation for asset {asset}, allowing any format")
    return True, ""


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
        "DAI": "0x6B175474E89094C44Da98b954EedeCD5bE3e31f",
        "LINK": "0x514910771AF9Ca656af840dff83E8264EcF986CA",
        "UNI": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        "WBTC": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
        "AAVE": "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
        "SHIB": "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
        "PEPE": "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
        # Aliases for cross-chain compatibility
        "USDT-ERC20": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDC-ERC20": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    },
    # BSC (BNB Chain)
    "BNB": {
        "WBNB": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        "USDT": "0x55d398326f99059fF775485246999027B3197955",
        "USDC": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        "BUSD": "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
        "DAI": "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
        "CAKE": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
        "XRP": "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
        "DOGE": "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
        "ADA": "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47",
        "DOT": "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402",
        "MATIC": "0xCC42724C6683B7E57334c4E856f4c9965ED682bD",
        "ETH": "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",  # ETH on BSC (BEP20)
        "BTCB": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",  # BTC on BSC
        # Aliases for cross-chain compatibility
        "USDT-BEP20": "0x55d398326f99059fF775485246999027B3197955",
        "USDC-BEP20": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    },
}

# Token decimals
TOKEN_DECIMALS = {
    # Native coins
    "ETH": 18, "WETH": 18, "BNB": 18, "WBNB": 18,
    "BTC": 8, "LTC": 8, "BTCB": 18,
    # Stablecoins (6 decimals)
    "USDT": 6, "USDC": 6, "BUSD": 18, "DAI": 18,
    "USDT-ERC20": 6, "USDC-ERC20": 6,
    "USDT-BEP20": 18, "USDC-BEP20": 18,
    # Popular tokens
    "LINK": 18, "UNI": 18, "AAVE": 18, "WBTC": 8,
    "CAKE": 18, "XRP": 18, "DOGE": 8, "ADA": 18,
    "DOT": 18, "MATIC": 18, "SHIB": 18, "PEPE": 18,
    # Other chains
    "SOL": 9, "ATOM": 6, "HYPE": 18,
}


class SwapExecutor:
    """Executes swaps across different DEXes with full chain integration."""

    # Minimum gas requirements (in native token units)
    MIN_GAS_BNB = Decimal("0.003")  # ~$1-2 for BSC swap
    MIN_GAS_ETH = Decimal("0.005")  # ~$15-20 for ETH swap

    def __init__(self):
        self.settings = get_settings()
        # Use production aggregator (no DryRun) when DRY_RUN=false
        if self.settings.dry_run:
            self.aggregator = create_default_aggregator()
        else:
            self.aggregator = create_production_aggregator()

    async def _check_gas_balance(
        self,
        chain: str,
        swap_amount: Decimal,
        is_native_swap: bool,
    ) -> tuple[bool, str, Decimal]:
        """Check if user has sufficient balance for gas fees.

        Args:
            chain: "BNB" or "ETH"
            swap_amount: Amount being swapped (only matters if swapping native token)
            is_native_swap: True if swapping native token (BNB/ETH)

        Returns:
            Tuple of (has_enough, error_message, current_balance)
        """
        from swaperex.swap.signer import get_signer_factory

        try:
            signer = get_signer_factory().get_evm_signer(chain)
            address = signer.get_address(0)

            # Get current balance
            balance_wei = signer.web3.eth.get_balance(address)
            balance = Decimal(balance_wei) / Decimal(10 ** 18)

            # Determine minimum required
            min_gas = self.MIN_GAS_BNB if chain == "BNB" else self.MIN_GAS_ETH
            gas_name = "BNB" if chain == "BNB" else "ETH"

            if is_native_swap:
                # Swapping native token: need swap_amount + gas
                required = swap_amount + min_gas
                if balance < required:
                    return (
                        False,
                        f"Insufficient {gas_name} balance. You have {balance:.6f} {gas_name}, "
                        f"but need {swap_amount} for swap + ~{min_gas} for gas = {required:.6f} {gas_name}. "
                        f"Try swapping a smaller amount (max ~{balance - min_gas:.6f} {gas_name})",
                        balance,
                    )
            else:
                # Swapping token: just need gas
                if balance < min_gas:
                    return (
                        False,
                        f"Insufficient {gas_name} for gas fees. You have {balance:.6f} {gas_name}, "
                        f"but need at least ~{min_gas} {gas_name} for transaction fees",
                        balance,
                    )

            return True, "", balance

        except Exception as e:
            logger.warning(f"Gas balance check failed: {e}")
            # Don't block swap if we can't check - let the RPC error through
            return True, "", Decimal("0")

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

        # Check if quote has expired
        if quote.is_expired:
            seconds_ago = abs(quote.seconds_until_expiry)
            return SwapResult(
                success=False,
                provider=provider_name,
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                error=f"Quote expired {seconds_ago:.0f} seconds ago. Please request a new quote.",
                status="expired",
            )

        # Validate destination address matches output asset chain
        # Pass provider for context-aware validation (BSC tokens use EVM addresses)
        is_valid, error_msg = validate_address(destination_address, quote.to_asset, provider_name)
        if not is_valid:
            return SwapResult(
                success=False,
                provider=provider_name,
                from_asset=quote.from_asset,
                to_asset=quote.to_asset,
                from_amount=quote.from_amount,
                error=f"Invalid destination address: {error_msg}",
                status="failed",
            )

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
        Auto-sends for EVM chains (BNB, ETH), manual for BTC/LTC.
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
        router = instructions.get("router")

        from_asset = route.quote.from_asset.upper()

        # Auto-send for EVM chains (BNB, ETH)
        if from_asset in ["BNB", "ETH"]:
            try:
                from swaperex.swap.signer import get_signer_factory

                # Get the appropriate signer
                chain = "BNB" if from_asset == "BNB" else "ETH"
                signer = get_signer_factory().get_evm_signer(chain)

                # Convert amount to wei (18 decimals for BNB/ETH)
                amount_wei = int(route.quote.from_amount * Decimal("1000000000000000000"))

                # Encode memo as bytes for transaction data
                memo_bytes = memo.encode('utf-8') if memo else b''

                # Build transaction to THORChain vault
                tx_params = {
                    'to': signer.web3.to_checksum_address(inbound_address),
                    'value': amount_wei,
                    'data': memo_bytes,
                    'gas': 80000,  # Standard gas for simple transfer with memo
                }

                # Sign and send
                tx_hash = await signer.sign_and_send_transaction(
                    tx_params,
                    index=0,
                    wait_for_confirmation=False,
                )

                logger.info(f"THORChain swap sent: {tx_hash} ({from_asset} -> {route.quote.to_asset})")

                return SwapResult(
                    success=True,
                    provider=provider.name,
                    from_asset=route.quote.from_asset,
                    to_asset=route.quote.to_asset,
                    from_amount=route.quote.from_amount,
                    to_amount=route.quote.to_amount,
                    tx_hash=tx_hash,
                    status="pending",
                    instructions={
                        "type": "thorchain_auto",
                        "note": f"Transaction sent to THORChain. Output will arrive at {route.destination_address}",
                        "estimated_time_seconds": route.quote.estimated_time_seconds,
                    },
                )

            except Exception as e:
                logger.error(f"THORChain auto-send failed: {e}, falling back to manual instructions")
                # Fall back to manual instructions instead of failing
                return SwapResult(
                    success=True,
                    provider=provider.name,
                    from_asset=route.quote.from_asset,
                    to_asset=route.quote.to_asset,
                    from_amount=route.quote.from_amount,
                    to_amount=route.quote.to_amount,
                    status="awaiting_deposit",
                    instructions={
                        "type": "thorchain_manual_fallback",
                        "action": "Auto-send failed. Please send funds manually.",
                        "inbound_address": inbound_address,
                        "memo": memo,
                        "amount": str(route.quote.from_amount),
                        "asset": route.quote.from_asset,
                        "expected_output": str(route.quote.to_amount),
                        "output_asset": route.quote.to_asset,
                        "destination": route.destination_address,
                        "auto_send_error": str(e),
                    },
                )

        # For BTC/LTC - return instructions for manual send (UTXO management required)
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

            # Check gas balance before attempting swap
            is_native_swap = quote.from_asset.upper() == "ETH"
            has_gas, gas_error, balance = await self._check_gas_balance(
                chain="ETH",
                swap_amount=quote.from_amount,
                is_native_swap=is_native_swap,
            )

            if not has_gas:
                return SwapResult(
                    success=False,
                    provider="Uniswap",
                    from_asset=quote.from_asset,
                    to_asset=quote.to_asset,
                    from_amount=quote.from_amount,
                    error=gas_error,
                    status="failed",
                )

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
        """Execute PancakeSwap V2 swap on BSC."""
        try:
            from swaperex.swap.signer import get_signer_factory

            quote = route.quote

            # Check gas balance before attempting swap
            is_native_swap = quote.from_asset.upper() == "BNB"
            has_gas, gas_error, balance = await self._check_gas_balance(
                chain="BNB",
                swap_amount=quote.from_amount,
                is_native_swap=is_native_swap,
            )

            if not has_gas:
                return SwapResult(
                    success=False,
                    provider="PancakeSwap",
                    from_asset=quote.from_asset,
                    to_asset=quote.to_asset,
                    from_amount=quote.from_amount,
                    error=gas_error,
                    status="failed",
                )

            signer = get_signer_factory().get_evm_signer("BNB")

            # Get token addresses - use WBNB for native BNB
            WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"

            from_token = EVM_TOKENS.get("BNB", {}).get(quote.from_asset)
            to_token = EVM_TOKENS.get("BNB", {}).get(quote.to_asset)

            # Native BNB uses WBNB address (router wraps/unwraps automatically)
            if quote.from_asset == "BNB":
                from_token = WBNB
            if quote.to_asset == "BNB":
                to_token = WBNB

            if not from_token or not to_token:
                return SwapResult(
                    success=False,
                    provider="PancakeSwap",
                    from_asset=quote.from_asset,
                    to_asset=quote.to_asset,
                    from_amount=quote.from_amount,
                    error=f"Token not supported on BSC: {quote.from_asset} or {quote.to_asset}",
                    status="failed",
                )

            # Calculate amounts with proper decimals
            from_decimals = TOKEN_DECIMALS.get(quote.from_asset, 18)
            to_decimals = TOKEN_DECIMALS.get(quote.to_asset, 18)
            amount_in = int(quote.from_amount * Decimal(10 ** from_decimals))
            min_amount_out = int(quote.to_amount * Decimal(10 ** to_decimals) * Decimal("0.99"))

            deadline = int(time.time()) + 300

            # Use proper PancakeSwap V2 swap method (handles BNB/token/token swaps)
            tx_hash = await signer.swap_on_pancakeswap(
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

    def _get_osmosis_pool_id(self, from_asset: str, to_asset: str) -> Optional[int]:
        """Get Osmosis pool ID for a token pair.

        Pool IDs for common pairs (Osmosis mainnet):
        - Pool 1: ATOM/OSMO
        - Pool 678: USDC/OSMO
        - Pool 704: USDT/OSMO
        """
        # Normalized pair lookup (sorted alphabetically)
        pair = tuple(sorted([from_asset.upper(), to_asset.upper()]))

        POOL_IDS = {
            ("ATOM", "OSMO"): 1,
            ("OSMO", "USDC"): 678,
            ("OSMO", "USDT"): 704,
        }

        return POOL_IDS.get(pair)

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
                "USDC": "ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858",
                "USDT": "ibc/8242AD24008032E457D2E12D46588FD39FB54FB29680C6C7663D296B383C37C4",
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
                    error=f"Token not supported on Osmosis: {quote.from_asset} or {quote.to_asset}",
                    status="failed",
                )

            # Find pool ID for this pair
            pool_id = self._get_osmosis_pool_id(quote.from_asset, quote.to_asset)
            if pool_id is None:
                return SwapResult(
                    success=False,
                    provider="Osmosis",
                    from_asset=quote.from_asset,
                    to_asset=quote.to_asset,
                    from_amount=quote.from_amount,
                    error=f"No Osmosis pool found for {quote.from_asset}/{quote.to_asset}",
                    status="failed",
                )

            decimals = TOKEN_DECIMALS.get(quote.from_asset, 6)
            amount_in = int(quote.from_amount * Decimal(10 ** decimals))
            min_amount_out = int(quote.to_amount * Decimal(10 ** decimals) * Decimal("0.99"))

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
        """Approve token spending for Uniswap V3 router.

        Uses the signer's shared _approve_token_for_router method for
        thread-safe nonce management and proper allowance checking.
        """
        # Uniswap V3 Router
        ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"

        return await signer._approve_token_for_router(
            token_address=token_address,
            amount=amount,
            router_address=ROUTER,
            index=0,
        )


# Singleton instance
_executor: Optional[SwapExecutor] = None


def get_swap_executor() -> SwapExecutor:
    """Get or create swap executor instance."""
    global _executor
    if _executor is None:
        _executor = SwapExecutor()
    return _executor
