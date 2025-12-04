"""Factory for creating deposit scanners."""

import os

from swaperex.config import get_settings
from swaperex.scanner.base import DepositScanner, SimulatedScanner
from swaperex.scanner.blockstream import BlockstreamScanner, LTCBlockstreamScanner
from swaperex.scanner.blockcypher import DASHScanner, LTCScanner, DOGEScanner

# Cache for scanner instances
_scanner_cache: dict[str, DepositScanner] = {}


def get_scanner(asset: str) -> DepositScanner:
    """Get a deposit scanner for an asset.

    Args:
        asset: Asset symbol (BTC, ETH, TRX, USDT-TRC20, USDT-ERC20, etc.)

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

    # BTC
    if asset_upper == "BTC":
        scanner = BlockstreamScanner(testnet=testnet)

    # LTC (use BlockCypher for real scanning)
    elif asset_upper == "LTC":
        api_key = os.environ.get("BLOCKCYPHER_API_KEY")
        scanner = LTCScanner(testnet=testnet, api_key=api_key)

    # DASH
    elif asset_upper == "DASH":
        api_key = os.environ.get("BLOCKCYPHER_API_KEY")
        scanner = DASHScanner(testnet=testnet, api_key=api_key)

    # DOGE
    elif asset_upper == "DOGE":
        api_key = os.environ.get("BLOCKCYPHER_API_KEY")
        scanner = DOGEScanner(testnet=testnet, api_key=api_key)

    # ETH
    elif asset_upper == "ETH":
        from swaperex.scanner.etherscan import EtherscanScanner
        api_key = os.environ.get("ETHERSCAN_API_KEY")
        scanner = EtherscanScanner(testnet=testnet, api_key=api_key)

    # USDT-ERC20
    elif asset_upper == "USDT-ERC20":
        from swaperex.scanner.etherscan import get_usdt_erc20_scanner
        api_key = os.environ.get("ETHERSCAN_API_KEY")
        scanner = get_usdt_erc20_scanner(testnet=testnet, api_key=api_key)

    # USDC
    elif asset_upper == "USDC":
        from swaperex.scanner.etherscan import get_usdc_scanner
        api_key = os.environ.get("ETHERSCAN_API_KEY")
        scanner = get_usdc_scanner(testnet=testnet, api_key=api_key)

    # TRX
    elif asset_upper == "TRX":
        from swaperex.scanner.trongrid import TronGridScanner
        api_key = os.environ.get("TRONGRID_API_KEY")
        scanner = TronGridScanner(testnet=testnet, api_key=api_key)

    # USDT-TRC20
    elif asset_upper == "USDT-TRC20":
        from swaperex.scanner.trongrid import get_usdt_trc20_scanner
        api_key = os.environ.get("TRONGRID_API_KEY")
        scanner = get_usdt_trc20_scanner(testnet=testnet, api_key=api_key)

    # BSC (Binance Smart Chain) - uses BscScan (same API as Etherscan)
    elif asset_upper in ("BSC", "BNB"):
        from swaperex.scanner.etherscan import EtherscanScanner
        api_key = os.environ.get("BSCSCAN_API_KEY")
        scanner = EtherscanScanner(testnet=testnet, api_key=api_key)
        scanner.asset = "BSC"
        scanner.base_url = (
            "https://api-testnet.bscscan.com/api" if testnet
            else "https://api.bscscan.com/api"
        )

    else:
        # Fall back to simulated for unsupported assets
        scanner = SimulatedScanner(asset_upper)

    _scanner_cache[asset_upper] = scanner
    return scanner


def get_supported_scanner_assets() -> list[str]:
    """Get list of assets with real scanner support."""
    return [
        "BTC",
        "LTC",
        "DASH",
        "DOGE",
        "ETH",
        "USDT-ERC20",
        "USDC",
        "TRX",
        "USDT-TRC20",
        "BSC",
    ]


def reset_scanner_cache() -> None:
    """Clear scanner cache (useful for testing)."""
    _scanner_cache.clear()
