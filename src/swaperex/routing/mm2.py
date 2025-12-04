"""MM2 (AtomicDEX/Komodo) decentralized exchange integration.

MM2 enables trustless atomic swaps across multiple blockchains without
intermediaries. Uses the Komodo AtomicDEX protocol.

API docs: https://developers.komodoplatform.com/basic-docs/atomicdex-api-20/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.routing.base import Quote, RouteProvider, SwapRoute

logger = logging.getLogger(__name__)

# Default MM2 RPC endpoint (local)
DEFAULT_MM2_RPC = "http://127.0.0.1:7783"

# MM2 supported coins with their ticker symbols
# Format: internal_symbol -> mm2_ticker
MM2_COINS = {
    # Native coins
    "BTC": "BTC",
    "LTC": "LTC",
    "KMD": "KMD",
    "DOGE": "DOGE",
    "DGB": "DGB",
    "DASH": "DASH",
    "BCH": "BCH",
    "QTUM": "QTUM",
    "RVN": "RVN",
    "ZEC": "ZEC",
    "FIRO": "FIRO",
    # EVM chains
    "ETH": "ETH",
    "BNB": "BNB",
    "MATIC": "MATIC",
    "AVAX": "AVAX",
    "FTM": "FTM",
    "ONE": "ONE",
    "MOVR": "MOVR",
    "ETH-ARB20": "ETH-ARB20",
    # Stablecoins
    "USDT-ERC20": "USDT-ERC20",
    "USDT-BEP20": "USDT-BEP20",
    "USDT-PLG20": "USDT-PLG20",
    "USDT-AVX20": "USDT-AVX20",
    "USDC-ERC20": "USDC-ERC20",
    "USDC-BEP20": "USDC-BEP20",
    "USDC-PLG20": "USDC-PLG20",
    "DAI-ERC20": "DAI-ERC20",
    "DAI-BEP20": "DAI-BEP20",
    "BUSD-BEP20": "BUSD-BEP20",
    # Komodo ecosystem
    "SUPERNET": "SUPERNET",
    "DEX": "DEX",
    "CHIPS": "CHIPS",
    "MCL": "MCL",
    "VRSC": "VRSC",
    # Wrapped/bridged
    "WBTC": "WBTC",
    "WWBTC": "WWBTC",
    # Additional popular coins
    "XRP": "XRP",
    "ADA": "ADA",
    "DOT": "DOT",
    "SOL": "SOL",
    "ATOM": "ATOM",
    "LINK": "LINK",
    "UNI": "UNI",
    "AAVE": "AAVE",
    "SUSHI": "SUSHI",
}

# Simplified mapping for common symbols
SYMBOL_ALIASES = {
    "USDT": "USDT-ERC20",
    "USDC": "USDC-ERC20",
    "DAI": "DAI-ERC20",
    "BUSD": "BUSD-BEP20",
}


class MM2Provider(RouteProvider):
    """MM2 (AtomicDEX) decentralized swap provider.

    Enables trustless atomic swaps without intermediaries across:
    - Bitcoin and UTXO-based coins (BTC, LTC, DOGE, etc.)
    - Ethereum and EVM chains (ETH, BNB, MATIC, etc.)
    - Komodo ecosystem tokens (KMD, SUPERNET, etc.)
    - Various ERC20/BEP20 tokens
    """

    def __init__(
        self,
        rpc_url: Optional[str] = None,
        userpass: Optional[str] = None,
    ):
        """Initialize MM2 provider.

        Args:
            rpc_url: MM2 RPC endpoint URL
            userpass: MM2 userpass for authenticated requests
        """
        self.rpc_url = rpc_url or DEFAULT_MM2_RPC
        self.userpass = userpass or "default_userpass"
        self._enabled_coins: set[str] = set()

    @property
    def name(self) -> str:
        return "MM2 (AtomicDEX)"

    @property
    def supported_assets(self) -> list[str]:
        """List of supported asset symbols."""
        # Return all known MM2 coins plus aliases
        return list(MM2_COINS.keys()) + list(SYMBOL_ALIASES.keys())

    def _normalize_symbol(self, symbol: str) -> str:
        """Normalize symbol to MM2 ticker format."""
        symbol = symbol.upper()
        # Check aliases first
        if symbol in SYMBOL_ALIASES:
            return SYMBOL_ALIASES[symbol]
        return symbol

    def _get_mm2_ticker(self, symbol: str) -> Optional[str]:
        """Convert symbol to MM2 ticker."""
        normalized = self._normalize_symbol(symbol)
        return MM2_COINS.get(normalized, normalized)

    async def _rpc_call(self, method: str, params: Optional[dict] = None) -> Optional[dict]:
        """Make RPC call to MM2.

        Args:
            method: RPC method name
            params: Method parameters

        Returns:
            Response data or None on error
        """
        payload = {
            "userpass": self.userpass,
            "method": method,
        }
        if params:
            payload.update(params)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.rpc_url,
                    json=payload,
                )

                if response.status_code != 200:
                    logger.warning(f"MM2 RPC error: {response.status_code}")
                    return None

                data = response.json()

                # Check for error in response
                if "error" in data:
                    logger.warning(f"MM2 error: {data['error']}")
                    return None

                return data

        except httpx.ConnectError:
            logger.debug("MM2 not available (connection refused)")
            return None
        except Exception as e:
            logger.error(f"MM2 RPC error: {e}")
            return None

    async def enable_coin(self, coin: str) -> bool:
        """Enable a coin for trading.

        Args:
            coin: Coin ticker to enable

        Returns:
            True if enabled successfully
        """
        ticker = self._get_mm2_ticker(coin)
        if not ticker:
            return False

        if ticker in self._enabled_coins:
            return True

        # Use electrum for UTXO coins, enable for EVM
        # This is a simplified approach; production would need coin-specific config
        result = await self._rpc_call("electrum", {
            "coin": ticker,
            "servers": [{"url": "auto"}],
        })

        if result and "result" in result:
            self._enabled_coins.add(ticker)
            return True

        # Try enable method for EVM coins
        result = await self._rpc_call("enable", {
            "coin": ticker,
        })

        if result and "result" in result:
            self._enabled_coins.add(ticker)
            return True

        return False

    async def get_orderbook(
        self,
        base: str,
        rel: str,
    ) -> Optional[dict]:
        """Get orderbook for a trading pair.

        Args:
            base: Base coin (what you're buying)
            rel: Rel coin (what you're selling)

        Returns:
            Orderbook data with asks and bids
        """
        base_ticker = self._get_mm2_ticker(base)
        rel_ticker = self._get_mm2_ticker(rel)

        if not base_ticker or not rel_ticker:
            return None

        return await self._rpc_call("orderbook", {
            "base": base_ticker,
            "rel": rel_ticker,
        })

    async def get_best_orders(
        self,
        coin: str,
        action: str = "buy",
        volume: Optional[Decimal] = None,
    ) -> Optional[dict]:
        """Get best available orders for a coin.

        Args:
            coin: Coin to get orders for
            action: "buy" or "sell"
            volume: Optional volume filter

        Returns:
            Best orders data
        """
        ticker = self._get_mm2_ticker(coin)
        if not ticker:
            return None

        params = {
            "coin": ticker,
            "action": action,
        }
        if volume:
            params["volume"] = str(volume)

        return await self._rpc_call("best_orders", params)

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal = Decimal("0.01"),
    ) -> Optional[Quote]:
        """Get swap quote from MM2 orderbook.

        Args:
            from_asset: Source asset symbol (what you're selling)
            to_asset: Destination asset symbol (what you're buying)
            amount: Amount of from_asset to swap
            slippage_tolerance: Maximum acceptable slippage (0.01 = 1%)

        Returns:
            Quote with expected output and fees
        """
        from_ticker = self._get_mm2_ticker(from_asset)
        to_ticker = self._get_mm2_ticker(to_asset)

        if not from_ticker or not to_ticker:
            logger.debug(f"MM2: Unknown asset {from_asset} or {to_asset}")
            return None

        # Get orderbook - we're selling from_asset (rel) to buy to_asset (base)
        orderbook = await self.get_orderbook(to_ticker, from_ticker)

        if not orderbook:
            # MM2 might not be running - return simulated quote
            return await self._get_simulated_quote(
                from_asset, to_asset, amount, slippage_tolerance
            )

        # Process orderbook to calculate expected output
        asks = orderbook.get("asks", [])
        if not asks:
            # No orders available - return simulated quote
            return await self._get_simulated_quote(
                from_asset, to_asset, amount, slippage_tolerance
            )

        # Calculate fill from orderbook
        remaining_amount = amount
        total_output = Decimal("0")
        total_filled = Decimal("0")

        for order in asks:
            price = Decimal(str(order.get("price", "0")))
            max_volume = Decimal(str(order.get("maxvolume", "0")))

            if price <= 0 or max_volume <= 0:
                continue

            # Calculate how much we can fill from this order
            # price is in rel/base (from_asset per to_asset)
            available_base = max_volume
            needed_rel = remaining_amount

            # How much base (to_asset) can we get for our rel (from_asset)?
            fillable_base = needed_rel / price if price > 0 else Decimal("0")
            fill_base = min(fillable_base, available_base)
            fill_rel = fill_base * price

            total_output += fill_base
            total_filled += fill_rel
            remaining_amount -= fill_rel

            if remaining_amount <= 0:
                break

        if total_output <= 0:
            return await self._get_simulated_quote(
                from_asset, to_asset, amount, slippage_tolerance
            )

        # Estimate fees (MM2 has minimal trading fees, mainly network fees)
        # Typical dex_fee is 1/777 of the trade amount
        dex_fee = amount / Decimal("777")
        network_fee = Decimal("0.0001")  # Varies by coin

        # Calculate effective slippage
        avg_price = total_filled / total_output if total_output > 0 else Decimal("0")
        best_price = Decimal(str(asks[0].get("price", "1"))) if asks else Decimal("1")
        slippage = ((avg_price - best_price) / best_price * 100) if best_price > 0 else Decimal("0")

        return Quote(
            provider=self.name,
            from_asset=from_asset.upper(),
            to_asset=to_asset.upper(),
            from_amount=amount,
            to_amount=total_output,
            fee_asset=from_asset.upper(),
            fee_amount=dex_fee + network_fee,
            slippage_percent=abs(slippage),
            estimated_time_seconds=600,  # Atomic swaps typically take 5-20 mins
            route_details={
                "type": "atomic_swap",
                "base": to_ticker,
                "rel": from_ticker,
                "orders_matched": len([o for o in asks if Decimal(str(o.get("maxvolume", "0"))) > 0]),
                "dex_fee": str(dex_fee),
                "network_fee": str(network_fee),
                "avg_price": str(avg_price),
            },
            is_simulated=False,
        )

    async def _get_simulated_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        slippage_tolerance: Decimal,
    ) -> Quote:
        """Generate simulated quote when MM2 is not available.

        Uses approximate market rates for common pairs.
        """
        # Approximate rates (would be fetched from price feeds in production)
        usd_rates = {
            "BTC": Decimal("43000"),
            "ETH": Decimal("2300"),
            "LTC": Decimal("70"),
            "DOGE": Decimal("0.08"),
            "KMD": Decimal("0.25"),
            "BNB": Decimal("310"),
            "MATIC": Decimal("0.85"),
            "AVAX": Decimal("35"),
            "DASH": Decimal("28"),
            "BCH": Decimal("230"),
            "XRP": Decimal("0.55"),
            "ADA": Decimal("0.45"),
            "DOT": Decimal("7"),
            "SOL": Decimal("95"),
            "ATOM": Decimal("9"),
            "USDT": Decimal("1"),
            "USDT-ERC20": Decimal("1"),
            "USDT-BEP20": Decimal("1"),
            "USDC": Decimal("1"),
            "USDC-ERC20": Decimal("1"),
            "DAI": Decimal("1"),
            "BUSD": Decimal("1"),
        }

        from_norm = self._normalize_symbol(from_asset)
        to_norm = self._normalize_symbol(to_asset)

        from_rate = usd_rates.get(from_norm, Decimal("1"))
        to_rate = usd_rates.get(to_norm, Decimal("1"))

        # Calculate conversion with small spread (0.5%)
        spread = Decimal("0.995")
        to_amount = (amount * from_rate / to_rate) * spread

        # Simulated fee
        dex_fee = amount / Decimal("777")

        return Quote(
            provider=self.name,
            from_asset=from_asset.upper(),
            to_asset=to_asset.upper(),
            from_amount=amount,
            to_amount=to_amount,
            fee_asset=from_asset.upper(),
            fee_amount=dex_fee,
            slippage_percent=Decimal("0.5"),
            estimated_time_seconds=600,
            route_details={
                "type": "atomic_swap",
                "simulated": True,
                "note": "MM2 not connected, using estimated rates",
            },
            is_simulated=True,
        )

    async def execute_swap(self, route: SwapRoute) -> dict:
        """Execute atomic swap via MM2.

        Initiates an atomic swap order. The swap is trustless and
        executed on-chain through HTLC contracts.

        Returns:
            Execution result with swap UUID or error details
        """
        from_ticker = self._get_mm2_ticker(route.quote.from_asset)
        to_ticker = self._get_mm2_ticker(route.quote.to_asset)

        if not from_ticker or not to_ticker:
            return {"success": False, "error": "Unknown asset ticker"}

        # Calculate price (rel per base)
        price = route.quote.from_amount / route.quote.to_amount if route.quote.to_amount > 0 else Decimal("0")

        # Execute buy order (buying to_asset with from_asset)
        result = await self._rpc_call("buy", {
            "base": to_ticker,
            "rel": from_ticker,
            "price": str(price),
            "volume": str(route.quote.to_amount),
        })

        if not result:
            # MM2 not available - return simulated result
            import secrets
            return {
                "success": True,
                "simulated": True,
                "provider": self.name,
                "swap_uuid": f"sim_mm2_{secrets.token_hex(16)}",
                "message": "Simulated atomic swap (MM2 not connected)",
                "expected_output": {
                    "amount": str(route.quote.to_amount),
                    "asset": route.quote.to_asset,
                },
            }

        if "error" in result:
            return {
                "success": False,
                "error": result.get("error", "Unknown error"),
            }

        swap_result = result.get("result", {})

        return {
            "success": True,
            "provider": self.name,
            "swap_uuid": swap_result.get("uuid", ""),
            "order_type": "maker" if swap_result.get("order_type") == "Maker" else "taker",
            "base": to_ticker,
            "rel": from_ticker,
            "base_amount": str(route.quote.to_amount),
            "rel_amount": str(route.quote.from_amount),
            "instructions": {
                "action": "Atomic swap initiated",
                "note": "Swap will complete automatically via HTLC",
                "estimated_time": "5-20 minutes",
            },
        }

    async def get_swap_status(self, uuid: str) -> Optional[dict]:
        """Get status of an atomic swap.

        Args:
            uuid: Swap UUID

        Returns:
            Swap status information
        """
        result = await self._rpc_call("my_swap_status", {
            "params": {"uuid": uuid},
        })

        if result and "result" in result:
            return result["result"]
        return None

    async def get_my_orders(self) -> Optional[dict]:
        """Get all active orders.

        Returns:
            Dictionary with maker_orders and taker_orders
        """
        return await self._rpc_call("my_orders")

    async def cancel_order(self, uuid: str) -> bool:
        """Cancel an active order.

        Args:
            uuid: Order UUID

        Returns:
            True if cancelled successfully
        """
        result = await self._rpc_call("cancel_order", {
            "uuid": uuid,
        })
        return result is not None and "error" not in result
