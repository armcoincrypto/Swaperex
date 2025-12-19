"""NOWPayments deposit address provider."""

import logging

import httpx

from swaperex.config import get_settings
from swaperex.providers.base import Address, ProviderAdapter
from swaperex.providers.dryrun import DryRunProvider

logger = logging.getLogger(__name__)


class NowPaymentsProvider(ProviderAdapter):
    """NOWPayments provider for generating deposit addresses.

    Docs: https://documenter.getpostman.com/view/7907941/S1a32n38
    """

    def __init__(self, api_key: str, base_url: str | None = None):
        """Initialize NOWPayments provider.

        Args:
            api_key: NOWPayments API key
            base_url: Optional base URL override
        """
        self.api_key = api_key
        self.base_url = base_url or "https://api.nowpayments.io/v1"
        self._fallback = DryRunProvider()

    @property
    def name(self) -> str:
        return "nowpayments"

    async def validate_config(self) -> bool:
        """Validate API key by checking status endpoint."""
        if not self.api_key:
            return False

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/status",
                    headers={"x-api-key": self.api_key},
                    timeout=10.0,
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("message") == "OK"
                return False
        except Exception as e:
            logger.warning(f"NOWPayments health check failed: {e}")
            return False

    async def create_deposit_address(self, user_id: int, asset: str) -> Address:
        """Create a deposit address via NOWPayments.

        Args:
            user_id: Internal user ID
            asset: Asset symbol

        Returns:
            Address from NOWPayments or fallback to dry-run
        """
        settings = get_settings()

        # Fallback to dry-run if no API key or in dry-run mode
        if not self.api_key or settings.dry_run:
            return await self._fallback.create_deposit_address(user_id, asset)

        try:
            async with httpx.AsyncClient() as client:
                # Create payment/deposit address
                url = f"{self.base_url}/payment"
                response = await client.post(
                    url,
                    headers={
                        "x-api-key": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "price_amount": 100,  # Minimum for NOWPayments
                        "price_currency": "usd",
                        "pay_currency": asset.lower(),
                        "order_id": f"swaperex-user-{user_id}",
                        "order_description": f"Deposit for user {user_id}",
                    },
                    timeout=15.0,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    address = data.get("pay_address", "")
                    memo = data.get("payin_extra_id")  # For XRP, XLM, etc.

                    if address:
                        return Address(
                            asset=asset.upper(),
                            address=address,
                            memo=memo,
                        )

                # Fallback on error
                return await self._fallback.create_deposit_address(user_id, asset)

        except Exception as e:
            # Network error, fallback to dry-run
            logger.warning(f"NOWPayments create_deposit_address failed, using fallback: {e}")
            return await self._fallback.create_deposit_address(user_id, asset)
