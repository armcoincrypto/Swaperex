"""mm2 (AtomicDEX) Adapter for P2P atomic swaps.

mm2 enables trustless atomic swaps between different blockchains
without any centralized intermediary. It's the cheapest option
when liquidity is available.

Requirements:
- mm2 node running locally (docker or binary)
- Wallets funded for the assets you want to swap

mm2 RPC Documentation: https://developers.komodoplatform.com/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.swap_engine.router import SwapQuote, SwapRoute

logger = logging.getLogger(__name__)

# Default mm2 RPC endpoint
MM2_DEFAULT_URL = "http://127.0.0.1:7783"


class MM2Adapter:
    """Adapter for mm2 atomic swaps.

    mm2 uses HTLC (Hash Time Locked Contracts) for trustless
    cross-chain swaps. No fees beyond network fees.
    """

    def __init__(self, rpc_url: str = MM2_DEFAULT_URL, userpass: str = ""):
        self.rpc_url = rpc_url
        self.userpass = userpass
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def _rpc(self, method: str, params: dict = None) -> dict:
        """Make mm2 RPC call."""
        client = await self._get_client()

        payload = {
            "userpass": self.userpass,
            "method": method,
        }
        if params:
            payload.update(params)

        try:
            response = await client.post(self.rpc_url, json=payload)
            return response.json()
        except Exception as e:
            logger.error(f"mm2 RPC error: {e}")
            return {"error": str(e)}

    async def is_available(self) -> bool:
        """Check if mm2 node is running and accessible."""
        try:
            result = await self._rpc("version")
            return "result" in result
        except Exception:
            return False

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
    ) -> Optional[SwapQuote]:
        """Get best available order from mm2 orderbook.

        Returns None if no orders available or mm2 not running.
        """
        if not await self.is_available():
            logger.debug("mm2 not available")
            return None

        try:
            # Get orderbook for this pair
            orderbook = await self._rpc("orderbook", {
                "base": from_asset.upper(),
                "rel": to_asset.upper(),
            })

            if "error" in orderbook:
                logger.debug(f"mm2 orderbook error: {orderbook['error']}")
                return None

            asks = orderbook.get("asks", [])
            if not asks:
                logger.debug(f"No mm2 orders for {from_asset}->{to_asset}")
                return None

            # Find best price that can fill our amount
            best_ask = None
            for ask in asks:
                available = Decimal(str(ask.get("maxvolume", 0)))
                if available >= amount:
                    best_ask = ask
                    break

            if not best_ask:
                logger.debug(f"No mm2 order can fill {amount} {from_asset}")
                return None

            # Calculate output amount
            price = Decimal(str(best_ask.get("price", 0)))
            to_amount = amount * price

            return SwapQuote(
                route=SwapRoute.MM2,
                from_asset=from_asset.upper(),
                to_asset=to_asset.upper(),
                from_amount=amount,
                to_amount=to_amount,
                fee_usd=Decimal("0"),  # mm2 has no platform fees
                slippage_pct=Decimal("0"),
                estimated_time_seconds=60,  # Atomic swaps ~1 minute
                expires_at=0,
                mm2_order_id=best_ask.get("uuid"),
                extra={
                    "price": str(price),
                    "maker_address": best_ask.get("address"),
                    "pubkey": best_ask.get("pubkey"),
                }
            )

        except Exception as e:
            logger.error(f"mm2 get_quote error: {e}")
            return None

    async def create_order(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        price: Optional[Decimal] = None,
    ) -> Optional[dict]:
        """Create a taker order to swap assets.

        If price is None, takes best available price from orderbook.
        """
        try:
            # Get best price if not specified
            if price is None:
                quote = await self.get_quote(from_asset, to_asset, amount)
                if not quote:
                    return None
                price = Decimal(quote.extra.get("price", 0))

            # Create taker order (buy)
            result = await self._rpc("buy", {
                "base": to_asset.upper(),
                "rel": from_asset.upper(),
                "volume": str(amount * price),  # Amount of base to buy
                "price": str(Decimal("1") / price),  # Inverse price
            })

            if "error" in result:
                logger.error(f"mm2 create_order error: {result['error']}")
                return None

            return {
                "order_id": result.get("result", {}).get("uuid"),
                "from_asset": from_asset.upper(),
                "to_asset": to_asset.upper(),
                "amount": str(amount),
                "price": str(price),
            }

        except Exception as e:
            logger.error(f"mm2 create_order error: {e}")
            return None

    async def check_order_status(self, order_id: str) -> dict:
        """Check status of an order."""
        try:
            result = await self._rpc("order_status", {
                "uuid": order_id,
            })

            if "error" in result:
                return {"status": "error", "error": result["error"]}

            order = result.get("result", {})
            order_type = order.get("type", "")

            # Check if matched
            if order_type == "Taker":
                status = order.get("order_status", "")
                if status == "Matched":
                    return {
                        "status": "matched",
                        "matched": True,
                    }
                elif status == "Cancelled":
                    return {
                        "status": "cancelled",
                        "failed": True,
                    }

            return {"status": order_type.lower(), "matched": False}

        except Exception as e:
            logger.error(f"mm2 check_order_status error: {e}")
            return {"status": "error", "error": str(e)}

    async def execute_swap(self, order_id: str) -> dict:
        """Execute matched swap.

        Note: mm2 handles swap execution automatically once matched.
        This method waits for swap completion.
        """
        import asyncio

        max_wait = 300  # 5 minutes max for atomic swap
        poll_interval = 5

        for _ in range(max_wait // poll_interval):
            try:
                # Check swap status
                result = await self._rpc("my_swap_status", {
                    "params": {"uuid": order_id},
                })

                if "error" not in result:
                    swap = result.get("result", {})
                    events = swap.get("events", [])

                    # Check for completion
                    for event in events:
                        event_type = event.get("event", {}).get("type", "")
                        if event_type == "Finished":
                            return {
                                "success": True,
                                "maker_txid": swap.get("maker_payment_tx", {}).get("tx_hash"),
                                "taker_txid": swap.get("taker_payment_tx", {}).get("tx_hash"),
                                "to_amount": swap.get("my_info", {}).get("my_amount"),
                            }
                        if event_type in ("Failed", "MakerPaymentWaitRefundStarted"):
                            return {
                                "success": False,
                                "error": f"Swap failed: {event_type}",
                            }

                await asyncio.sleep(poll_interval)

            except Exception as e:
                logger.warning(f"mm2 execute_swap poll error: {e}")
                await asyncio.sleep(poll_interval)

        return {
            "success": False,
            "error": "Swap timeout",
        }

    async def cancel_order(self, order_id: str) -> bool:
        """Cancel an order."""
        try:
            result = await self._rpc("cancel_order", {
                "uuid": order_id,
            })
            return "error" not in result
        except Exception:
            return False


def get_mm2_adapter(rpc_url: str = MM2_DEFAULT_URL) -> MM2Adapter:
    """Get mm2 adapter instance."""
    return MM2Adapter(rpc_url=rpc_url)
