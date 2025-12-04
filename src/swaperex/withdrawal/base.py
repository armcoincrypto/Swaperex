"""Base interfaces for withdrawal handling.

Withdrawal flow:
1. User requests withdrawal (amount, destination)
2. System validates balance and address
3. Fee is estimated and shown to user
4. User confirms
5. Transaction is built and signed
6. Transaction is broadcast
7. System tracks confirmation
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from swaperex.ledger.models import WithdrawalStatus

logger = logging.getLogger(__name__)


@dataclass
class WithdrawalRequest:
    """Request to withdraw funds."""
    user_id: int
    asset: str
    amount: Decimal
    destination_address: str
    memo: Optional[str] = None  # For chains that support memo/tag


@dataclass
class FeeEstimate:
    """Estimated fee for withdrawal."""
    asset: str
    network_fee: Decimal           # Fee paid to network
    service_fee: Decimal           # Our fee (optional)
    total_fee: Decimal
    fee_asset: str                 # Asset fee is paid in
    estimated_time: str            # e.g., "10-30 minutes"
    priority: str = "normal"       # low/normal/high


@dataclass
class WithdrawalResult:
    """Result of withdrawal operation."""
    success: bool
    txid: Optional[str] = None
    status: WithdrawalStatus = WithdrawalStatus.PENDING
    message: str = ""
    fee_paid: Optional[Decimal] = None
    error: Optional[str] = None


class WithdrawalHandler(ABC):
    """Abstract base class for withdrawal handlers.

    Each chain has its own implementation.
    """

    def __init__(self, asset: str, testnet: bool = False):
        """Initialize handler.

        Args:
            asset: Asset symbol (BTC, ETH, etc.)
            testnet: Use testnet if True
        """
        self.asset = asset.upper()
        self.testnet = testnet

    @abstractmethod
    async def validate_address(self, address: str) -> bool:
        """Validate destination address format.

        Args:
            address: Destination address to validate

        Returns:
            True if address is valid for this chain
        """
        pass

    @abstractmethod
    async def estimate_fee(
        self, amount: Decimal, destination: str, priority: str = "normal"
    ) -> FeeEstimate:
        """Estimate withdrawal fee.

        Args:
            amount: Amount to withdraw
            destination: Destination address
            priority: low/normal/high

        Returns:
            Fee estimate
        """
        pass

    @abstractmethod
    async def execute_withdrawal(
        self,
        private_key: str,
        destination: str,
        amount: Decimal,
        fee_priority: str = "normal",
    ) -> WithdrawalResult:
        """Execute withdrawal transaction.

        Args:
            private_key: Private key for signing (or KMS key ID)
            destination: Destination address
            amount: Amount to send (excluding fee)
            fee_priority: Fee priority level

        Returns:
            WithdrawalResult with txid if successful
        """
        pass

    @abstractmethod
    async def get_transaction_status(self, txid: str) -> WithdrawalStatus:
        """Check transaction confirmation status.

        Args:
            txid: Transaction ID

        Returns:
            Current status
        """
        pass


class SimulatedWithdrawalHandler(WithdrawalHandler):
    """Simulated withdrawal handler for testing."""

    async def validate_address(self, address: str) -> bool:
        """Accept any address in simulation."""
        return len(address) > 10

    async def estimate_fee(
        self, amount: Decimal, destination: str, priority: str = "normal"
    ) -> FeeEstimate:
        """Return simulated fee estimate."""
        # Simulated fees by asset
        fees = {
            "BTC": Decimal("0.0001"),
            "ETH": Decimal("0.002"),
            "TRX": Decimal("1"),
            "LTC": Decimal("0.001"),
        }
        network_fee = fees.get(self.asset, Decimal("0.001"))

        return FeeEstimate(
            asset=self.asset,
            network_fee=network_fee,
            service_fee=Decimal("0"),
            total_fee=network_fee,
            fee_asset=self.asset,
            estimated_time="5-10 minutes (simulated)",
            priority=priority,
        )

    async def execute_withdrawal(
        self,
        private_key: str,
        destination: str,
        amount: Decimal,
        fee_priority: str = "normal",
    ) -> WithdrawalResult:
        """Simulate withdrawal execution."""
        import secrets

        # Generate fake txid
        txid = f"sim_tx_{secrets.token_hex(32)}"

        logger.info(f"[SIMULATED] Withdrawal: {amount} {self.asset} to {destination}")

        return WithdrawalResult(
            success=True,
            txid=txid,
            status=WithdrawalStatus.BROADCAST,
            message=f"Simulated withdrawal of {amount} {self.asset}",
            fee_paid=Decimal("0.0001"),
        )

    async def get_transaction_status(self, txid: str) -> WithdrawalStatus:
        """Simulated transactions are always completed."""
        return WithdrawalStatus.COMPLETED
