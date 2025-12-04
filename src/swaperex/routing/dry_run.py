"""Dry-run router for simulated swaps (PoC)."""

import random
from decimal import Decimal
from typing import Optional

from swaperex.routing.base import Quote, RouteProvider, SwapRoute


# Simulated market prices in USD
SIMULATED_PRICES: dict[str, Decimal] = {
    "BTC": Decimal("67500.00"),
    "ETH": Decimal("3450.00"),
    "LTC": Decimal("95.00"),
    "DASH": Decimal("45.00"),
    "TRX": Decimal("0.20"),
    "SOL": Decimal("185.00"),
    "USDT": Decimal("1.00"),
    "USDC": Decimal("1.00"),
    "USDT-ERC20": Decimal("1.00"),
    "USDT-TRC20": Decimal("1.00"),
    "BSC": Decimal("600.00"),
    "ATOM": Decimal("9.50"),
    "RUNE": Decimal("5.80"),
    "AVAX": Decimal("42.00"),
    "MATIC": Decimal("0.58"),
    "DOT": Decimal("7.20"),
    "LINK": Decimal("14.50"),
    "UNI": Decimal("12.80"),
}


class DryRunRouter(RouteProvider):
    """
    Simulated router for PoC testing.

    Provides realistic quotes based on simulated prices with:
    - Configurable fee structure
    - Simulated slippage
    - Multiple simulated routes to compare
    """

    def __init__(
        self,
        base_fee_percent: Decimal = Decimal("0.0"),  # No internal spread by default
        network_fee_usd: Decimal = Decimal("0.50"),  # Simulated network fee
        add_random_variance: bool = True,
    ):
        self.base_fee_percent = base_fee_percent
        self.network_fee_usd = network_fee_usd
        self.add_random_variance = add_random_variance
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "dry_run"

    @property
    def supported_assets(self) -> list[str]:
        return list(self._prices.keys())

    def set_price(self, asset: str, price: Decimal) -> None:
        """Set simulated price for an asset."""
        self._prices[asset.upper()] = price

    def get_price(self, asset: str) -> Optional[Decimal]:
        """Get simulated price for an asset."""
        return self._prices.get(asset.upper())

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated quote."""
        from_asset = from_asset.upper()
        to_asset = to_asset.upper()

        from_price = self._prices.get(from_asset)
        to_price = self._prices.get(to_asset)

        if from_price is None or to_price is None:
            return None

        if amount <= 0:
            return None

        # Calculate base conversion
        usd_value = amount * from_price
        base_to_amount = usd_value / to_price

        # Apply fee
        fee_amount = usd_value * self.base_fee_percent
        fee_in_to_asset = fee_amount / to_price

        # Apply simulated slippage (random small variance)
        slippage = Decimal("0")
        if self.add_random_variance:
            # Random slippage between 0% and slippage_tolerance
            slippage_factor = Decimal(str(random.uniform(0, float(slippage_tolerance))))
            slippage = base_to_amount * slippage_factor

        final_to_amount = base_to_amount - fee_in_to_asset - slippage

        # Ensure positive output
        if final_to_amount <= 0:
            return None

        # Calculate actual slippage percentage
        actual_slippage = (
            (base_to_amount - final_to_amount) / base_to_amount * 100
            if base_to_amount > 0
            else Decimal("0")
        )

        return Quote(
            provider=self.name,
            from_asset=from_asset,
            to_asset=to_asset,
            from_amount=amount,
            to_amount=final_to_amount.quantize(Decimal("0.00000001")),
            fee_asset="USD",
            fee_amount=(fee_amount + self.network_fee_usd).quantize(Decimal("0.01")),
            slippage_percent=actual_slippage.quantize(Decimal("0.01")),
            estimated_time_seconds=30,
            route_details={
                "fee_usd": float(fee_amount + self.network_fee_usd),
                "from_price_usd": float(from_price),
                "to_price_usd": float(to_price),
                "usd_value": float(usd_value),
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate swap execution."""
        # In dry-run mode, we just return success with simulated tx hash
        import hashlib
        import time

        tx_data = f"{route.quote.from_asset}{route.quote.to_asset}{route.quote.from_amount}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": f"0x{tx_hash}",
            "from_amount": str(route.quote.from_amount),
            "to_amount": str(route.quote.to_amount),
            "provider": self.name,
            "simulated": True,
        }


