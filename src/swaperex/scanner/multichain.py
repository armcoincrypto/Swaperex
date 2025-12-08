"""Multi-chain deposit scanners for SOL and ATOM.

Each scanner monitors blockchain for incoming deposits.
Both chains have DEX support (Jupiter for SOL, Osmosis for ATOM).
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.scanner.base import DepositInfo, DepositScanner

logger = logging.getLogger(__name__)


class SolanaScanner(DepositScanner):
    """Solana deposit scanner using Solana RPC or Helius API.

    Monitors SOL and SPL token transfers.
    DEX support: Jupiter
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        testnet: bool = False,
    ):
        self._api_key = api_key
        self._testnet = testnet

        # Use Helius API if key provided, otherwise public RPC
        if api_key:
            self.base_url = f"https://mainnet.helius-rpc.com/?api-key={api_key}"
        else:
            self.base_url = (
                "https://api.devnet.solana.com" if testnet
                else "https://api.mainnet-beta.solana.com"
            )

    @property
    def asset(self) -> str:
        return "SOL"

    @property
    def confirmations_required(self) -> int:
        return 32  # Solana finality

    async def get_transactions(
        self,
        address: str,
        limit: int = 10,
    ) -> list[DepositInfo]:
        """Get recent transactions for a Solana address."""
        deposits = []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get signatures for address
                response = await client.post(
                    self.base_url,
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getSignaturesForAddress",
                        "params": [
                            address,
                            {"limit": limit}
                        ]
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    signatures = data.get("result", [])

                    for sig_info in signatures:
                        # Get transaction details
                        tx_response = await client.post(
                            self.base_url,
                            json={
                                "jsonrpc": "2.0",
                                "id": 1,
                                "method": "getTransaction",
                                "params": [
                                    sig_info["signature"],
                                    {"encoding": "jsonParsed"}
                                ]
                            }
                        )

                        if tx_response.status_code == 200:
                            tx_data = tx_response.json().get("result")
                            if tx_data:
                                deposit = self._parse_transaction(tx_data, address)
                                if deposit:
                                    deposits.append(deposit)

        except Exception as e:
            logger.error(f"Solana scanner error: {e}")

        return deposits

    def _parse_transaction(self, tx_data: dict, address: str) -> Optional[DepositInfo]:
        """Parse Solana transaction for deposits."""
        try:
            meta = tx_data.get("meta", {})
            if meta.get("err"):
                return None  # Failed transaction

            slot = tx_data.get("slot", 0)
            signature = tx_data.get("transaction", {}).get("signatures", [None])[0]

            # Check post balances for deposit amount
            pre_balances = meta.get("preBalances", [])
            post_balances = meta.get("postBalances", [])
            accounts = tx_data.get("transaction", {}).get("message", {}).get("accountKeys", [])

            for i, account in enumerate(accounts):
                account_key = account.get("pubkey") if isinstance(account, dict) else account
                if account_key == address:
                    if i < len(pre_balances) and i < len(post_balances):
                        amount_lamports = post_balances[i] - pre_balances[i]
                        if amount_lamports > 0:
                            amount = Decimal(amount_lamports) / Decimal(10 ** 9)
                            return DepositInfo(
                                tx_hash=signature,
                                address=address,
                                amount=amount,
                                asset="SOL",
                                confirmations=32,  # Assume finalized
                                block_height=slot,
                            )

        except Exception as e:
            logger.debug(f"Error parsing SOL transaction: {e}")

        return None

    async def get_balance(self, address: str) -> Decimal:
        """Get SOL balance for address."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.base_url,
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getBalance",
                        "params": [address]
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    lamports = data.get("result", {}).get("value", 0)
                    return Decimal(lamports) / Decimal(10 ** 9)

        except Exception as e:
            logger.error(f"Solana balance error: {e}")

        return Decimal("0")


class ATOMScanner(DepositScanner):
    """Cosmos (ATOM) deposit scanner.

    Uses Cosmos LCD API.
    DEX support: Osmosis
    """

    def __init__(
        self,
        testnet: bool = False,
    ):
        self._testnet = testnet
        self.base_url = (
            "https://rest.sentry-01.theta-testnet.polypore.xyz" if testnet
            else "https://cosmos-rest.publicnode.com"
        )

    @property
    def asset(self) -> str:
        return "ATOM"

    @property
    def confirmations_required(self) -> int:
        return 1  # Cosmos has fast finality

    async def get_transactions(
        self,
        address: str,
        limit: int = 10,
    ) -> list[DepositInfo]:
        """Get recent ATOM transactions for address."""
        deposits = []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get transactions received by address
                response = await client.get(
                    f"{self.base_url}/cosmos/tx/v1beta1/txs",
                    params={
                        "events": f"transfer.recipient='{address}'",
                        "pagination.limit": limit,
                        "order_by": "ORDER_BY_DESC",
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    txs = data.get("tx_responses", [])

                    for tx in txs:
                        if tx.get("code") == 0:  # Successful tx
                            # Parse transfer events
                            for log in tx.get("logs", []):
                                for event in log.get("events", []):
                                    if event.get("type") == "transfer":
                                        attrs = {a["key"]: a["value"] for a in event.get("attributes", [])}
                                        if attrs.get("recipient") == address:
                                            amount_str = attrs.get("amount", "0uatom")
                                            if "uatom" in amount_str:
                                                amount_uatom = int(amount_str.replace("uatom", ""))
                                                amount = Decimal(amount_uatom) / Decimal(10 ** 6)
                                                deposits.append(DepositInfo(
                                                    tx_hash=tx.get("txhash"),
                                                    address=address,
                                                    amount=amount,
                                                    asset="ATOM",
                                                    confirmations=1,
                                                    block_height=int(tx.get("height", 0)),
                                                ))

        except Exception as e:
            logger.error(f"ATOM scanner error: {e}")

        return deposits

    async def get_balance(self, address: str) -> Decimal:
        """Get ATOM balance for address."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/cosmos/bank/v1beta1/balances/{address}"
                )

                if response.status_code == 200:
                    data = response.json()
                    balances = data.get("balances", [])
                    for bal in balances:
                        if bal.get("denom") == "uatom":
                            amount_uatom = int(bal.get("amount", "0"))
                            return Decimal(amount_uatom) / Decimal(10 ** 6)

        except Exception as e:
            logger.error(f"ATOM balance error: {e}")

        return Decimal("0")
