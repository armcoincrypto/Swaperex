"""Provider factory for creating deposit address providers."""

from swaperex.config import get_settings
from swaperex.providers.base import ProviderAdapter
from swaperex.providers.cryptoapis import CryptoAPIsProvider
from swaperex.providers.dryrun import DryRunProvider
from swaperex.providers.nowpayments import NowPaymentsProvider

# Singleton instance
_provider_instance: ProviderAdapter | None = None


def get_provider() -> ProviderAdapter:
    """Get the configured deposit address provider.

    Provider is selected based on PROVIDER environment variable:
    - dryrun (default): Simulated addresses for testing
    - cryptoapis: CryptoAPIs.io provider
    - nowpayments: NOWPayments.io provider

    Returns:
        Configured ProviderAdapter instance
    """
    global _provider_instance

    if _provider_instance is not None:
        return _provider_instance

    settings = get_settings()
    provider_name = settings.provider.lower()

    if provider_name == "cryptoapis":
        _provider_instance = CryptoAPIsProvider(
            api_key=settings.cryptoapis_key,
            use_testnet=not settings.is_production,
        )
    elif provider_name == "nowpayments":
        _provider_instance = NowPaymentsProvider(
            api_key=settings.nowpayments_key,
        )
    else:
        # Default to dry-run
        _provider_instance = DryRunProvider()

    return _provider_instance


def reset_provider() -> None:
    """Reset provider instance (useful for testing)."""
    global _provider_instance
    _provider_instance = None
