"""Provider adapter base interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class Address:
    """Deposit address returned by provider."""

    asset: str
    address: str
    memo: Optional[str] = None  # For chains like XRP, BNB that use memo/tag


class ProviderAdapter(ABC):
    """Abstract base class for deposit address providers."""

    @abstractmethod
    async def create_deposit_address(self, user_id: int, asset: str) -> Address:
        """Create a deposit address for a user and asset.

        Args:
            user_id: Internal user ID
            asset: Asset symbol (BTC, ETH, etc.)

        Returns:
            Address object with the deposit address
        """
        raise NotImplementedError()

    @abstractmethod
    async def validate_config(self) -> bool:
        """Validate provider configuration.

        Returns:
            True if configuration is valid
        """
        raise NotImplementedError()

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name."""
        raise NotImplementedError()
