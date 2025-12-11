"""Factory for creating deposit scanners.

Supported scanners:
- BTC, LTC: Blockstream API
- ETH, ERC-20 tokens: Etherscan API
- BSC, BEP-20 tokens: BscScan API
- SOL, SPL tokens: Solana RPC / Helius API
- ATOM: Cosmos LCD API
- AVAX: Snowtrace API (same as Etherscan)
- MATIC: Polygonscan API (same as Etherscan)
"""

import os

from swaperex.config import get_settings
from swaperex.scanner.base import DepositScanner, SimulatedScanner
from swaperex.scanner.blockstream import BlockstreamScanner, LTCBlockstreamScanner

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

    # LTC
    elif asset_upper == "LTC":
        scanner = LTCBlockstreamScanner(testnet=testnet)

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
    # BscScan V1 is deprecated, but V2 endpoint at bscscan.com/v2/api doesn't exist
    # Use the standard endpoint - it still works but shows deprecation warning
    elif asset_upper in ("BSC", "BNB"):
        from swaperex.scanner.bscscan import BscScanScanner
        api_key = os.environ.get("BSCSCAN_API_KEY")
        scanner = BscScanScanner(testnet=testnet, api_key=api_key)

    # DASH
    elif asset_upper == "DASH":
        from swaperex.scanner.dash import DashScanner
        api_key = os.environ.get("BLOCKCYPHER_API_KEY")
        scanner = DashScanner(api_key=api_key)

    # DOGE (similar to DASH, uses BlockCypher)
    elif asset_upper == "DOGE":
        from swaperex.scanner.dash import DashScanner
        api_key = os.environ.get("BLOCKCYPHER_API_KEY")
        scanner = DashScanner(api_key=api_key)
        scanner.asset = "DOGE"
        scanner.blockcypher_url = "https://api.blockcypher.com/v1/doge/main"

    # SOL (Solana)
    elif asset_upper == "SOL":
        from swaperex.scanner.multichain import SolanaScanner
        api_key = os.environ.get("HELIUS_API_KEY")
        scanner = SolanaScanner(api_key=api_key, testnet=testnet)

    # SPL tokens (Solana)
    elif asset_upper in ("USDT-SPL", "USDC-SPL"):
        from swaperex.scanner.multichain import SolanaScanner
        api_key = os.environ.get("HELIUS_API_KEY")
        scanner = SolanaScanner(api_key=api_key, testnet=testnet)
        scanner._asset = asset_upper  # Override asset name

    # ATOM (Cosmos)
    elif asset_upper == "ATOM":
        from swaperex.scanner.multichain import ATOMScanner
        scanner = ATOMScanner(testnet=testnet)

    # AVAX (Avalanche C-Chain) - uses Snowtrace (Etherscan-compatible)
    elif asset_upper == "AVAX":
        from swaperex.scanner.etherscan import EtherscanScanner
        api_key = os.environ.get("SNOWTRACE_API_KEY")
        scanner = EtherscanScanner(testnet=testnet, api_key=api_key)
        scanner.asset = "AVAX"
        scanner.base_url = (
            "https://api-testnet.snowtrace.io/api" if testnet
            else "https://api.snowtrace.io/api"
        )

    # AVAX stablecoins
    elif asset_upper in ("USDT-AVAX", "USDC-AVAX"):
        from swaperex.scanner.etherscan import EtherscanScanner
        api_key = os.environ.get("SNOWTRACE_API_KEY")
        scanner = EtherscanScanner(testnet=testnet, api_key=api_key)
        scanner.asset = asset_upper
        scanner.base_url = (
            "https://api-testnet.snowtrace.io/api" if testnet
            else "https://api.snowtrace.io/api"
        )

    # MATIC (Polygon) - uses Polygonscan (Etherscan-compatible)
    elif asset_upper in ("MATIC", "POLYGON"):
        from swaperex.scanner.etherscan import EtherscanScanner
        api_key = os.environ.get("POLYGONSCAN_API_KEY")
        scanner = EtherscanScanner(testnet=testnet, api_key=api_key)
        scanner.asset = "MATIC"
        scanner.base_url = (
            "https://api-testnet.polygonscan.com/api" if testnet
            else "https://api.polygonscan.com/api"
        )

    # MATIC stablecoins
    elif asset_upper in ("USDT-MATIC", "USDC-MATIC"):
        from swaperex.scanner.etherscan import EtherscanScanner
        api_key = os.environ.get("POLYGONSCAN_API_KEY")
        scanner = EtherscanScanner(testnet=testnet, api_key=api_key)
        scanner.asset = asset_upper
        scanner.base_url = (
            "https://api-testnet.polygonscan.com/api" if testnet
            else "https://api.polygonscan.com/api"
        )

    else:
        # Fall back to simulated for unsupported assets
        scanner = SimulatedScanner(asset_upper)

    _scanner_cache[asset_upper] = scanner
    return scanner


def get_supported_scanner_assets() -> list[str]:
    """Get list of assets with real scanner support."""
    return [
        # Core coins
        "BTC",
        "LTC",
        "ETH",
        "SOL",
        "BSC",
        "BNB",
        "ATOM",
        "AVAX",
        "MATIC",
        # ETH stablecoins
        "USDT-ERC20",
        "USDC-ERC20",
        # BSC stablecoins
        "USDT-BEP20",
        "USDC-BEP20",
        # SOL stablecoins
        "USDT-SPL",
        "USDC-SPL",
        # AVAX stablecoins
        "USDT-AVAX",
        "USDC-AVAX",
        # MATIC stablecoins
        "USDT-MATIC",
        "USDC-MATIC",
        # Legacy (kept for backwards compatibility)
        "USDC",
        "TRX",
        "USDT-TRC20",
        "DASH",
        "DOGE",
    ]


def reset_scanner_cache() -> None:
    """Clear scanner cache (useful for testing)."""
    _scanner_cache.clear()
