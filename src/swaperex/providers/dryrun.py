"""Dry-run provider for testing (no real addresses)."""

from swaperex.providers.base import Address, ProviderAdapter


class DryRunProvider(ProviderAdapter):
    """Simulated provider that generates deterministic fake addresses."""

    @property
    def name(self) -> str:
        return "dryrun"

    async def create_deposit_address(self, user_id: int, asset: str) -> Address:
        """Generate a deterministic fake address for testing.

        Args:
            user_id: Internal user ID
            asset: Asset symbol

        Returns:
            Simulated address
        """
        # Deterministic fake address for dev/test
        addr = f"sim:{asset.lower()}:{user_id:06d}"
        return Address(asset=asset.upper(), address=addr)

    async def validate_config(self) -> bool:
        """Always valid for dry-run."""
        return True
