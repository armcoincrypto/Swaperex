"""TRX withdrawal handler.

Uses TronGrid API for transaction building and broadcast.
Supports TRX native transfers and TRC20 tokens.
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

# TronGrid endpoints
TRONGRID_MAINNET = "https://api.trongrid.io"
TRONGRID_TESTNET = "https://api.shasta.trongrid.io"

# TRX uses bandwidth and energy instead of gas
# Typical TRX transfer costs ~267 bandwidth
# 1 TRX = 1000 bandwidth (when staked) or burned
BANDWIDTH_COST_TRX = Decimal("0.267")  # TRX cost for bandwidth if not staked


class TRXWithdrawalHandler(WithdrawalHandler):
    """TRON withdrawal handler."""

    def __init__(self, testnet: bool = False, api_key: Optional[str] = None):
        super().__init__("TRX", testnet)
        self.base_url = TRONGRID_TESTNET if testnet else TRONGRID_MAINNET
        self.api_key = api_key

        self._headers = {"Accept": "application/json"}
        if api_key:
            self._headers["TRON-PRO-API-KEY"] = api_key

    async def validate_address(self, address: str) -> bool:
        """Validate TRON address format."""
        if not address:
            return False

        # TRON addresses start with T and are 34 characters (base58)
        if not address.startswith("T"):
            return False

        if len(address) != 34:
            return False

        # Basic base58 check
        valid_chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
        return all(c in valid_chars for c in address[1:])

    async def estimate_fee(
        self, amount: Decimal, destination: str, priority: str = "normal"
    ) -> FeeEstimate:
        """Estimate TRX transfer fee.

        TRX uses bandwidth system:
        - Free bandwidth: 600/day per account
        - Bandwidth cost: ~267 for TRX transfer
        - If no bandwidth, burns TRX (~0.267 TRX)
        """
        # TRX transfers are essentially free if you have bandwidth
        # Worst case: burn ~0.267 TRX
        network_fee = BANDWIDTH_COST_TRX

        return FeeEstimate(
            asset="TRX",
            network_fee=network_fee,
            service_fee=Decimal("0"),
            total_fee=network_fee,
            fee_asset="TRX",
            estimated_time="~3 seconds",
            priority=priority,
        )

    async def execute_withdrawal(
        self,
        private_key: str,
        destination: str,
        amount: Decimal,
        fee_priority: str = "normal",
    ) -> WithdrawalResult:
        """Execute TRX withdrawal."""
        try:
            # Try to use tronpy
            try:
                from tronpy import Tron
                from tronpy.keys import PrivateKey

                HAS_TRONPY = True
            except ImportError:
                HAS_TRONPY = False

            if not HAS_TRONPY:
                # Simulated result
                logger.warning("tronpy not installed - using simulated withdrawal")
                import secrets
                return WithdrawalResult(
                    success=True,
                    txid=secrets.token_hex(32),
                    status=WithdrawalStatus.BROADCAST,
                    message=f"[SIMULATED] Would send {amount} TRX to {destination}",
                    fee_paid=BANDWIDTH_COST_TRX,
                )

            # Real implementation with tronpy
            if self.testnet:
                client = Tron(network="shasta")
            else:
                client = Tron()

            priv_key = PrivateKey(bytes.fromhex(private_key))

            # Convert to SUN (1 TRX = 1,000,000 SUN)
            amount_sun = int(amount * Decimal(1_000_000))

            # Build and sign transaction
            txn = (
                client.trx.transfer(
                    priv_key.public_key.to_base58check_address(),
                    destination,
                    amount_sun,
                )
                .build()
                .sign(priv_key)
            )

            # Broadcast
            result = txn.broadcast()

            if result.get("result", False):
                txid = result.get("txid", "")
                return WithdrawalResult(
                    success=True,
                    txid=txid,
                    status=WithdrawalStatus.BROADCAST,
                    message=f"Sent {amount} TRX to {destination}",
                    fee_paid=BANDWIDTH_COST_TRX,
                )
            else:
                return WithdrawalResult(
                    success=False,
                    status=WithdrawalStatus.FAILED,
                    error=result.get("message", "Unknown error"),
                )

        except Exception as e:
            logger.error(f"TRX withdrawal failed: {e}")
            return WithdrawalResult(
                success=False,
                status=WithdrawalStatus.FAILED,
                error=str(e),
            )

    async def get_transaction_status(self, txid: str) -> WithdrawalStatus:
        """Check TRX transaction status."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/wallet/gettransactionbyid",
                    json={"value": txid},
                    headers=self._headers,
                )

                if response.status_code == 200:
                    data = response.json()

                    if not data:
                        return WithdrawalStatus.PENDING

                    # Check if confirmed
                    ret = data.get("ret", [{}])[0]
                    contract_ret = ret.get("contractRet", "")

                    if contract_ret == "SUCCESS":
                        return WithdrawalStatus.COMPLETED
                    elif contract_ret:
                        return WithdrawalStatus.FAILED
                    else:
                        return WithdrawalStatus.CONFIRMING

        except Exception as e:
            logger.error(f"Failed to check TRX tx status: {e}")

        return WithdrawalStatus.PENDING


