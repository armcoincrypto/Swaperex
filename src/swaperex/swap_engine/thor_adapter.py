"""THORChain Swap Adapter - Execute real cross-chain swaps.

This adapter handles the full swap flow:
1. Get quote from THORNode
2. Send funds to vault with memo
3. Monitor for outbound transaction
4. Return result

Requires hot wallet to be configured for each supported chain.
"""

import asyncio
import logging
import os
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.swap_engine.router import SwapQuote, SwapRoute

logger = logging.getLogger(__name__)

# THORNode endpoints
THORNODE_URL = "https://thornode.ninerealms.com"
MIDGARD_URL = "https://midgard.ninerealms.com/v2"

# Asset mappings
THORCHAIN_ASSETS = {
    "BTC": "BTC.BTC",
    "ETH": "ETH.ETH",
    "LTC": "LTC.LTC",
    "DASH": "DASH.DASH",
    "DOGE": "DOGE.DOGE",
    "BCH": "BCH.BCH",
    "AVAX": "AVAX.AVAX",
    "ATOM": "GAIA.ATOM",
    "BNB": "BSC.BNB",
    "BSC": "BSC.BNB",
    "RUNE": "THOR.RUNE",
    "USDT": "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7",
    "USDT-ERC20": "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7",
    "USDC": "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
    "USDC-ERC20": "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
}

# Chain decimals
CHAIN_DECIMALS = {
    "BTC": 8, "LTC": 8, "DASH": 8, "DOGE": 8, "BCH": 8,
    "ETH": 18, "AVAX": 18, "BSC": 18,
    "ATOM": 6, "RUNE": 8,
    "USDT": 6, "USDC": 6,
}


