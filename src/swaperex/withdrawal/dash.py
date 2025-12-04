"""DASH withdrawal handler.

Uses BlockCypher API for fee estimation, UTXO queries, and broadcast.
DASH uses P2PKH addresses (X... on mainnet).

For automatic withdrawals, configure:
- HOT_WALLET_ADDRESS_DASH: Your hot wallet DASH address (X...)
- HOT_WALLET_PRIVATE_KEY_DASH: WIF-encoded private key
"""

import logging
import os
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

# BlockCypher API endpoint for DASH
BLOCKCYPHER_URL = "https://api.blockcypher.com/v1/dash/main"


class DASHWithdrawalHandler(WithdrawalHandler):
    """DASH withdrawal handler with automatic withdrawals via BlockCypher.

    Uses BlockCypher's transaction building API:
    1. POST /txs/new - Create unsigned transaction
    2. Sign locally with private key
    3. POST /txs/send - Broadcast signed transaction
    """

    def __init__(self, testnet: bool = False, api_key: Optional[str] = None):
        """Initialize DASH withdrawal handler."""
        super().__init__("DASH", testnet)
        self.api_key = api_key or os.environ.get("BLOCKCYPHER_API_KEY")
        self.base_url = BLOCKCYPHER_URL

        # Hot wallet for automatic withdrawals
        self.hot_wallet_address = os.environ.get("HOT_WALLET_ADDRESS_DASH")
        self.hot_wallet_wif = os.environ.get("HOT_WALLET_PRIVATE_KEY_DASH")

        if testnet:
            logger.warning("DASH testnet not supported by BlockCypher, using mainnet")
            self.testnet = False

    def _add_token(self, url: str) -> str:
        """Add API token to URL if configured."""
        if self.api_key:
            separator = "&" if "?" in url else "?"
            return f"{url}{separator}token={self.api_key}"
        return url

    async def validate_address(self, address: str) -> bool:
        """Validate DASH address format."""
        if not address:
            return False

        if self.testnet:
            valid_prefixes = ("y", "8")
        else:
            valid_prefixes = ("X", "7")

        if not address.startswith(valid_prefixes):
            return False

        return 25 <= len(address) <= 36

    async def estimate_fee(
        self, amount: Decimal, destination: str, priority: str = "normal"
    ) -> FeeEstimate:
        """Estimate DASH transaction fee using BlockCypher API."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                url = self._add_token(self.base_url)
                response = await client.get(url)

                if response.status_code == 200:
                    data = response.json()

                    if priority == "high":
                        duffs_per_kb = data.get("high_fee_per_kb", 20000)
                        est_time = "~2.5 minutes (1 block)"
                    elif priority == "low":
                        duffs_per_kb = data.get("low_fee_per_kb", 5000)
                        est_time = "~15 minutes (6 blocks)"
                    else:
                        duffs_per_kb = data.get("medium_fee_per_kb", 10000)
                        est_time = "~7.5 minutes (3 blocks)"

                    tx_size_bytes = 250
                    fee_duffs = (duffs_per_kb * tx_size_bytes) // 1000
                    fee_dash = Decimal(fee_duffs) / Decimal(100_000_000)

                    return FeeEstimate(
                        asset="DASH",
                        network_fee=fee_dash,
                        service_fee=Decimal("0"),
                        total_fee=fee_dash,
                        fee_asset="DASH",
                        estimated_time=est_time,
                        priority=priority,
                    )

        except Exception as e:
            logger.warning(f"Failed to fetch DASH fees: {e}")

        return FeeEstimate(
            asset="DASH",
            network_fee=Decimal("0.0001"),
            service_fee=Decimal("0"),
            total_fee=Decimal("0.0001"),
            fee_asset="DASH",
            estimated_time="~7.5 minutes",
            priority=priority,
        )

    async def execute_withdrawal(
        self,
        destination_address: str = None,
        amount: Decimal = None,
        private_key: str = None,
        destination: str = None,
        fee_priority: str = "normal",
    ) -> WithdrawalResult:
        """Execute DASH withdrawal using BlockCypher API.

        Supports both parameter styles for compatibility.
        Uses hot wallet if configured, otherwise queues for manual processing.
        """
        # Handle both parameter styles
        dest = destination_address or destination
        if not dest or amount is None:
            return WithdrawalResult(
                success=False,
                status=WithdrawalStatus.FAILED,
                error="Missing destination or amount",
            )

        # Use provided private key or hot wallet
        wif_key = private_key or self.hot_wallet_wif
        source_address = self.hot_wallet_address

        if not wif_key or not source_address:
            logger.warning("No hot wallet configured for DASH - queued for manual")
            return WithdrawalResult(
                success=False,
                status=WithdrawalStatus.PENDING,
                error="No hot wallet configured - queued for manual processing",
            )

        try:
            # Convert amount to duffs
            amount_duffs = int(amount * Decimal(100_000_000))

            async with httpx.AsyncClient(timeout=60.0) as client:
                # Step 1: Create unsigned transaction via BlockCypher
                tx_new_url = self._add_token(f"{self.base_url}/txs/new")

                tx_skeleton = {
                    "inputs": [{"addresses": [source_address]}],
                    "outputs": [{"addresses": [dest], "value": amount_duffs}],
                }

                logger.info(f"Creating DASH tx: {source_address} -> {dest}, {amount} DASH")

                response = await client.post(tx_new_url, json=tx_skeleton)

                if response.status_code != 201:
                    error_data = response.json() if response.text else {}
                    error_msg = error_data.get("error", response.text or "Unknown error")
                    logger.error(f"BlockCypher tx/new failed: {error_msg}")
                    return WithdrawalResult(
                        success=False,
                        status=WithdrawalStatus.FAILED,
                        error=f"Failed to create transaction: {error_msg}",
                    )

                tx_data = response.json()
                tosign = tx_data.get("tosign", [])

                if not tosign:
                    return WithdrawalResult(
                        success=False,
                        status=WithdrawalStatus.FAILED,
                        error="No data to sign from BlockCypher",
                    )

                # Step 2: Sign the transaction
                try:
                    signatures, pubkeys = self._sign_transaction(tosign, wif_key)
                except Exception as e:
                    logger.error(f"Signing failed: {e}")
                    return WithdrawalResult(
                        success=False,
                        status=WithdrawalStatus.FAILED,
                        error=f"Failed to sign: {e}",
                    )

                # Step 3: Send signed transaction
                tx_data["signatures"] = signatures
                tx_data["pubkeys"] = pubkeys

                tx_send_url = self._add_token(f"{self.base_url}/txs/send")
                response = await client.post(tx_send_url, json=tx_data)

                if response.status_code not in (200, 201):
                    error_data = response.json() if response.text else {}
                    error_msg = error_data.get("error", response.text or "Unknown error")
                    logger.error(f"BlockCypher tx/send failed: {error_msg}")
                    return WithdrawalResult(
                        success=False,
                        status=WithdrawalStatus.FAILED,
                        error=f"Broadcast failed: {error_msg}",
                    )

                result = response.json()
                txid = result.get("tx", {}).get("hash")

                if not txid:
                    return WithdrawalResult(
                        success=False,
                        status=WithdrawalStatus.FAILED,
                        error="No txid returned",
                    )

                fee_paid = Decimal(str(result.get("tx", {}).get("fees", 0))) / Decimal(100_000_000)
                logger.info(f"DASH withdrawal broadcast: {txid}")

                return WithdrawalResult(
                    success=True,
                    txid=txid,
                    status=WithdrawalStatus.BROADCAST,
                    message=f"Sent {amount} DASH to {dest}",
                    fee_paid=fee_paid,
                )

        except Exception as e:
            logger.error(f"DASH withdrawal failed: {e}")
            return WithdrawalResult(
                success=False,
                status=WithdrawalStatus.FAILED,
                error=str(e),
            )

    def _sign_transaction(self, tosign: list[str], wif_key: str) -> tuple[list[str], list[str]]:
        """Sign transaction hashes with WIF private key.

        Args:
            tosign: List of hex-encoded hashes to sign
            wif_key: WIF-encoded private key

        Returns:
            Tuple of (signatures_list, pubkeys_list)
        """
        try:
            import base58
            from ecdsa import SECP256k1, SigningKey
            from ecdsa.util import sigencode_der
        except ImportError:
            raise RuntimeError("Required packages: pip install base58 ecdsa")

        # Decode WIF
        decoded = base58.b58decode_check(wif_key)

        # Handle different WIF formats
        if decoded[0] in (0xCC, 0x80):  # DASH mainnet
            if len(decoded) == 34 and decoded[-1] == 0x01:
                privkey = decoded[1:-1]  # Compressed
                compressed = True
            else:
                privkey = decoded[1:]
                compressed = False
        else:
            raise ValueError(f"Invalid WIF prefix: {hex(decoded[0])}")

        # Create signing key
        sk = SigningKey.from_string(privkey, curve=SECP256k1)
        vk = sk.get_verifying_key()

        # Get public key
        if compressed:
            x = vk.pubkey.point.x()
            y = vk.pubkey.point.y()
            prefix = b'\x02' if y % 2 == 0 else b'\x03'
            pubkey_bytes = prefix + x.to_bytes(32, 'big')
        else:
            pubkey_bytes = b'\x04' + vk.to_string()

        pubkey_hex = pubkey_bytes.hex()

        # Sign each hash
        signatures = []
        pubkeys = []

        for hash_hex in tosign:
            hash_bytes = bytes.fromhex(hash_hex)
            sig = sk.sign_digest(hash_bytes, sigencode=sigencode_der)
            signatures.append(sig.hex())
            pubkeys.append(pubkey_hex)

        return signatures, pubkeys

    async def broadcast_transaction(self, raw_tx_hex: str) -> Optional[str]:
        """Broadcast raw transaction to DASH network."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                url = self._add_token(f"{self.base_url}/txs/push")
                response = await client.post(url, json={"tx": raw_tx_hex})

                if response.status_code == 201:
                    data = response.json()
                    txid = data.get("tx", {}).get("hash")
                    if txid:
                        logger.info(f"DASH transaction broadcast: {txid}")
                        return txid

                logger.error(f"DASH broadcast failed: {response.text}")
                return None

        except Exception as e:
            logger.error(f"Failed to broadcast DASH tx: {e}")
            return None

    async def get_transaction_status(self, txid: str) -> WithdrawalStatus:
        """Check DASH transaction confirmation status."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                url = self._add_token(f"{self.base_url}/txs/{txid}")
                response = await client.get(url)

                if response.status_code == 200:
                    tx_data = response.json()
                    confirmations = tx_data.get("confirmations", 0)

                    if confirmations >= 6:
                        return WithdrawalStatus.COMPLETED
                    elif confirmations > 0:
                        return WithdrawalStatus.CONFIRMING
                    else:
                        return WithdrawalStatus.BROADCAST

        except Exception as e:
            logger.error(f"Failed to check DASH tx status: {e}")

        return WithdrawalStatus.PENDING

    async def get_balance(self, address: str) -> Decimal:
        """Get DASH balance for an address."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                url = self._add_token(f"{self.base_url}/addrs/{address}/balance")
                response = await client.get(url)

                if response.status_code == 200:
                    data = response.json()
                    balance_duffs = data.get("balance", 0)
                    return Decimal(balance_duffs) / Decimal(100_000_000)

        except Exception as e:
            logger.error(f"Failed to get DASH balance: {e}")

        return Decimal("0")
