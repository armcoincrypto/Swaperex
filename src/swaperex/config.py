"""Application configuration using pydantic-settings."""

from functools import lru_cache
from pathlib import Path
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

    # Telegram
    telegram_bot_token: str = Field(default="", description="Telegram bot token from BotFather")

    # Database
    database_url: str = Field(
        default="sqlite+aiosqlite:///./data/swaperex.db",
        description="Database connection URL",
    )

    # API
    api_host: str = Field(default="0.0.0.0", description="API server host")
    api_port: int = Field(default=8000, description="API server port")

    # Environment
    environment: str = Field(default="development", description="Runtime environment")
    debug: bool = Field(default=True, description="Enable debug mode")

    # Admin
    admin_user_ids: str = Field(
        default="", description="Comma-separated list of admin Telegram user IDs"
    )

    # Routing (Stage 2)
    thorchain_api_url: Optional[str] = Field(default=None, description="THORChain API URL")
    dex_aggregator_api_url: Optional[str] = Field(default=None, description="DEX aggregator URL")
    mm2_rpc_url: Optional[str] = Field(default=None, description="MM2 RPC URL")

    # Deposit Provider (Stage 2)
    deposit_webhook_secret: Optional[str] = Field(
        default=None, description="Secret for deposit webhook verification"
    )

    # Provider configuration
    provider: str = Field(
        default="dryrun",
        description="Deposit provider: dryrun, cryptoapis, nowpayments",
    )
    cryptoapis_key: str = Field(default="", description="CryptoAPIs API key")
    nowpayments_key: str = Field(default="", description="NOWPayments API key")

    # Admin API
    admin_token: str = Field(default="", description="Admin API token for protected endpoints")

    # Safety guards
    dry_run: bool = Field(default=True, description="Enable dry-run mode (no real transactions)")
    hot_wallet_threshold: float = Field(
        default=0.0, description="Hot wallet balance threshold (0 = disabled)"
    )

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
            "provider": self.provider,
            "cryptoapis_key": "***" if self.cryptoapis_key else "(not set)",
            "nowpayments_key": "***" if self.nowpayments_key else "(not set)",
            "admin_token": "***" if self.admin_token else "(not set)",
            "hot_wallet_threshold": self.hot_wallet_threshold,
            "thorchain_api_url": self.thorchain_api_url or "(not set)",
            "dex_aggregator_api_url": self.dex_aggregator_api_url or "(not set)",
            "mm2_rpc_url": self.mm2_rpc_url or "(not set)",
        }
        return data

    @staticmethod
    def _redact_url(url: str) -> str:
        """Redact sensitive parts of database URL."""
        if "://" in url and "@" in url:
            # Redact password in URL
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
