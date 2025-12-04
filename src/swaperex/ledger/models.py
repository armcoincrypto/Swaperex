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

    CREATED = "created"           # Initial state
    RESERVED = "reserved"         # Funds reserved
    MM2_WAITING = "mm2_waiting"   # Waiting for mm2 P2P match
    MM2_INPROGRESS = "mm2_inprogress"  # mm2 swap in progress
    THOR_PENDING = "thor_pending"      # THORChain swap pending
    DEX_PENDING = "dex_pending"        # DEX swap pending
    BROADCASTED = "broadcasted"        # Transaction broadcasted
    PENDING = "pending"           # Legacy - waiting
    ROUTING = "routing"           # Finding best route
    COMPLETED = "completed"       # Swap completed
    FAILED = "failed"             # Swap failed
    REFUNDED = "refunded"         # Funds refunded to user


class WithdrawalStatus(str, Enum):
    """Status of a withdrawal."""

    PENDING = "pending"          # Created, waiting for processing
    BUILDING = "building"        # Building transaction
    SIGNED = "signed"            # Transaction signed
    BROADCAST = "broadcast"      # Sent to network
    CONFIRMING = "confirming"    # Waiting for confirmations
    COMPLETED = "completed"      # Fully confirmed
    FAILED = "failed"            # Failed at any stage
    CANCELLED = "cancelled"      # Cancelled by user/admin


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
    withdrawals: Mapped[list["Withdrawal"]] = relationship(back_populates="user", lazy="selectin")
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
    """Unique deposit address per user per asset.

    For HD wallets, stores derivation path information.
    """

    __tablename__ = "deposit_addresses"
    __table_args__ = (Index("ix_deposit_addresses_user_asset", "user_id", "asset", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)

    # HD wallet derivation info
    derivation_path: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    derivation_index: Mapped[Optional[int]] = mapped_column(nullable=True)
    change: Mapped[int] = mapped_column(default=0)  # 0 = receiving, 1 = change

    # Status tracking
    status: Mapped[str] = mapped_column(String(20), default="active")  # unused, active, used

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="deposit_addresses")


class HDWalletState(Base):
    """Tracks the last used index for each HD wallet asset.

    This ensures deterministic address generation without collisions.
    """

    __tablename__ = "hd_wallet_state"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    asset: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    last_index: Mapped[int] = mapped_column(default=0)  # Last used child index
    change: Mapped[int] = mapped_column(default=0)  # 0 = receiving, 1 = change
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


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


class XpubKey(Base):
    """Stores encrypted extended public keys for HD wallet derivation.

    Keys are encrypted using Fernet (AES-128-CBC) with a master key.
    """

    __tablename__ = "xpub_keys"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    asset: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    encrypted_xpub: Mapped[str] = mapped_column(Text, nullable=False)  # Fernet encrypted
    key_type: Mapped[str] = mapped_column(String(20), default="xpub")  # xpub, tpub, zpub, etc.
    is_testnet: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProcessedTransaction(Base):
    """Tracks processed transactions for idempotent webhook handling.

    Prevents double-crediting from duplicate webhooks or scanner re-runs.
    """

    __tablename__ = "processed_transactions"
    __table_args__ = (Index("ix_processed_tx_chain_hash", "chain", "tx_hash", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chain: Mapped[str] = mapped_column(String(20), nullable=False)  # BTC, ETH, TRX, etc.
    tx_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    tx_index: Mapped[int] = mapped_column(default=0)  # For multi-output transactions
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # webhook, scanner
    amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    to_address: Mapped[str] = mapped_column(String(255), nullable=False)
    deposit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("deposits.id"), nullable=True)
    raw_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON for audit
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Swap(Base):
    """Record of a swap transaction."""

    __tablename__ = "swaps"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    client_ref: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)  # Idempotency key
    from_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    to_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    from_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    to_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(36, 18), nullable=True)
    expected_to_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    dest_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # For cross-chain swaps
    route: Mapped[str] = mapped_column(String(50), nullable=False)  # mm2, thorchain, dex, dry_run
    route_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON route info
    fee_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    fee_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    status: Mapped[SwapStatus] = mapped_column(
        String(20), default=SwapStatus.CREATED, nullable=False
    )

    # Hybrid swap engine fields
    mm2_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    inbound_txid: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # Tx to THORChain/DEX
    outbound_txid: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # Tx from THORChain/DEX
    vault_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # THORChain vault
    memo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # THORChain memo

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="swaps")


class Withdrawal(Base):
    """Record of a withdrawal transaction."""

    __tablename__ = "withdrawals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    fee_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)  # amount - fee
    destination_address: Mapped[str] = mapped_column(String(255), nullable=False)
    tx_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    status: Mapped[WithdrawalStatus] = mapped_column(
        String(20), default=WithdrawalStatus.PENDING, nullable=False
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confirmations: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    broadcast_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="withdrawals")


class AuditLogType(str, Enum):
    """Type of audit log entry."""

    DEPOSIT = "deposit"              # Deposit credited
    WITHDRAWAL = "withdrawal"        # Withdrawal debited
    SWAP_DEBIT = "swap_debit"        # Swap from_asset debited
    SWAP_CREDIT = "swap_credit"      # Swap to_asset credited
    LOCK = "lock"                    # Funds locked for operation
    UNLOCK = "unlock"                # Funds unlocked (cancel/refund)
    ADMIN_CREDIT = "admin_credit"    # Manual admin credit
    ADMIN_DEBIT = "admin_debit"      # Manual admin debit
    RECONCILIATION = "reconciliation"  # Auto-reconciliation adjustment
    FEE = "fee"                      # Fee charged
    REFUND = "refund"                # Refund processed


class AuditLog(Base):
    """Immutable audit trail for all balance changes.

    Every change to a user's balance is logged here with full context.
    This enables:
    - Complete transaction history
    - Reconciliation and debugging
    - Regulatory compliance
    - Dispute resolution
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_user_asset", "user_id", "asset"),
        Index("ix_audit_logs_created_at", "created_at"),
        Index("ix_audit_logs_ref", "reference_type", "reference_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)

    # Change details
    log_type: Mapped[AuditLogType] = mapped_column(String(30), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)  # Positive = credit, Negative = debit
    balance_before: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)

    # Reference to related entity
    reference_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # deposit, withdrawal, swap
    reference_id: Mapped[Optional[int]] = mapped_column(nullable=True)  # ID of related record

    # Additional context
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    tx_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Additional JSON data

    # Actor info
    actor_type: Mapped[str] = mapped_column(String(20), default="system")  # system, admin, user
    actor_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # Admin user ID if manual

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship()


class SystemConfig(Base):
    """System-wide configuration settings.

    Stores runtime configuration that can be changed without restart.
    """

    __tablename__ = "system_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class HotWalletBalance(Base):
    """Tracks expected hot wallet balance per asset.

    Used for reconciliation against actual blockchain balance.
    """

    __tablename__ = "hot_wallet_balances"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    asset: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    expected_balance: Mapped[Decimal] = mapped_column(Numeric(36, 18), default=Decimal("0"))
    last_blockchain_balance: Mapped[Optional[Decimal]] = mapped_column(Numeric(36, 18), nullable=True)
    last_reconciled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    discrepancy: Mapped[Optional[Decimal]] = mapped_column(Numeric(36, 18), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
