"""Factory for creating deposit scanners."""

from swaperex.config import get_settings
from swaperex.scanner.base import DepositScanner, SimulatedScanner
from swaperex.scanner.blockstream import BlockstreamScanner, LTCBlockstreamScanner

# Cache for scanner instances
_scanner_cache: dict[str, DepositScanner] = {}


def get_scanner(asset: str) -> DepositScanner:
    """Get a deposit scanner for an asset.

    Args:
        asset: Asset symbol (BTC, ETH, etc.)

    Returns:
        DepositScanner instance for the asset
    """
    asset_upper = asset.upper()

    # Check cache
    if asset_upper in _scanner_cache:
        return _scanner_cache[asset_upper]

    settings = get_settings()

    # In dry-run mode, use simulated scanner
    if settings.dry_run:
        scanner = SimulatedScanner(asset_upper)
        _scanner_cache[asset_upper] = scanner
        return scanner

    # Get real scanner based on asset
    testnet = not settings.is_production

    if asset_upper == "BTC":
        scanner = BlockstreamScanner(testnet=testnet)
    elif asset_upper == "LTC":
        scanner = LTCBlockstreamScanner(testnet=testnet)
    else:
        # Fall back to simulated for unsupported assets
        scanner = SimulatedScanner(asset_upper)

    _scanner_cache[asset_upper] = scanner
    return scanner


def reset_scanner_cache() -> None:
    """Clear scanner cache (useful for testing)."""
    _scanner_cache.clear()