class THORChainSwapAdapter:
    """Adapter for executing real THORChain swaps."""

    def __init__(self, thornode_url: str = THORNODE_URL):
        self.thornode_url = thornode_url
        self.midgard_url = MIDGARD_URL
        self._withdrawal_handlers = {}

    def _get_thor_asset(self, asset: str) -> Optional[str]:
        """Convert asset to THORChain identifier."""
        return THORCHAIN_ASSETS.get(asset.upper())

    def _get_decimals(self, asset: str) -> int:
        """Get decimal places for asset."""
        return CHAIN_DECIMALS.get(asset.upper(), 8)

    def _to_base_units(self, amount: Decimal, asset: str) -> int:
        """Convert to base units."""
        decimals = self._get_decimals(asset)
        return int(amount * (10 ** decimals))

    def _from_base_units(self, amount: int, asset: str) -> Decimal:
        """Convert from base units."""
        decimals = self._get_decimals(asset)
        return Decimal(amount) / (10 ** decimals)

    async def get_quote(
        self,
        from_asset: str,
        to_asset: str,
        amount: Decimal,
        dest_address: Optional[str] = None,
    ) -> Optional[SwapQuote]:
        """Get swap quote from THORChain."""
        from_thor = self._get_thor_asset(from_asset)
        to_thor = self._get_thor_asset(to_asset)

        if not from_thor or not to_thor:
            logger.warning(f"Unsupported THORChain pair: {from_asset} -> {to_asset}")
            return None

        amount_base = self._to_base_units(amount, from_asset)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                params = {
                    "from_asset": from_thor,
                    "to_asset": to_thor,
                    "amount": amount_base,
                }

                if dest_address:
                    params["destination"] = dest_address
                    params["tolerance_bps"] = 100  # 1% slippage

                response = await client.get(
                    f"{self.thornode_url}/thorchain/quote/swap",
                    params=params,
                )

                if response.status_code != 200:
                    logger.warning(f"THORChain quote error: {response.status_code}")
                    return None

                data = response.json()

                if "error" in data:
                    logger.warning(f"THORChain quote error: {data['error']}")
                    return None

                # Parse response
                expected_out = self._from_base_units(
                    int(data.get("expected_amount_out", 0)),
                    to_asset
                )

                fees = data.get("fees", {})
                total_fees_base = int(fees.get("total", 0))
                # Fees are in output asset
                fee_usd = self._from_base_units(total_fees_base, to_asset)

                slippage_bps = int(data.get("slippage_bps", 0))
                slippage_pct = Decimal(slippage_bps) / Decimal(100)

                inbound_address = data.get("inbound_address", "")
                memo = data.get("memo", "")
                expiry = int(data.get("expiry", 0))

                # Estimated time
                inbound_secs = int(data.get("inbound_confirmation_seconds", 600))
                outbound_delay = int(data.get("outbound_delay_seconds", 0))
                total_time = inbound_secs + outbound_delay

                return SwapQuote(
                    route=SwapRoute.THORCHAIN,
                    from_asset=from_asset.upper(),
                    to_asset=to_asset.upper(),
                    from_amount=amount,
                    to_amount=expected_out,
                    fee_usd=fee_usd,
                    slippage_pct=slippage_pct,
                    estimated_time_seconds=total_time,
                    expires_at=expiry,
                    thor_vault_address=inbound_address,
                    thor_memo=memo,
                    extra={
                        "warning": data.get("warning"),
                        "fees": fees,
                        "recommended_min": data.get("recommended_min_amount_in"),
                    }
                )

        except Exception as e:
            logger.error(f"THORChain quote error: {e}")
            return None

    async def send_inbound(
        self,
        from_asset: str,
        amount: Decimal,
        vault_address: str,
        memo: str,
    ) -> dict:
        """Send funds to THORChain vault.

        Uses the configured withdrawal handler for the asset.
        """
        from_asset = from_asset.upper()

        try:
            # Get withdrawal handler for the asset
            handler = await self._get_withdrawal_handler(from_asset)

            if not handler:
                return {
                    "success": False,
                    "error": f"No withdrawal handler for {from_asset}",
                }

            # Execute withdrawal to vault address
            # The memo is included as OP_RETURN for UTXO chains
            result = await handler.execute_withdrawal(
                destination_address=vault_address,
                amount=amount,
                memo=memo,  # Pass memo for OP_RETURN
            )

            if result.success:
                logger.info(f"THORChain inbound sent: {result.txid}")
                return {
                    "success": True,
                    "txid": result.txid,
                }
            else:
                return {
                    "success": False,
                    "error": result.error,
                }

        except Exception as e:
            logger.error(f"Failed to send inbound: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def _get_withdrawal_handler(self, asset: str):
        """Get withdrawal handler for asset."""
        if asset not in self._withdrawal_handlers:
            # Import and create handler
            from swaperex.withdrawal.factory import get_withdrawal_handler
            handler = get_withdrawal_handler(asset)
            self._withdrawal_handlers[asset] = handler

        return self._withdrawal_handlers.get(asset)

    async def wait_for_outbound(
        self,
        inbound_txid: str,
        timeout: int = 1200,  # 20 minutes default
        poll_interval: int = 30,
    ) -> dict:
        """Wait for THORChain to process swap and send outbound.

        Args:
            inbound_txid: The inbound transaction hash
            timeout: Maximum seconds to wait
            poll_interval: Seconds between status checks

        Returns:
            Dict with success, amount_out, outbound_txid
        """
        import time
        deadline = time.time() + timeout

        while time.time() < deadline:
            try:
                status = await self._check_tx_status(inbound_txid)

                if status.get("status") == "done":
                    # Swap completed
                    return {
                        "success": True,
                        "amount_out": status.get("out_amount", 0),
                        "outbound_txid": status.get("out_tx_id"),
                    }

                if status.get("status") == "refunded":
                    return {
                        "success": False,
                        "error": "Swap was refunded",
                        "refund_txid": status.get("out_tx_id"),
                    }

                if status.get("status") == "failed":
                    return {
                        "success": False,
                        "error": status.get("error", "Swap failed"),
                    }

                logger.debug(f"Waiting for outbound... status: {status.get('status')}")
                await asyncio.sleep(poll_interval)

            except Exception as e:
                logger.warning(f"Error checking tx status: {e}")
                await asyncio.sleep(poll_interval)

        return {
            "success": False,
            "error": "Timeout waiting for outbound",
        }

    async def _check_tx_status(self, txid: str) -> dict:
        """Check transaction status on THORChain."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Try THORNode status endpoint
                response = await client.get(
                    f"{self.thornode_url}/thorchain/tx/status/{txid}"
                )

                if response.status_code == 200:
                    data = response.json()

                    # Parse stages
                    stages = data.get("stages", {})
                    inbound = stages.get("inbound_observed", {})
                    swap = stages.get("swap_status", {})
                    outbound = stages.get("outbound_signed", {})

                    if outbound.get("completed"):
                        return {
                            "status": "done",
                            "out_tx_id": data.get("out_txs", [{}])[0].get("id"),
                            "out_amount": data.get("out_txs", [{}])[0].get("coins", [{}])[0].get("amount"),
                        }

                    if swap.get("pending"):
                        return {"status": "pending"}

                    if inbound.get("completed"):
                        return {"status": "inbound_confirmed"}

                    return {"status": "observing"}

                # Try Midgard for more details
                response = await client.get(
                    f"{self.midgard_url}/actions",
                    params={"txid": txid}
                )

                if response.status_code == 200:
                    data = response.json()
                    actions = data.get("actions", [])
                    if actions:
                        action = actions[0]
                        status = action.get("status", "pending")

                        if status == "success":
                            out_txs = action.get("out", [])
                            if out_txs:
                                return {
                                    "status": "done",
                                    "out_tx_id": out_txs[0].get("txID"),
                                    "out_amount": out_txs[0].get("coins", [{}])[0].get("amount"),
                                }

                        return {"status": status}

                return {"status": "unknown"}

        except Exception as e:
            logger.error(f"Error checking tx status: {e}")
            return {"status": "error", "error": str(e)}

    async def get_inbound_addresses(self) -> dict[str, dict]:
        """Get current inbound vault addresses for all chains."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.thornode_url}/thorchain/inbound_addresses"
                )

                if response.status_code == 200:
                    data = response.json()

                    result = {}
                    for item in data:
                        chain = item.get("chain", "").upper()
                        if chain and not item.get("halted"):
                            result[chain] = {
                                "address": item.get("address"),
                                "gas_rate": item.get("gas_rate"),
                            }

                    return result

        except Exception as e:
            logger.error(f"Failed to get inbound addresses: {e}")

        return {}


def get_thor_adapter() -> THORChainSwapAdapter:
    """Get THORChain adapter instance."""
    return THORChainSwapAdapter()
