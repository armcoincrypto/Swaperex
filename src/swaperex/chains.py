"""Multi-chain RPC and configuration for all supported chains.

Supports 8 chains with DEX integration:
- BTC, LTC (THORChain)
- ETH (Uniswap), BNB (PancakeSwap), AVAX (Trader Joe), MATIC (QuickSwap)
- SOL (Jupiter), ATOM (Osmosis)

Trust Wallet compatible - uses standard BIP44/BIP84 derivation paths.
"""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ChainConfig:
    """Configuration for a blockchain."""

    # Required fields (no defaults) - must come first
    name: str
    symbol: str
    rpc_url: str
    explorer_url: str
    dex_name: str
    coin_type: int  # BIP44 coin type (SLIP-44)

    # Optional fields (with defaults)
    chain_id: Optional[int] = None  # EVM chains only
    rpc_url_backup: Optional[str] = None
    explorer_api_url: Optional[str] = None
    dex_router: Optional[str] = None  # EVM router contract
    decimals: int = 18
    address_prefix: Optional[str] = None  # For non-EVM chains
    usdt_address: Optional[str] = None
    usdc_address: Optional[str] = None


# ======================
# Chain Configurations
# ======================

CHAINS: dict[str, ChainConfig] = {
    # Bitcoin - THORChain for cross-chain
    "BTC": ChainConfig(
        name="Bitcoin",
        symbol="BTC",
        rpc_url="https://blockstream.info/api",
        explorer_url="https://blockstream.info",
        dex_name="THORChain",
        coin_type=0,  # BIP44: m/84'/0'/0'
        chain_id=None,
        rpc_url_backup="https://mempool.space/api",
        explorer_api_url="https://blockstream.info/api",
        decimals=8,
        address_prefix="bc1",  # Native SegWit
    ),

    # Litecoin - THORChain for cross-chain
    "LTC": ChainConfig(
        name="Litecoin",
        symbol="LTC",
        rpc_url="https://litecoinspace.org/api",
        explorer_url="https://litecoinspace.org",
        dex_name="THORChain",
        coin_type=2,  # BIP44: m/84'/2'/0'
        chain_id=None,
        rpc_url_backup="https://ltc.bitaps.com/api",
        explorer_api_url="https://litecoinspace.org/api",
        decimals=8,
        address_prefix="ltc1",  # Native SegWit
    ),

    # Ethereum - Uniswap
    "ETH": ChainConfig(
        name="Ethereum",
        symbol="ETH",
        rpc_url=os.getenv("ETH_RPC_URL", "https://eth.llamarpc.com"),
        explorer_url="https://etherscan.io",
        dex_name="Uniswap",
        coin_type=60,  # BIP44: m/44'/60'/0'/0
        chain_id=1,
        rpc_url_backup="https://rpc.ankr.com/eth",
        explorer_api_url="https://api.etherscan.io/api",
        dex_router="0xE592427A0AEce92De3Edee1F18E0157C05861564",  # Uniswap V3
        decimals=18,
        usdt_address="0xdAC17F958D2ee523a2206206994597C13D831ec7",
        usdc_address="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    ),

    # BNB Smart Chain - PancakeSwap
    "BNB": ChainConfig(
        name="BNB Smart Chain",
        symbol="BNB",
        rpc_url=os.getenv("BSC_RPC_URL", "https://bsc-dataseed.binance.org"),
        explorer_url="https://bscscan.com",
        dex_name="PancakeSwap",
        coin_type=60,  # Same as ETH (EVM compatible)
        chain_id=56,
        rpc_url_backup="https://bsc-dataseed1.defibit.io",
        explorer_api_url="https://api.bscscan.com/api",
        dex_router="0x10ED43C718714eb63d5aA57B78B54704E256024E",  # PancakeSwap V2
        decimals=18,
        usdt_address="0x55d398326f99059fF775485246999027B3197955",
        usdc_address="0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    ),

    # Avalanche C-Chain - Trader Joe
    "AVAX": ChainConfig(
        name="Avalanche",
        symbol="AVAX",
        rpc_url=os.getenv("AVAX_RPC_URL", "https://api.avax.network/ext/bc/C/rpc"),
        explorer_url="https://snowtrace.io",
        dex_name="Trader Joe",
        coin_type=60,  # Same as ETH (EVM compatible)
        chain_id=43114,
        rpc_url_backup="https://rpc.ankr.com/avalanche",
        explorer_api_url="https://api.snowtrace.io/api",
        dex_router="0x60aE616a2155Ee3d9A68541Ba4544862310933d4",  # Trader Joe V1
        decimals=18,
        usdt_address="0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",  # USDT.e
        usdc_address="0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",  # USDC native
    ),

    # Polygon - QuickSwap
    "MATIC": ChainConfig(
        name="Polygon",
        symbol="MATIC",
        rpc_url=os.getenv("MATIC_RPC_URL", "https://polygon-rpc.com"),
        explorer_url="https://polygonscan.com",
        dex_name="QuickSwap",
        coin_type=60,  # Same as ETH (EVM compatible)
        chain_id=137,
        rpc_url_backup="https://rpc.ankr.com/polygon",
        explorer_api_url="https://api.polygonscan.com/api",
        dex_router="0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",  # QuickSwap V2
        decimals=18,
        usdt_address="0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        usdc_address="0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",  # USDC.e
    ),

    # Solana - Jupiter
    "SOL": ChainConfig(
        name="Solana",
        symbol="SOL",
        rpc_url=os.getenv("SOL_RPC_URL", "https://api.mainnet-beta.solana.com"),
        explorer_url="https://solscan.io",
        dex_name="Jupiter",
        coin_type=501,  # BIP44: m/44'/501'/0'/0'
        chain_id=None,
        rpc_url_backup="https://solana-mainnet.rpc.extrnode.com",
        explorer_api_url="https://api.solscan.io",
        decimals=9,
        # SPL Token addresses
        usdt_address="Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        usdc_address="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    ),

    # Cosmos - Osmosis
    "ATOM": ChainConfig(
        name="Cosmos Hub",
        symbol="ATOM",
        rpc_url=os.getenv("ATOM_RPC_URL", "https://cosmos-rest.publicnode.com"),
        explorer_url="https://www.mintscan.io/cosmos",
        dex_name="Osmosis",
        coin_type=118,  # BIP44: m/44'/118'/0'/0
        chain_id=None,
        rpc_url_backup="https://rest.cosmos.directory/cosmoshub",
        explorer_api_url="https://cosmos-rest.publicnode.com",
        decimals=6,
        address_prefix="cosmos",
        # Osmosis IBC tokens
        usdt_address="ibc/4ABBEF4C8926DDDB320AE5188CFD63267ABBCEFC0583E4AE05D6E5AA2401DDAB",  # axlUSDT
        usdc_address="ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858",  # axlUSDC
    ),
}


# ======================
# Helper Functions
# ======================

def get_chain(symbol: str) -> Optional[ChainConfig]:
    """Get chain configuration by symbol."""
    return CHAINS.get(symbol.upper())


def get_all_chains() -> list[ChainConfig]:
    """Get all chain configurations."""
    return list(CHAINS.values())


def get_evm_chains() -> list[ChainConfig]:
    """Get EVM-compatible chains (ETH, BNB, AVAX, MATIC)."""
    return [c for c in CHAINS.values() if c.chain_id is not None]


def get_rpc_url(symbol: str) -> Optional[str]:
    """Get RPC URL for a chain."""
    chain = get_chain(symbol)
    return chain.rpc_url if chain else None


def get_stablecoin_address(chain_symbol: str, stablecoin: str) -> Optional[str]:
    """Get stablecoin contract address on a chain.

    Args:
        chain_symbol: Chain symbol (ETH, BNB, etc.)
        stablecoin: USDT or USDC
    """
    chain = get_chain(chain_symbol)
    if not chain:
        return None

    if stablecoin.upper() == "USDT":
        return chain.usdt_address
    elif stablecoin.upper() == "USDC":
        return chain.usdc_address
    return None


# ======================
# Trust Wallet Derivation Paths
# ======================
# Trust Wallet uses standard BIP44/BIP84 derivation
# Same paths work for generating addresses from seed phrase

DERIVATION_PATHS = {
    "BTC": "m/84'/0'/0'/0/{index}",      # Native SegWit (bc1...)
    "LTC": "m/84'/2'/0'/0/{index}",      # Native SegWit (ltc1...)
    "ETH": "m/44'/60'/0'/0/{index}",     # Standard ETH
    "BNB": "m/44'/60'/0'/0/{index}",     # Same as ETH (EVM)
    "AVAX": "m/44'/60'/0'/0/{index}",    # Same as ETH (EVM)
    "MATIC": "m/44'/60'/0'/0/{index}",   # Same as ETH (EVM)
    "SOL": "m/44'/501'/0'/0/{index}",    # Solana
    "ATOM": "m/44'/118'/0'/0/{index}",   # Cosmos
}


def get_derivation_path(symbol: str, index: int = 0) -> Optional[str]:
    """Get derivation path for a coin.

    Args:
        symbol: Coin symbol
        index: Address index (default 0)
    """
    path = DERIVATION_PATHS.get(symbol.upper())
    if path:
        return path.format(index=index)
    return None
