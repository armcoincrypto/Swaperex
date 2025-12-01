"""CryptoAPIs deposit address provider."""

import httpx

from swaperex.config import get_settings
from swaperex.providers.base import Address, ProviderAdapter
from swaperex.providers.dryrun import DryRunProvider


class CryptoAPIsProvider(ProviderAdapter):
    """CryptoAPIs provider for generating real deposit addresses.

    Docs: https://developers.cryptoapis.io/
    """

    # Map asset symbols to CryptoAPIs blockchain/network
    CHAIN_MAP = {
        "BTC": ("bitcoin", "mainnet"),
        "ETH": ("ethereum", "mainnet"),
        "LTC": ("litecoin", "mainnet"),
        "BCH": ("bitcoin-cash", "mainnet"),
        "DOGE": ("dogecoin", "mainnet"),
    }

    TESTNET_CHAIN_MAP = {
        "BTC": ("bitcoin", "testnet"),
        "ETH": ("ethereum", "sepolia"),
        "LTC": ("litecoin", "testnet"),
    }

    def __init__(self, api_key: str, base_url: str | None = None, use_testnet: bool = False):
        """Initialize CryptoAPIs provider.

        Args:
            api_key: CryptoAPIs API key
            base_url: Optional base URL override
            use_testnet: Use testnet addresses if True
        """
        self.api_key = api_key
        self.base_url = base_url or "https://rest.cryptoapis.io"
        self.use_testnet = use_testnet
        self._fallback = DryRunProvider()

    @property
    def name(self) -> str:
        return "cryptoapis"

    async def validate_config(self) -> bool:
        """Validate API key by making a test request."""
        if not self.api_key:
            return False

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/v2/market-data/assets",
                    headers={"X-API-Key": self.api_key},
                    timeout=10.0,
                )
                return response.status_code == 200
        except Exception:
            return False

    async def create_deposit_address(self, user_id: int, asset: str) -> Address:
        """Create a deposit address via CryptoAPIs.

        Args:
            user_id: Internal user ID
            asset: Asset symbol

        Returns:
            Address from CryptoAPIs or fallback to dry-run
        """
        settings = get_settings()

        # Fallback to dry-run if no API key or in dry-run mode
        if not self.api_key or settings.dry_run:
            return await self._fallback.create_deposit_address(user_id, asset)

        asset_upper = asset.upper()
        chain_map = self.TESTNET_CHAIN_MAP if self.use_testnet else self.CHAIN_MAP

        if asset_upper not in chain_map:
            # Unsupported asset, fallback
            return await self._fallback.create_deposit_address(user_id, asset)

        blockchain, network = chain_map[asset_upper]

        try:
            async with httpx.AsyncClient() as client:
                # Generate new address
                # Note: CryptoAPIs requires a wallet ID - this is simplified
                url = f"{self.base_url}/v2/wallet-as-a-service/wallets/generate-deposit-address"
                response = await client.post(
                    url,
                    headers={
                        "X-API-Key": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "context": f"user-{user_id}",
                        "data": {
                            "item": {
                                "label": f"swaperex-user-{user_id}-{asset_upper}",
                            }
                        },
                    },
                    params={
                        "blockchain": blockchain,
                        "network": network,
                    },
                    timeout=15.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    address = data.get("data", {}).get("item", {}).get("address", "")
                    if address:
                        return Address(asset=asset_upper, address=address)

                # Fallback on error
                return await self._fallback.create_deposit_address(user_id, asset)

        except Exception:
            # Network error, fallback to dry-run
            return await self._fallback.create_deposit_address(user_id, asset)
