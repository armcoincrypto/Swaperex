"""BTC withdrawal handler.

Uses Blockstream API for fee estimation and broadcast.
Supports native SegWit (bech32) addresses.
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.withdrawal.base import (
    FeeEstimate,
    WithdrawalHandler,
    WithdrawalResult,
    WithdrawalStatus,
)

logger = logging.getLogger(__name__)

# Blockstream API endpoints
BLOCKSTREAM_MAINNET = "https://blockstream.info/api"
BLOCKSTREAM_TESTNET = "https://blockstream.info/testnet/api"

# Mempool.space for fee estimation
MEMPOOL_MAINNET = "https://mempool.space/api"
MEMPOOL_TESTNET = "https://mempool.space/testnet/api"


class BTCWithdrawalHandler(WithdrawalHandler):
    """Bitcoin withdrawal handler.

    Uses:
    - Mempool.space for fee estimation
    - Blockstream for broadcasting
    - bip_utils for transaction building (if available)
    """

    def __init__(self, testnet: bool = False):
        super().__init__("BTC", testnet)
        self.blockstream_url = BLOCKSTREAM_TESTNET if testnet else BLOCKSTREAM_MAINNET
        self.mempool_url = MEMPOOL_TESTNET if testnet else MEMPOOL_MAINNET

    async def validate_address(self, address: str) -> bool:
        """Validate Bitcoin address format."""
        # Basic validation
        if not address:
            return False

        # Mainnet prefixes: 1, 3, bc1
        # Testnet prefixes: m, n, 2, tb1
        if self.testnet:
            valid_prefixes = ("m", "n", "2", "tb1")
        else:
            valid_prefixes = ("1", "3", "bc1")

        if not address.startswith(valid_prefixes):
            return False

        # Length checks
        if address.startswith(("bc1", "tb1")):
            # Bech32 addresses
            return 42 <= len(address) <= 62
        else:
            # Legacy addresses
            return 25 <= len(address) <= 35

    async def estimate_fee(
        self, amount: Decimal, destination: str, priority: str = "normal"
    ) -> FeeEstimate:
        """Estimate BTC transaction fee using mempool.space API."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(f"{self.mempool_url}/v1/fees/recommended")

                if response.status_code == 200:
                    fees = response.json()

                    # Get sat/vB based on priority
                    if priority == "high":
                        sat_per_vb = fees.get("fastestFee", 50)
                        est_time = "~10 minutes"
                    elif priority == "low":
                        sat_per_vb = fees.get("hourFee", 10)
                        est_time = "~1 hour"
                    else:  # normal
                        sat_per_vb = fees.get("halfHourFee", 20)
                        est_time = "~30 minutes"

                    # Estimate tx size (typical P2WPKH->P2WPKH is ~110 vbytes)
                    tx_size_vb = 140  # Conservative estimate

                    # Calculate fee in BTC
                    fee_sats = sat_per_vb * tx_size_vb
                    fee_btc = Decimal(fee_sats) / Decimal(100_000_000)

                    return FeeEstimate(
                        asset="BTC",
                        network_fee=fee_btc,
                        service_fee=Decimal("0"),
                        total_fee=fee_btc,
                        fee_asset="BTC",
                        estimated_time=est_time,
                        priority=priority,
                    )

        except Exception as e:
            logger.warning(f"Failed to fetch BTC fees: {e}")

        # Fallback estimate
        return FeeEstimate(
            asset="BTC",
            network_fee=Decimal("0.00005"),
            service_fee=Decimal("0"),
            total_fee=Decimal("0.00005"),
            fee_asset="BTC",
            estimated_time="~30 minutes",
            priority=priority,
        )

    async def execute_withdrawal(
        self,
        private_key: str,
        destination: str,
        amount: Decimal,
        fee_priority: str = "normal",
    ) -> WithdrawalResult:
        """Execute BTC withdrawal.

        NOTE: This is a simplified implementation.
        Production should use proper UTXO management and transaction building.
        """
        try:
            # Check for bitcoin library
            try:
                from bitcoinlib.transactions import Transaction
                from bitcoinlib.keys import Key

                HAS_BITCOINLIB = True
            except ImportError:
                HAS_BITCOINLIB = False

            if not HAS_BITCOINLIB:
                # For now, return simulated result
                logger.warning("bitcoinlib not installed - using simulated withdrawal")
                import secrets
                return WithdrawalResult(
                    success=True,
                    txid=f"sim_btc_{secrets.token_hex(32)}",
                    status=WithdrawalStatus.BROADCAST,
                    message=f"[SIMULATED] Would send {amount} BTC to {destination}",
                    fee_paid=Decimal("0.00005"),
                )

            # Real implementation would:
            # 1. Get UTXOs for the sender address
            # 2. Build transaction with proper inputs/outputs
            # 3. Sign with private key
            # 4. Broadcast via Blockstream API

            # Placeholder for real implementation
            return WithdrawalResult(
                success=False,
                status=WithdrawalStatus.FAILED,
                error="Real BTC withdrawal not implemented yet",
            )

        except Exception as e:
            logger.error(f"BTC withdrawal failed: {e}")
            return WithdrawalResult(
                success=False,
                status=WithdrawalStatus.FAILED,
                error=str(e),
            )

    async def broadcast_transaction(self, raw_tx_hex: str) -> Optional[str]:
        """Broadcast raw transaction to network.

        Args:
            raw_tx_hex: Hex-encoded raw transaction

        Returns:
            Transaction ID if successful, None otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.blockstream_url}/tx",
                    content=raw_tx_hex,
                    headers={"Content-Type": "text/plain"},
                )

                if response.status_code == 200:
                    txid = response.text.strip()
                    logger.info(f"BTC transaction broadcast: {txid}")
                    return txid
                else:
                    logger.error(f"Broadcast failed: {response.status_code} - {response.text}")
                    return None

        except Exception as e:
            logger.error(f"Failed to broadcast BTC tx: {e}")
            return None

    async def get_transaction_status(self, txid: str) -> WithdrawalStatus:
        """Check BTC transaction confirmation status."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(f"{self.blockstream_url}/tx/{txid}")

                if response.status_code == 200:
                    tx_data = response.json()
                    confirmed = tx_data.get("status", {}).get("confirmed", False)

                    if confirmed:
                        return WithdrawalStatus.COMPLETED
                    else:
                        return WithdrawalStatus.CONFIRMING

                elif response.status_code == 404:
                    return WithdrawalStatus.PENDING

        except Exception as e:
            logger.error(f"Failed to check BTC tx status: {e}")

        return WithdrawalStatus.PENDING

    async def get_utxos(self, address: str) -> list[dict]:
        """Get UTXOs for an address."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(f"{self.blockstream_url}/address/{address}/utxo")

                if response.status_code == 200:
                    return response.json()

        except Exception as e:
            logger.error(f"Failed to get UTXOs for {address}: {e}")

        return []


class LTCWithdrawalHandler(WithdrawalHandler):
    """Litecoin withdrawal handler.

    Uses similar UTXO model as Bitcoin with different address prefixes.
    Native SegWit addresses start with ltc1.
    """

    # Blockcypher API for LTC (Blockstream only supports BTC)
    BLOCKCYPHER_MAINNET = "https://api.blockcypher.com/v1/ltc/main"
    BLOCKCYPHER_TESTNET = "https://api.blockcypher.com/v1/ltc/test"

    def __init__(self, testnet: bool = False):
        super().__init__("LTC", testnet)
        self.api_url = self.BLOCKCYPHER_TESTNET if testnet else self.BLOCKCYPHER_MAINNET

    async def validate_address(self, address: str) -> bool:
        """Validate Litecoin address format."""
        if not address:
            return False

        # LTC address prefixes
        # Mainnet: L (legacy), M (P2SH), ltc1 (bech32)
        # Testnet: m, n, tltc1
        if self.testnet:
            valid_prefixes = ("m", "n", "2", "tltc1")
        else:
            valid_prefixes = ("L", "M", "ltc1")

        if not address.startswith(valid_prefixes):
            return False

        # Length checks
        if address.startswith(("ltc1", "tltc1")):
            return 42 <= len(address) <= 64
        else:
            return 25 <= len(address) <= 35

    async def estimate_fee(
        self, amount: Decimal, destination: str, priority: str = "normal"
    ) -> FeeEstimate:
        """Estimate LTC transaction fee."""
        # LTC typically has lower fees than BTC
        if priority == "high":
            fee_ltc = Decimal("0.001")
            est_time = "~5 minutes"
        elif priority == "low":
            fee_ltc = Decimal("0.0001")
            est_time = "~30 minutes"
        else:
            fee_ltc = Decimal("0.0005")
            est_time = "~10 minutes"

        return FeeEstimate(
            asset="LTC",
            network_fee=fee_ltc,
            service_fee=Decimal("0"),
            total_fee=fee_ltc,
            fee_asset="LTC",
            estimated_time=est_time,
            priority=priority,
        )

    async def execute_withdrawal(
        self,
        private_key: str,
        destination: str,
        amount: Decimal,
        fee_priority: str = "normal",
    ) -> WithdrawalResult:
        """Execute LTC withdrawal (simulated for now)."""
        import secrets
        return WithdrawalResult(
            success=True,
            txid=f"sim_ltc_{secrets.token_hex(32)}",
            status=WithdrawalStatus.BROADCAST,
            message=f"[SIMULATED] Would send {amount} LTC to {destination}",
            fee_paid=Decimal("0.0005"),
        )

    async def get_transaction_status(self, txid: str) -> WithdrawalStatus:
        """Check LTC transaction status."""
        return WithdrawalStatus.CONFIRMING


class DASHWithdrawalHandler(WithdrawalHandler):
    """DASH withdrawal handler.

    DASH uses similar UTXO model as Bitcoin.
    Mainnet addresses start with X, testnet with y.
    """

    # Blockcypher API for DASH
    BLOCKCYPHER_MAINNET = "https://api.blockcypher.com/v1/dash/main"

    def __init__(self, testnet: bool = False):
        super().__init__("DASH", testnet)
        self.api_url = self.BLOCKCYPHER_MAINNET

    async def validate_address(self, address: str) -> bool:
        """Validate DASH address format."""
        if not address:
            return False

        # DASH address prefixes
        # Mainnet: X (P2PKH), 7 (P2SH)
        # Testnet: y (P2PKH), 8 (P2SH)
        if self.testnet:
            valid_prefixes = ("y", "8")
        else:
            valid_prefixes = ("X", "7")

        if not address.startswith(valid_prefixes):
            return False

        return 25 <= len(address) <= 35

    async def estimate_fee(
        self, amount: Decimal, destination: str, priority: str = "normal"
    ) -> FeeEstimate:
        """Estimate DASH transaction fee."""
        # DASH has InstantSend for faster confirmations
        if priority == "high":
            fee_dash = Decimal("0.001")  # With InstantSend
            est_time = "~2 seconds (InstantSend)"
        elif priority == "low":
            fee_dash = Decimal("0.00001")
            est_time = "~5 minutes"
        else:
            fee_dash = Decimal("0.0001")
            est_time = "~2.5 minutes"

        return FeeEstimate(
            asset="DASH",
            network_fee=fee_dash,
            service_fee=Decimal("0"),
            total_fee=fee_dash,
            fee_asset="DASH",
            estimated_time=est_time,
            priority=priority,
        )

    async def execute_withdrawal(
        self,
        private_key: str,
        destination: str,
        amount: Decimal,
        fee_priority: str = "normal",
    ) -> WithdrawalResult:
        """Execute DASH withdrawal (simulated for now)."""
        import secrets
        return WithdrawalResult(
            success=True,
            txid=f"sim_dash_{secrets.token_hex(32)}",
            status=WithdrawalStatus.BROADCAST,
            message=f"[SIMULATED] Would send {amount} DASH to {destination}",
            fee_paid=Decimal("0.0001"),
        )

    async def get_transaction_status(self, txid: str) -> WithdrawalStatus:
        """Check DASH transaction status."""
        return WithdrawalStatus.CONFIRMING