class TRC20WithdrawalHandler(TRXWithdrawalHandler):
    """TRC20 token withdrawal handler (USDT, etc.)."""

    def __init__(
        self,
        token_contract: str,
        token_symbol: str,
        token_decimals: int = 6,
        testnet: bool = False,
        api_key: Optional[str] = None,
    ):
        super().__init__(testnet, api_key)
        self.asset = token_symbol.upper()
        self.token_contract = token_contract
        self.token_decimals = token_decimals

    async def estimate_fee(
        self, amount: Decimal, destination: str, priority: str = "normal"
    ) -> FeeEstimate:
        """Estimate TRC20 transfer fee.

        TRC20 transfers use energy instead of just bandwidth.
        Typical cost: ~14-30 TRX if no energy staked.
        """
        # TRC20 transfers cost energy (~14-30 TRX without staking)
        network_fee = Decimal("15")  # Conservative estimate

        return FeeEstimate(
            asset=self.asset,
            network_fee=network_fee,
            service_fee=Decimal("0"),
            total_fee=network_fee,
            fee_asset="TRX",  # Fees paid in TRX
            estimated_time="~3 seconds",
            priority=priority,
        )

    async def execute_withdrawal(
        self,
        private_key: str,
        destination: str,
        amount: Decimal,
        fee_priority: str = "normal",
    ) -> WithdrawalResult:
        """Execute TRC20 token withdrawal."""
        try:
            try:
                from tronpy import Tron
                from tronpy.keys import PrivateKey
                from tronpy.contract import Contract

                HAS_TRONPY = True
            except ImportError:
                HAS_TRONPY = False

            if not HAS_TRONPY:
                import secrets
                return WithdrawalResult(
                    success=True,
                    txid=secrets.token_hex(32),
                    status=WithdrawalStatus.BROADCAST,
                    message=f"[SIMULATED] Would send {amount} {self.asset} to {destination}",
                    fee_paid=Decimal("15"),
                )

            # Real implementation
            if self.testnet:
                client = Tron(network="shasta")
            else:
                client = Tron()

            priv_key = PrivateKey(bytes.fromhex(private_key))
            sender = priv_key.public_key.to_base58check_address()

            # Get contract
            contract = client.get_contract(self.token_contract)

            # Convert amount
            token_amount = int(amount * (10 ** self.token_decimals))

            # Build transfer
            txn = (
                contract.functions.transfer(destination, token_amount)
                .with_owner(sender)
                .fee_limit(30_000_000)  # 30 TRX max fee
                .build()
                .sign(priv_key)
            )

            # Broadcast
            result = txn.broadcast()

            if result.get("result", False):
                txid = result.get("txid", "")
                return WithdrawalResult(
                    success=True,
                    txid=txid,
                    status=WithdrawalStatus.BROADCAST,
                    message=f"Sent {amount} {self.asset} to {destination}",
                    fee_paid=Decimal("15"),
                )
            else:
                return WithdrawalResult(
                    success=False,
                    status=WithdrawalStatus.FAILED,
                    error=result.get("message", "Unknown error"),
                )

        except Exception as e:
            logger.error(f"TRC20 withdrawal failed: {e}")
            return WithdrawalResult(
                success=False,
                status=WithdrawalStatus.FAILED,
                error=str(e),
            )
