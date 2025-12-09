"""Application configuration using pydantic-settings.

Supports Trust Wallet seed phrase for HD wallet derivation across 8 chains.
"""

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ======================
    # Telegram
    # ======================
    telegram_bot_token: str = Field(default="", description="Telegram bot token from BotFather")

    # ======================
    # Database
    # ======================
    database_url: str = Field(
        default="sqlite+aiosqlite:///./data/swaperex.db",
        description="Database connection URL",
    )

    # ======================
    # API
    # ======================
    api_host: str = Field(default="0.0.0.0", description="API server host")
    api_port: int = Field(default=8000, description="API server port")

    # ======================
    # Environment
    # ======================
    environment: str = Field(default="development", description="Runtime environment")
    debug: bool = Field(default=True, description="Enable debug mode")

    # ======================
    # Admin
    # ======================
    admin_user_ids: str = Field(
        default="", description="Comma-separated list of admin Telegram user IDs"
    )
    admin_token: str = Field(default="", description="Admin API token for protected endpoints")

    # ======================
    # Trust Wallet / HD Wallet
    # ======================
    wallet_seed_phrase: Optional[str] = Field(
        default=None, description="Trust Wallet 12/24 word seed phrase for HD derivation"
    )

    # ======================
    # Chain RPC Endpoints
    # ======================
    # EVM Chains
    eth_rpc_url: str = Field(
        default="https://eth.llamarpc.com", description="Ethereum RPC URL"
    )
    bsc_rpc_url: str = Field(
        default="https://bsc-dataseed.binance.org", description="BSC RPC URL"
    )
    avax_rpc_url: str = Field(
        default="https://api.avax.network/ext/bc/C/rpc", description="Avalanche RPC URL"
    )
    matic_rpc_url: str = Field(
        default="https://polygon-rpc.com", description="Polygon RPC URL"
    )

    # Non-EVM Chains
    sol_rpc_url: str = Field(
        default="https://api.mainnet-beta.solana.com", description="Solana RPC URL"
    )
    atom_rpc_url: str = Field(
        default="https://cosmos-rest.publicnode.com", description="Cosmos REST URL"
    )

    # ======================
    # Block Explorer API Keys
    # ======================
    etherscan_api_key: str = Field(default="", description="Etherscan API key")
    bscscan_api_key: str = Field(default="", description="BscScan API key")
    snowtrace_api_key: str = Field(default="", description="SnowTrace API key")
    polygonscan_api_key: str = Field(default="", description="PolygonScan API key")
    solscan_api_key: str = Field(default="", description="Solscan API key")
    blockfrost_api_key: str = Field(default="", description="Blockfrost API key for Cardano")

    # ======================
    # DEX Configuration
    # ======================
    thorchain_api_url: str = Field(
        default="https://thornode.ninerealms.com", description="THORChain API URL"
    )
    default_slippage: float = Field(
        default=0.005, description="Default slippage tolerance (0.5%)"
    )

    # ======================
    # Internal Reserve (USDT Bridging)
    # ======================
    usdt_bridge_spread: float = Field(
        default=0.001, description="USDT bridge spread (0.1%)"
    )
    min_reserve_alert: float = Field(
        default=1000, description="Alert if reserve below USD amount"
    )

    # ======================
    # Safety Guards
    # ======================
    dry_run: bool = Field(default=True, description="Enable dry-run mode (no real transactions)")
    max_swap_amount: float = Field(
        default=10000, description="Maximum single swap amount in USD"
    )
    hot_wallet_threshold: float = Field(
        default=0.0, description="Hot wallet balance threshold (0 = disabled)"
    )

    # ======================
    # Encryption
    # ======================
    master_key: Optional[str] = Field(
        default=None, description="Master encryption key for xpub storage (Fernet key)"
    )

    # ======================
    # Legacy (kept for compatibility)
    # ======================
    dash_spread_pct: float = Field(default=1.0, description="DASH swap spread percentage")
    dash_hot_wallet_address: Optional[str] = Field(default=None, description="DASH hot wallet address")
    dash_hot_wallet_wif: Optional[str] = Field(default=None, description="DASH hot wallet WIF key")
    deposit_webhook_secret: Optional[str] = Field(default=None, description="Webhook secret")
    provider: str = Field(default="dryrun", description="Deposit provider")
    cryptoapis_key: str = Field(default="", description="CryptoAPIs API key")
    nowpayments_key: str = Field(default="", description="NOWPayments API key")

    @property
    def admin_ids(self) -> list[int]:
        """Parse admin user IDs into a list of integers."""
        if not self.admin_user_ids:
            return []
        return [int(uid.strip()) for uid in self.admin_user_ids.split(",") if uid.strip()]

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment.lower() == "production"

    @property
    def has_wallet(self) -> bool:
        """Check if wallet seed phrase is configured."""
        return bool(self.wallet_seed_phrase and len(self.wallet_seed_phrase.split()) >= 12)

    def get_rpc_url(self, chain: str) -> str:
        """Get RPC URL for a specific chain."""
        rpc_map = {
            "ETH": self.eth_rpc_url,
            "BNB": self.bsc_rpc_url,
            "BSC": self.bsc_rpc_url,
            "AVAX": self.avax_rpc_url,
            "MATIC": self.matic_rpc_url,
            "SOL": self.sol_rpc_url,
            "ATOM": self.atom_rpc_url,
        }
        return rpc_map.get(chain.upper(), "")

    def get_explorer_api_key(self, chain: str) -> str:
        """Get block explorer API key for a chain."""
        key_map = {
            "ETH": self.etherscan_api_key,
            "BNB": self.bscscan_api_key,
            "BSC": self.bscscan_api_key,
            "AVAX": self.snowtrace_api_key,
            "MATIC": self.polygonscan_api_key,
            "SOL": self.solscan_api_key,
        }
        return key_map.get(chain.upper(), "")

    def get_safe_dict(self) -> dict:
        """Return settings dict with secrets redacted."""
        data = {
            "environment": self.environment,
            "debug": self.debug,
            "dry_run": self.dry_run,
            "api_host": self.api_host,
            "api_port": self.api_port,
            "database_url": self._redact_url(self.database_url),
            "telegram_bot_token": "***" if self.telegram_bot_token else "(not set)",
            "admin_user_ids": self.admin_user_ids or "(none)",
            "wallet_configured": self.has_wallet,
            "chains": {
                "ETH": {"rpc": self.eth_rpc_url, "api_key": "***" if self.etherscan_api_key else "(not set)"},
                "BNB": {"rpc": self.bsc_rpc_url, "api_key": "***" if self.bscscan_api_key else "(not set)"},
                "AVAX": {"rpc": self.avax_rpc_url, "api_key": "***" if self.snowtrace_api_key else "(not set)"},
                "MATIC": {"rpc": self.matic_rpc_url, "api_key": "***" if self.polygonscan_api_key else "(not set)"},
                "SOL": {"rpc": self.sol_rpc_url, "api_key": "***" if self.solscan_api_key else "(not set)"},
                "ATOM": {"rpc": self.atom_rpc_url},
                "BTC": {"provider": "Blockstream"},
                "LTC": {"provider": "LitecoinSpace"},
            },
            "dex": {
                "thorchain": self.thorchain_api_url,
                "slippage": self.default_slippage,
            },
            "safety": {
                "max_swap_amount": self.max_swap_amount,
                "hot_wallet_threshold": self.hot_wallet_threshold,
            },
        }
        return data

    @staticmethod
    def _redact_url(url: str) -> str:
        """Redact sensitive parts of database URL."""
        if "://" in url and "@" in url:
            proto, rest = url.split("://", 1)
            if "@" in rest:
                creds, host = rest.rsplit("@", 1)
                if ":" in creds:
                    user, _ = creds.split(":", 1)
                    return f"{proto}://{user}:***@{host}"
        return url


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
