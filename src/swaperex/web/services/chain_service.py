"""Chain service for blockchain metadata and status.

Provides read-only access to chain information, gas prices, and status.
"""

import logging
from typing import Optional

from swaperex.web.contracts.assets import (
    AssetInfo,
    AssetListResponse,
    ChainInfo,
    ChainListResponse,
)

logger = logging.getLogger(__name__)


# Chain metadata (public information only)
SUPPORTED_CHAINS = {
    "ethereum": ChainInfo(
        id="ethereum",
        name="Ethereum",
        chain_id=1,
        native_asset="ETH",
        rpc_url="https://eth.llamarpc.com",
        explorer_url="https://etherscan.io",
        is_testnet=False,
    ),
    "bsc": ChainInfo(
        id="bsc",
        name="BNB Smart Chain",
        chain_id=56,
        native_asset="BNB",
        rpc_url="https://bsc-dataseed.binance.org/",
        explorer_url="https://bscscan.com",
        is_testnet=False,
    ),
    "polygon": ChainInfo(
        id="polygon",
        name="Polygon",
        chain_id=137,
        native_asset="MATIC",
        rpc_url="https://polygon-rpc.com/",
        explorer_url="https://polygonscan.com",
        is_testnet=False,
    ),
    "avalanche": ChainInfo(
        id="avalanche",
        name="Avalanche C-Chain",
        chain_id=43114,
        native_asset="AVAX",
        rpc_url="https://api.avax.network/ext/bc/C/rpc",
        explorer_url="https://snowtrace.io",
        is_testnet=False,
    ),
    "arbitrum": ChainInfo(
        id="arbitrum",
        name="Arbitrum One",
        chain_id=42161,
        native_asset="ETH",
        rpc_url="https://arb1.arbitrum.io/rpc",
        explorer_url="https://arbiscan.io",
        is_testnet=False,
    ),
    "optimism": ChainInfo(
        id="optimism",
        name="Optimism",
        chain_id=10,
        native_asset="ETH",
        rpc_url="https://mainnet.optimism.io",
        explorer_url="https://optimistic.etherscan.io",
        is_testnet=False,
    ),
}


class ChainService:
    """Service for blockchain metadata and status.

    This is a READ-ONLY service that provides public chain information.
    """

    def get_supported_chains(self) -> ChainListResponse:
        """Get list of supported blockchains.

        Returns:
            ChainListResponse with all supported chains
        """
        chains = list(SUPPORTED_CHAINS.values())
        return ChainListResponse(
            success=True,
            chains=chains,
            total=len(chains),
        )

    def get_chain(self, chain_id: str) -> Optional[ChainInfo]:
        """Get information about a specific chain.

        Args:
            chain_id: Chain identifier (ethereum, bsc, etc.)

        Returns:
            ChainInfo or None if not found
        """
        return SUPPORTED_CHAINS.get(chain_id.lower())

    def get_supported_assets(self) -> AssetListResponse:
        """Get list of supported assets.

        Returns:
            AssetListResponse with all supported assets
        """
        # Build from routing module's price list
        from swaperex.routing.dry_run import SIMULATED_PRICES

        assets = []
        for symbol in SIMULATED_PRICES.keys():
            chain = self._get_asset_chain(symbol)
            assets.append(
                AssetInfo(
                    symbol=symbol,
                    name=symbol,  # Simplified for now
                    chain=chain,
                    decimals=18 if chain in ("ethereum", "bsc", "polygon") else 8,
                    is_native=symbol in ("ETH", "BNB", "MATIC", "AVAX", "BTC"),
                )
            )

        return AssetListResponse(
            success=True,
            assets=assets,
            total=len(assets),
        )

    def _get_asset_chain(self, symbol: str) -> str:
        """Determine the native chain for an asset."""
        # Simple mapping - in production would be more comprehensive
        if symbol in ("BTC", "LTC", "DASH", "BCH", "DOGE"):
            return "bitcoin"
        if symbol in ("ETH", "USDT", "USDC", "DAI", "LINK", "UNI"):
            return "ethereum"
        if symbol in ("BNB", "BSC", "CAKE", "BUSD"):
            return "bsc"
        if symbol in ("MATIC", "QUICK"):
            return "polygon"
        if symbol in ("SOL", "RAY", "SRM"):
            return "solana"
        if symbol in ("TRX", "BTT", "JST"):
            return "tron"
        if symbol in ("ATOM", "OSMO"):
            return "cosmos"
        return "ethereum"  # Default to Ethereum for unknown
