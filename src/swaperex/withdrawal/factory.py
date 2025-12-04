"""Factory for creating withdrawal handlers."""

import os
from typing import Optional

from swaperex.config import get_settings
from swaperex.withdrawal.base import WithdrawalHandler


# Cache for handler instances
_handler_cache: dict[str, WithdrawalHandler] = {}


def get_withdrawal_handler(asset: str) -> Optional[WithdrawalHandler]:
    """Get a withdrawal handler for an asset.

    Args:
        asset: Asset symbol (BTC, ETH, TRX, USDT-TRC20, USDT-ERC20, etc.)

    Returns:
        WithdrawalHandler instance or None if unsupported
    """
    asset_upper = asset.upper()

    # Check cache
    if asset_upper in _handler_cache:
        return _handler_cache[asset_upper]

    settings = get_settings()
    testnet = not settings.is_production

    handler: Optional[WithdrawalHandler] = None

    # BTC
    if asset_upper == "BTC":
        from swaperex.withdrawal.btc import BTCWithdrawalHandler
        handler = BTCWithdrawalHandler(testnet=testnet)

    # LTC (uses similar structure to BTC)
    elif asset_upper == "LTC":
        from swaperex.withdrawal.btc import BTCWithdrawalHandler
        handler = BTCWithdrawalHandler(testnet=testnet)
        handler.asset = "LTC"

    # ETH
    elif asset_upper == "ETH":
        from swaperex.withdrawal.eth import ETHWithdrawalHandler
        rpc_url = os.environ.get("ETH_RPC_URL")
        handler = ETHWithdrawalHandler(testnet=testnet, rpc_url=rpc_url)

    # USDT-ERC20
    elif asset_upper == "USDT-ERC20":
        from swaperex.withdrawal.eth import get_usdt_erc20_handler
        rpc_url = os.environ.get("ETH_RPC_URL")
        handler = get_usdt_erc20_handler(testnet=testnet, rpc_url=rpc_url)

    # USDC
    elif asset_upper == "USDC":
        from swaperex.withdrawal.eth import get_usdc_handler
        rpc_url = os.environ.get("ETH_RPC_URL")
        handler = get_usdc_handler(testnet=testnet, rpc_url=rpc_url)

    # TRX
    elif asset_upper == "TRX":
        from swaperex.withdrawal.trx import TRXWithdrawalHandler
        api_key = os.environ.get("TRONGRID_API_KEY")
        handler = TRXWithdrawalHandler(testnet=testnet, api_key=api_key)

    # USDT-TRC20
    elif asset_upper == "USDT-TRC20":
        from swaperex.withdrawal.trx import TRC20WithdrawalHandler
        api_key = os.environ.get("TRONGRID_API_KEY")
        # USDT contract addresses
        contract = (
            "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs" if testnet
            else "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        )
        handler = TRC20WithdrawalHandler(
            token_contract=contract,
            token_symbol="USDT-TRC20",
            token_decimals=6,
            testnet=testnet,
            api_key=api_key,
        )

    # BSC/BNB (uses same handler as ETH with different RPC)
    elif asset_upper in ("BSC", "BNB"):
        from swaperex.withdrawal.eth import ETHWithdrawalHandler
        rpc_url = os.environ.get("BSC_RPC_URL", "https://bsc-dataseed.binance.org/")
        handler = ETHWithdrawalHandler(testnet=testnet, rpc_url=rpc_url)
        handler.asset = "BSC"

    # DASH
    elif asset_upper == "DASH":
        from swaperex.withdrawal.dash import DASHWithdrawalHandler
        api_key = os.environ.get("BLOCKCYPHER_API_KEY")
        handler = DASHWithdrawalHandler(testnet=testnet, api_key=api_key)

    # DOGE (would use similar handler to DASH)
    elif asset_upper == "DOGE":
        # DOGE not yet implemented, return None
        handler = None

    if handler:
        _handler_cache[asset_upper] = handler

    return handler


def get_supported_withdrawal_assets() -> list[str]:
    """Get list of assets with withdrawal support."""
    return [
        "BTC",
        "LTC",
        "DASH",
        "ETH",
        "USDT-ERC20",
        "USDC",
        "TRX",
        "USDT-TRC20",
        "BSC",
    ]


def reset_handler_cache() -> None:
    """Clear handler cache (useful for testing)."""
    _handler_cache.clear()
