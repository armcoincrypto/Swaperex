"""BlockCypher API scanner for DASH and other coins.

BlockCypher provides free API access for multiple blockchains.
Docs: https://www.blockcypher.com/dev/dash/
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.scanner.base import DepositScanner, TransactionInfo

logger = logging.getLogger(__name__)


class BlockCypherScanner(DepositScanner):
    """Base deposit scanner using BlockCypher API.

    Supports: BTC, LTC, DASH, DOGE
    Free tier: 200 requests/hour without API key
    With API key: 2000 requests/hour
    """

    # Base API URL
    BASE_URL = "https://api.blockcypher.com/v1"

    # Chain identifiers
    CHAINS = {
        "BTC": ("btc", "main"),
        "BTC-TESTNET": ("btc", "test3"),
        "LTC": ("ltc", "main"),
        "DASH": ("dash", "main"),
        "DOGE": ("doge", "main"),
    }

    # Satoshi divisors per chain
    DIVISORS = {
        "BTC": Decimal("100000000"),
        "LTC": Decimal("100000000"),
        "DASH": Decimal("100000000"),
        "DOGE": Decimal("100000000"),
    }

    def __init__(
        self,
        asset: str,
        testnet: bool = False,
        api_key: Optional[str] = None,
    ):
        """Initialize BlockCypher scanner.

        Args:
            asset: Asset symbol (DASH, LTC, etc.)
            testnet: Use testnet if available
            api_key: Optional BlockCypher API key for higher rate limits
        """
        super().__init__(asset.upper())
        self.testnet = testnet
        self.api_key = api_key
        self._client: Optional[httpx.AsyncClient] = None

        # Get chain configuration
        chain_key = f"{asset.upper()}-TESTNET" if testnet else asset.upper()
        if chain_key not in self.CHAINS and asset.upper() in self.CHAINS:
            chain_key = asset.upper()

        if chain_key not in self.CHAINS:
            raise ValueError(f"Unsupported asset for BlockCypher: {asset}")

        coin, network = self.CHAINS[chain_key]
        self.base_url = f"{self.BASE_URL}/{coin}/{network}"

        # Divisor for converting from smallest unit
        self.divisor = self.DIVISORS.get(asset.upper(), Decimal("100000000"))

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    def _add_token(self, url: str) -> str:
        """Add API token to URL if configured."""
        if self.api_key:
            separator = "&" if "?" in url else "?"
            return f"{url}{separator}token={self.api_key}"
        return url

    async def get_address_transactions(
        self, address: str, min_confirmations: int = 1
    ) -> list[TransactionInfo]:
        """Get transactions for an address.

        Args:
            address: Blockchain address
            min_confirmations: Minimum confirmation count

        Returns:
            List of incoming transactions
        """
        client = await self._get_client()
        transactions = []

        try:
            # Get full address info including transactions
            url = self._add_token(f"{self.base_url}/addrs/{address}/full")
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()

            for tx in data.get("txs", []):
                tx_info = self._parse_transaction(tx, address)
                if tx_info and tx_info.confirmations >= min_confirmations:
                    transactions.append(tx_info)

        except httpx.HTTPError as e:
            logger.error(f"BlockCypher API error for {address}: {e}")
        except Exception as e:
            logger.error(f"Error parsing transactions for {address}: {e}")

        return transactions

    async def get_transaction(self, txid: str) -> Optional[TransactionInfo]:
        """Get a specific transaction.

        Args:
            txid: Transaction hash

        Returns:
            Transaction info or None
        """
        client = await self._get_client()

        try:
            url = self._add_token(f"{self.base_url}/txs/{txid}")
            response = await client.get(url)
            response.raise_for_status()
            tx = response.json()

            # Get first output address for parsing
            outputs = tx.get("outputs", [])
            if outputs and outputs[0].get("addresses"):
                address = outputs[0]["addresses"][0]
                return self._parse_transaction(tx, address)

            return None

        except httpx.HTTPError as e:
            logger.error(f"BlockCypher API error for tx {txid}: {e}")
            return None

    async def get_current_block_height(self) -> int:
        """Get current blockchain height."""
        client = await self._get_client()

        try:
            url = self._add_token(self.base_url)
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            return data.get("height", 0)
        except Exception as e:
            logger.error(f"Error getting block height: {e}")
            return 0

    def _parse_transaction(
        self, tx: dict, address: str
    ) -> Optional[TransactionInfo]:
        """Parse a BlockCypher API transaction response.

        Args:
            tx: Raw transaction data from API
            address: The address we're interested in

        Returns:
            TransactionInfo or None if not relevant
        """
        txid = tx.get("hash")
        if not txid:
            return None

        # Get confirmations (BlockCypher provides this directly)
        confirmations = tx.get("confirmations", 0)
        block_height = tx.get("block_height")

        # Sum outputs to our address
        total_received = Decimal("0")
        for output in tx.get("outputs", []):
            addresses = output.get("addresses", [])
            if address in addresses:
                # Amount is in smallest unit (satoshis/duffs)
                value = output.get("value", 0)
                total_received += Decimal(str(value)) / self.divisor

        if total_received <= 0:
            return None

        # Get sender address (first input)
        from_address = None
        inputs = tx.get("inputs", [])
        if inputs and inputs[0].get("addresses"):
            from_address = inputs[0]["addresses"][0]

        return TransactionInfo(
            txid=txid,
            asset=self.asset,
            to_address=address,
            amount=total_received,
            confirmations=confirmations,
            block_height=block_height,
            from_address=from_address,
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


class DASHScanner(BlockCypherScanner):
    """DASH deposit scanner using BlockCypher API.

    DASH uses P2PKH addresses starting with 'X' on mainnet.
    Confirmations: ~2.5 min per block, recommend 6 confirmations.
    """

    def __init__(self, testnet: bool = False, api_key: Optional[str] = None):
        """Initialize DASH scanner.

        Args:
            testnet: DASH testnet not supported by BlockCypher
            api_key: Optional API key for higher rate limits
        """
        if testnet:
            logger.warning("DASH testnet not supported by BlockCypher, using mainnet")
            testnet = False
        super().__init__("DASH", testnet=testnet, api_key=api_key)


class LTCScanner(BlockCypherScanner):
    """Litecoin deposit scanner using BlockCypher API."""

    def __init__(self, testnet: bool = False, api_key: Optional[str] = None):
        super().__init__("LTC", testnet=testnet, api_key=api_key)


class DOGEScanner(BlockCypherScanner):
    """Dogecoin deposit scanner using BlockCypher API."""

    def __init__(self, testnet: bool = False, api_key: Optional[str] = None):
        if testnet:
            logger.warning("DOGE testnet not supported by BlockCypher, using mainnet")
            testnet = False
        super().__init__("DOGE", testnet=testnet, api_key=api_key)
