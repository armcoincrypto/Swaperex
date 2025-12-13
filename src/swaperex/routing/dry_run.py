"""Dry-run router for simulated swaps (PoC)."""

import random
from decimal import Decimal
from typing import Optional

from swaperex.routing.base import Quote, RouteProvider, SwapRoute


# Simulated market prices in USD (approximate December 2024 values)
# These are for demonstration purposes only and should not be used for real trading
SIMULATED_PRICES: dict[str, Decimal] = {
    # ========== Major Cryptocurrencies ==========
    "BTC": Decimal("100000.00"),
    "ETH": Decimal("3900.00"),
    "LTC": Decimal("115.00"),
    "DASH": Decimal("48.00"),
    "BCH": Decimal("480.00"),
    "DOGE": Decimal("0.42"),
    "ZEC": Decimal("62.00"),
    "XMR": Decimal("195.00"),

    # ========== Layer 1 Blockchains ==========
    "SOL": Decimal("225.00"),
    "TRX": Decimal("0.27"),
    "BNB": Decimal("710.00"),
    "BSC": Decimal("710.00"),  # Alias for BNB
    "AVAX": Decimal("52.00"),
    "DOT": Decimal("9.50"),
    "MATIC": Decimal("0.62"),
    "POL": Decimal("0.62"),  # Polygon renamed
    "FTM": Decimal("1.05"),
    "NEAR": Decimal("7.20"),
    "ALGO": Decimal("0.45"),
    "ATOM": Decimal("12.50"),
    "XRP": Decimal("2.35"),
    "XLM": Decimal("0.45"),
    "TON": Decimal("6.80"),
    "KAS": Decimal("0.15"),
    "ICP": Decimal("13.50"),
    "EGLD": Decimal("48.00"),
    "HBAR": Decimal("0.29"),
    "VET": Decimal("0.052"),
    "ROSE": Decimal("0.12"),

    # ========== Stablecoins ==========
    "USDT": Decimal("1.00"),
    "USDC": Decimal("1.00"),
    "BUSD": Decimal("1.00"),
    "DAI": Decimal("1.00"),
    "TUSD": Decimal("1.00"),
    "USDJ": Decimal("1.00"),
    "FDUSD": Decimal("1.00"),

    # ========== DeFi & Ecosystem Tokens ==========
    "RUNE": Decimal("6.80"),
    "LINK": Decimal("28.00"),
    "UNI": Decimal("17.50"),
    "AAVE": Decimal("185.00"),
    "MKR": Decimal("1850.00"),
    "COMP": Decimal("95.00"),
    "SNX": Decimal("3.20"),
    "CRV": Decimal("1.10"),
    "SUSHI": Decimal("1.85"),
    "1INCH": Decimal("0.52"),
    "GRT": Decimal("0.32"),
    "ENS": Decimal("38.00"),
    "LDO": Decimal("2.40"),
    "YFI": Decimal("9500.00"),
    "BAL": Decimal("3.80"),
    "OMG": Decimal("0.65"),

    # ========== BNB Chain (PancakeSwap) Tokens ==========
    "CAKE": Decimal("2.80"),
    "BTCB": Decimal("100000.00"),
    "XVS": Decimal("8.50"),
    "ALPACA": Decimal("0.22"),
    "FLOKI": Decimal("0.00022"),
    "BABYDOGE": Decimal("0.0000000028"),
    "GMT": Decimal("0.22"),
    "SFP": Decimal("0.85"),

    # ========== Solana (Jupiter) Tokens ==========
    "RAY": Decimal("5.20"),
    "SRM": Decimal("0.035"),
    "ORCA": Decimal("4.80"),
    "JUP": Decimal("1.25"),
    "BONK": Decimal("0.000035"),
    "WIF": Decimal("3.20"),
    "PYTH": Decimal("0.48"),
    "SAMO": Decimal("0.028"),
    "MNDE": Decimal("0.15"),
    "HNT": Decimal("8.50"),

    # ========== Cosmos (Osmosis) Tokens ==========
    "OSMO": Decimal("1.15"),
    "JUNO": Decimal("0.45"),
    "SCRT": Decimal("0.52"),
    "INJ": Decimal("42.00"),
    "TIA": Decimal("8.50"),
    "STARS": Decimal("0.015"),

    # ========== Tron (SunSwap) Tokens ==========
    "BTT": Decimal("0.0000012"),
    "JST": Decimal("0.038"),
    "SUN": Decimal("0.022"),
    "WIN": Decimal("0.00012"),

    # ========== Meme & Other Tokens ==========
    "PEPE": Decimal("0.000022"),
    "SHIB": Decimal("0.000028"),
    "LRC": Decimal("0.28"),
    "BAT": Decimal("0.28"),
    "ZRX": Decimal("0.62"),
    "WBTC": Decimal("100000.00"),

    # ========== UTXO Coins ==========
    "DGB": Decimal("0.018"),
    "RVN": Decimal("0.028"),
    "BTG": Decimal("32.00"),
    "NMC": Decimal("1.80"),
    "VIA": Decimal("0.35"),
    "SYS": Decimal("0.15"),
    "KMD": Decimal("0.38"),
    "XEC": Decimal("0.000048"),
    "MONA": Decimal("0.62"),
    "FIO": Decimal("0.032"),
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
        # THORChain supports major L1 assets
        return ["BTC", "ETH", "LTC", "DASH", "USDT", "USDC", "ATOM", "RUNE", "AVAX", "BSC", "BNB"]

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
        # DEX aggregator for EVM tokens (ETH, BSC/BNB, Polygon chains)
        return ["ETH", "BSC", "BNB", "USDT", "USDC", "MATIC", "POL", "LINK", "UNI", "AVAX", "TRX"]

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


class SimulatedQuickSwapRouter(RouteProvider):
    """Simulated QuickSwap router for Polygon."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "quickswap_sim"

    @property
    def supported_assets(self) -> list[str]:
        return ["MATIC", "USDT", "USDC", "WETH", "QUICK", "AAVE", "LINK", "UNI", "SUSHI", "CRV"]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated QuickSwap quote."""
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

        # QuickSwap fees: ~0.3% + low gas on Polygon
        swap_fee_percent = Decimal("0.003")
        gas_fee_usd = Decimal("0.10")  # Polygon gas is very cheap

        fee_amount = usd_value * swap_fee_percent + gas_fee_usd
        fee_in_to_asset = fee_amount / to_price

        slippage_factor = min(Decimal("0.003"), slippage_tolerance)
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
            estimated_time_seconds=5,  # Polygon is fast
            route_details={
                "fee_usd": float(fee_amount),
                "gas_fee_usd": float(gas_fee_usd),
                "chain": "polygon",
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate QuickSwap execution."""
        import hashlib
        import time

        tx_data = f"quick{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": f"0x{tx_hash}",
            "provider": self.name,
            "simulated": True,
        }


class SimulatedTraderJoeRouter(RouteProvider):
    """Simulated TraderJoe router for Avalanche."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "traderjoe_sim"

    @property
    def supported_assets(self) -> list[str]:
        return ["AVAX", "USDT", "USDC", "WETH", "JOE", "PNG", "GMX", "LINK", "AAVE"]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated TraderJoe quote."""
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

        # TraderJoe fees: ~0.3% + moderate gas
        swap_fee_percent = Decimal("0.003")
        gas_fee_usd = Decimal("0.50")

        fee_amount = usd_value * swap_fee_percent + gas_fee_usd
        fee_in_to_asset = fee_amount / to_price

        slippage_factor = min(Decimal("0.003"), slippage_tolerance)
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
            estimated_time_seconds=3,  # Avalanche is fast
            route_details={
                "fee_usd": float(fee_amount),
                "gas_fee_usd": float(gas_fee_usd),
                "chain": "avalanche",
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate TraderJoe execution."""
        import hashlib
        import time

        tx_data = f"joe{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": f"0x{tx_hash}",
            "provider": self.name,
            "simulated": True,
        }


class SimulatedSunSwapRouter(RouteProvider):
    """Simulated SunSwap router for Tron."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "sunswap_sim"

    @property
    def supported_assets(self) -> list[str]:
        return ["TRX", "USDT", "USDC", "BTT", "JST", "SUN", "WIN", "USDJ"]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated SunSwap quote."""
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

        # SunSwap fees: ~0.3% + energy/bandwidth
        swap_fee_percent = Decimal("0.003")
        gas_fee_usd = Decimal("1.00")  # Tron energy costs

        fee_amount = usd_value * swap_fee_percent + gas_fee_usd
        fee_in_to_asset = fee_amount / to_price

        slippage_factor = min(Decimal("0.004"), slippage_tolerance)
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
            estimated_time_seconds=5,  # Tron is fast
            route_details={
                "fee_usd": float(fee_amount),
                "gas_fee_usd": float(gas_fee_usd),
                "chain": "tron",
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate SunSwap execution."""
        import hashlib
        import time

        tx_data = f"sun{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": tx_hash.upper(),
            "provider": self.name,
            "simulated": True,
        }


class SimulatedStonfiRouter(RouteProvider):
    """Simulated STON.fi router for TON."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "stonfi_sim"

    @property
    def supported_assets(self) -> list[str]:
        return ["TON", "USDT", "USDC"]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated STON.fi quote."""
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

        # STON.fi fees: ~0.3% + low gas
        swap_fee_percent = Decimal("0.003")
        gas_fee_usd = Decimal("0.15")  # TON gas is cheap

        fee_amount = usd_value * swap_fee_percent + gas_fee_usd
        fee_in_to_asset = fee_amount / to_price

        slippage_factor = min(Decimal("0.003"), slippage_tolerance)
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
            estimated_time_seconds=5,  # TON is fast
            route_details={
                "fee_usd": float(fee_amount),
                "gas_fee_usd": float(gas_fee_usd),
                "chain": "ton",
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate STON.fi execution."""
        import hashlib
        import time

        tx_data = f"stonfi{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": tx_hash.upper(),
            "provider": self.name,
            "simulated": True,
        }


class SimulatedRefFinanceRouter(RouteProvider):
    """Simulated Ref Finance router for NEAR."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "ref_finance_sim"

    @property
    def supported_assets(self) -> list[str]:
        return ["NEAR", "USDT", "USDC"]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated Ref Finance quote."""
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

        # Ref Finance fees: ~0.3% + storage deposit
        swap_fee_percent = Decimal("0.003")
        gas_fee_usd = Decimal("0.02")  # NEAR gas is very cheap

        fee_amount = usd_value * swap_fee_percent + gas_fee_usd
        fee_in_to_asset = fee_amount / to_price

        slippage_factor = min(Decimal("0.003"), slippage_tolerance)
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
            estimated_time_seconds=2,  # NEAR is very fast
            route_details={
                "fee_usd": float(fee_amount),
                "gas_fee_usd": float(gas_fee_usd),
                "chain": "near",
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate Ref Finance execution."""
        import hashlib
        import time

        tx_data = f"ref{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": tx_hash,
            "provider": self.name,
            "simulated": True,
        }


class SimulatedJupiterRouter(RouteProvider):
    """Simulated Jupiter router for Solana."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "jupiter_sim"

    @property
    def supported_assets(self) -> list[str]:
        return ["SOL", "USDT", "USDC", "RAY", "SRM", "ORCA", "JUP", "BONK", "WIF", "PYTH", "SAMO", "MNDE", "HNT"]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated Jupiter quote."""
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

        # Jupiter aggregator fees: ~0.1% + low tx fee
        swap_fee_percent = Decimal("0.001")
        gas_fee_usd = Decimal("0.01")  # Solana tx fees are very low

        fee_amount = usd_value * swap_fee_percent + gas_fee_usd
        fee_in_to_asset = fee_amount / to_price

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
            estimated_time_seconds=1,  # Solana is very fast
            route_details={
                "fee_usd": float(fee_amount),
                "gas_fee_usd": float(gas_fee_usd),
                "chain": "solana",
                "dex_path": ["raydium", "orca"],
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate Jupiter execution."""
        import hashlib
        import time

        tx_data = f"jup{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": tx_hash,
            "provider": self.name,
            "simulated": True,
        }


class SimulatedOsmosisRouter(RouteProvider):
    """Simulated Osmosis router for Cosmos ecosystem."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "osmosis_sim"

    @property
    def supported_assets(self) -> list[str]:
        return ["ATOM", "OSMO", "USDC", "JUNO", "INJ", "TIA", "SCRT", "STARS"]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated Osmosis quote."""
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

        # Osmosis fees: ~0.2% + IBC fees
        swap_fee_percent = Decimal("0.002")
        gas_fee_usd = Decimal("0.05")  # Cosmos fees are low

        fee_amount = usd_value * swap_fee_percent + gas_fee_usd
        fee_in_to_asset = fee_amount / to_price

        slippage_factor = min(Decimal("0.003"), slippage_tolerance)
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
            estimated_time_seconds=10,  # IBC transfers take a bit longer
            route_details={
                "fee_usd": float(fee_amount),
                "gas_fee_usd": float(gas_fee_usd),
                "chain": "osmosis",
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate Osmosis execution."""
        import hashlib
        import time

        tx_data = f"osmo{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": tx_hash.upper(),
            "provider": self.name,
            "simulated": True,
        }


class SimulatedPancakeSwapRouter(RouteProvider):
    """Simulated PancakeSwap router for BNB Chain."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "pancakeswap_sim"

    @property
    def supported_assets(self) -> list[str]:
        return [
            "BNB", "USDT", "USDC", "BUSD", "CAKE", "BTCB", "ETH",
            "XRP", "DOGE", "ADA", "DOT", "FDUSD", "FLOKI", "BABYDOGE",
            "XVS", "GMT", "SFP", "ALPACA"
        ]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated PancakeSwap quote."""
        from_asset = from_asset.upper()
        to_asset = to_asset.upper()

        # Handle BEP20 variants
        from_base = from_asset.replace("-BEP20", "")
        to_base = to_asset.replace("-BEP20", "")

        if from_base not in self.supported_assets or to_base not in self.supported_assets:
            return None

        from_price = self._prices.get(from_base)
        to_price = self._prices.get(to_base)

        if from_price is None or to_price is None or amount <= 0:
            return None

        usd_value = amount * from_price
        base_to_amount = usd_value / to_price

        # PancakeSwap fees: ~0.25% + low gas
        swap_fee_percent = Decimal("0.0025")
        gas_fee_usd = Decimal("0.30")  # BSC gas is cheap

        fee_amount = usd_value * swap_fee_percent + gas_fee_usd
        fee_in_to_asset = fee_amount / to_price

        slippage_factor = min(Decimal("0.003"), slippage_tolerance)
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
            estimated_time_seconds=5,  # BSC is fast
            route_details={
                "fee_usd": float(fee_amount),
                "gas_fee_usd": float(gas_fee_usd),
                "chain": "bsc",
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate PancakeSwap execution."""
        import hashlib
        import time

        tx_data = f"cake{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
        tx_hash = hashlib.sha256(tx_data.encode()).hexdigest()

        return {
            "success": True,
            "tx_hash": f"0x{tx_hash}",
            "provider": self.name,
            "simulated": True,
        }


class SimulatedUniswapRouter(RouteProvider):
    """Simulated Uniswap V3 router for Ethereum."""

    def __init__(self):
        self._prices = SIMULATED_PRICES.copy()

    @property
    def name(self) -> str:
        return "uniswap_sim"

    @property
    def supported_assets(self) -> list[str]:
        return [
            "ETH", "USDT", "USDC", "DAI", "WBTC", "LINK", "UNI", "AAVE",
            "LDO", "MKR", "COMP", "SNX", "CRV", "SUSHI", "1INCH",
            "GRT", "ENS", "PEPE", "SHIB", "YFI", "BAL", "OMG", "LRC", "BAT", "ZRX"
        ]

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Generate a simulated Uniswap quote."""
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

        # Uniswap fees: ~0.05-0.3% (use 0.3%) + high gas
        swap_fee_percent = Decimal("0.003")
        gas_fee_usd = Decimal("15.00")  # Ethereum gas is expensive

        fee_amount = usd_value * swap_fee_percent + gas_fee_usd
        fee_in_to_asset = fee_amount / to_price

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
            estimated_time_seconds=30,  # Ethereum block time
            route_details={
                "fee_usd": float(fee_amount),
                "gas_fee_usd": float(gas_fee_usd),
                "chain": "ethereum",
                "pool_fee": "0.3%",
                "simulated": True,
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Simulate Uniswap execution."""
        import hashlib
        import time

        tx_data = f"uni{route.quote.from_asset}{route.quote.to_asset}{time.time()}"
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
    aggregator.add_provider(SimulatedQuickSwapRouter())
    aggregator.add_provider(SimulatedTraderJoeRouter())
    aggregator.add_provider(SimulatedSunSwapRouter())
    aggregator.add_provider(SimulatedStonfiRouter())
    aggregator.add_provider(SimulatedRefFinanceRouter())
    aggregator.add_provider(SimulatedJupiterRouter())
    aggregator.add_provider(SimulatedOsmosisRouter())
    aggregator.add_provider(SimulatedPancakeSwapRouter())
    aggregator.add_provider(SimulatedUniswapRouter())
    return aggregator


def create_chain_aggregator(chain: str):
    """Create a route aggregator for a specific chain/DEX.

    Args:
        chain: The chain/DEX identifier (e.g., 'pancakeswap', 'uniswap', etc.)

    Returns:
        RouteAggregator with providers for the specified chain
    """
    from swaperex.routing.base import RouteAggregator

    aggregator = RouteAggregator()

    # Map chain to specific providers
    chain_providers = {
        "pancakeswap": [SimulatedPancakeSwapRouter(), DryRunRouter()],
        "uniswap": [SimulatedUniswapRouter(), DryRunRouter()],
        "thorchain": [SimulatedThorChainRouter(), DryRunRouter()],
        "jupiter": [SimulatedJupiterRouter(), DryRunRouter()],
        "osmosis": [SimulatedOsmosisRouter(), DryRunRouter()],
        "quickswap": [SimulatedQuickSwapRouter(), DryRunRouter()],
        "traderjoe": [SimulatedTraderJoeRouter(), DryRunRouter()],
        "sunswap": [SimulatedSunSwapRouter(), DryRunRouter()],
        "stonfi": [SimulatedStonfiRouter(), DryRunRouter()],
        "ref_finance": [SimulatedRefFinanceRouter(), DryRunRouter()],
    }

    providers = chain_providers.get(chain.lower(), [DryRunRouter()])
    for provider in providers:
        aggregator.add_provider(provider)

    return aggregator
