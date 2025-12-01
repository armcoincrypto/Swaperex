"""SQLAlchemy models for the ledger."""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


class DepositStatus(str, Enum):
    """Status of a deposit."""

    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"


class SwapStatus(str, Enum):
    """Status of a swap."""

    PENDING = "pending"
    ROUTING = "routing"
    COMPLETED = "completed"
    FAILED = "failed"


class User(Base):
    """User account linked to Telegram."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    balances: Mapped[list["Balance"]] = relationship(back_populates="user", lazy="selectin")
    deposits: Mapped[list["Deposit"]] = relationship(back_populates="user", lazy="selectin")
    swaps: Mapped[list["Swap"]] = relationship(back_populates="user", lazy="selectin")
    deposit_addresses: Mapped[list["DepositAddress"]] = relationship(
        back_populates="user", lazy="selectin"
    )


class Balance(Base):
    """User balance for a specific asset."""

    __tablename__ = "balances"
    __table_args__ = (Index("ix_balances_user_asset", "user_id", "asset", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g., BTC, ETH, USDT
    amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), default=Decimal("0"))
    locked_amount: Mapped[Decimal] = mapped_column(
        Numeric(36, 18), default=Decimal("0")
    )  # Amount locked in pending swaps
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="balances")

    @property
    def available(self) -> Decimal:
        """Get available (unlocked) balance."""
        return self.amount - self.locked_amount


class DepositAddress(Base):
    """Unique deposit address per user per asset."""

    __tablename__ = "deposit_addresses"
    __table_args__ = (Index("ix_deposit_addresses_user_asset", "user_id", "asset", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="deposit_addresses")


class Deposit(Base):
    """Record of a deposit transaction."""

    __tablename__ = "deposits"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    tx_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    from_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    to_address: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[DepositStatus] = mapped_column(
        String(20), default=DepositStatus.PENDING, nullable=False
    )
    confirmations: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="deposits")


class Swap(Base):
    """Record of a swap transaction."""

    __tablename__ = "swaps"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    from_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    to_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    from_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    to_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(36, 18), nullable=True)
    expected_to_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    route: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., "thorchain", "1inch"
    route_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON route info
    fee_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    fee_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    status: Mapped[SwapStatus] = mapped_column(
        String(20), default=SwapStatus.PENDING, nullable=False
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="swaps")