class SimulatedThorChainRouter(RouteProvider):
    """Simulated THORChain router for comparison."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "thorchain_sim"

    @property
    def supported_assets(self) -> list[str]:
        # THORChain supports major assets
        return ["BTC", "ETH", "USDT", "USDC", "ATOM", "RUNE", "AVAX"]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated THORChain quote."""
        from_asset = from_asset.upper()
        to_asset = to_asset.upper()

        if from_asset not in self.supported_assets or to_asset not in self.supported_assets:
            return None

        from_price = self._prices.get(from_asset)
        to_price = self._prices.get(to_asset)

        if from_price is None or to_price is None or amount <= 0:
            return None

        usd_value = amount * from_price
        base_to_amount = usd_value / to_price

        # THORChain-like fees: ~0.3% + network fee
        swap_fee_percent = Decimal("0.003")
        outbound_fee_usd = Decimal("2.50")  # Simulated outbound fee

        fee_amount = usd_value * swap_fee_percent + outbound_fee_usd
        fee_in_to_asset = fee_amount / to_price

        # Simulated slippage based on size
        slippage_factor = min(Decimal("0.005") + (usd_value / Decimal("1000000")), slippage_tolerance)
        slippage = base_to_amount * slippage_factor

        final_to_amount = base_to_amount - fee_in_to_asset - slippage

        if final_to_amount <= 0:
            return None

        actual_slippage = (base_to_amount - final_to_amount) / base_to_amount * 100

        return Quote(
            provider=self.name,
            from_asset=from_asset,
            to_asset=to_asset,
            from_amount=amount,
            to_amount=final_to_amount.quantize(Decimal("0.00000001")),
            fee_asset="USD",
            fee_amount=fee_amount.quantize(Decimal("0.01")),
            slippage_percent=actual_slippage.quantize(Decimal("0.01")),
            estimated_time_seconds=600,  # THORChain ~10 min
            route_details={
                "fee_usd": float(fee_amount),
                "outbound_fee_usd": float(outbound_fee_usd),
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate THORChain swap execution."""
        import hashlib
        import time

        tx_data = f"thor{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": tx_hash.upper(),
            "provider": self.name,
            "simulated": True,
        }


class SimulatedDexAggregator(RouteProvider):
    """Simulated DEX aggregator (like 1inch) for EVM tokens."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "dex_aggregator_sim"

    @property
    def supported_assets(self) -> list[str]:
        # DEX aggregator for EVM tokens
        return ["ETH", "USDT", "USDC", "MATIC", "LINK", "UNI", "AVAX"]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated DEX aggregator quote."""
        from_asset = from_asset.upper()
        to_asset = to_asset.upper()

        if from_asset not in self.supported_assets or to_asset not in self.supported_assets:
            return None

        from_price = self._prices.get(from_asset)
        to_price = self._prices.get(to_asset)

        if from_price is None or to_price is None or amount <= 0:
            return None

        usd_value = amount * from_price
        base_to_amount = usd_value / to_price

        # DEX fees: ~0.1% + gas
        swap_fee_percent = Decimal("0.001")
        gas_fee_usd = Decimal("5.00")  # Simulated gas

        fee_amount = usd_value * swap_fee_percent + gas_fee_usd
        fee_in_to_asset = fee_amount / to_price

        # Lower slippage for DEX (better liquidity for EVM)
        slippage_factor = min(Decimal("0.002"), slippage_tolerance)
        slippage = base_to_amount * slippage_factor

        final_to_amount = base_to_amount - fee_in_to_asset - slippage

        if final_to_amount <= 0:
            return None

        actual_slippage = (base_to_amount - final_to_amount) / base_to_amount * 100

        return Quote(
            provider=self.name,
            from_asset=from_asset,
            to_asset=to_asset,
            from_amount=amount,
            to_amount=final_to_amount.quantize(Decimal("0.00000001")),
            fee_asset="USD",
            fee_amount=fee_amount.quantize(Decimal("0.01")),
            slippage_percent=actual_slippage.quantize(Decimal("0.01")),
            estimated_time_seconds=30,  # Fast for DEX
            route_details={
                "fee_usd": float(fee_amount),
                "gas_fee_usd": float(gas_fee_usd),
                "dex_path": ["uniswap_v3", "curve"],  # Simulated route
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate DEX swap execution."""
        import hashlib
        import time

        tx_data = f"dex{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": f"0x{tx_hash}",
            "provider": self.name,
            "simulated": True,
        }


def create_default_aggregator():
    """Create a route aggregator with all simulated providers."""
    from swaperex.routing.base import RouteAggregator

    aggregator = RouteAggregator()
    aggregator.add_provider(DryRunRouter())
    aggregator.add_provider(SimulatedThorChainRouter())
    aggregator.add_provider(SimulatedDexAggregator())
    return aggregator
