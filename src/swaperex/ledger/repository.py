"""Repository for ledger operations."""

import hashlib
import secrets
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from swaperex.ledger.models import (
    AuditLog,
    AuditLogType,
    Balance,
    Deposit,
    DepositAddress,
    DepositStatus,
    HDWalletState,
    HotWalletBalance,
    ProcessedTransaction,
    Swap,
    SwapStatus,
    SystemConfig,
    User,
    Withdrawal,
    WithdrawalStatus,
    XpubKey,
)


class LedgerRepository:
    """Repository for all ledger-related database operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    # User operations
    async def get_or_create_user(
        self,
        telegram_id: int,
        username: Optional[str] = None,
        first_name: Optional[str] = None,
    ) -> User:
        """Get existing user or create a new one."""
        stmt = select(User).where(User.telegram_id == telegram_id)
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                telegram_id=telegram_id,
                username=username,
                first_name=first_name,
            )
            self.session.add(user)
            await self.session.flush()

        return user

    async def get_user_by_telegram_id(self, telegram_id: int) -> Optional[User]:
        """Get user by Telegram ID."""
        stmt = select(User).where(User.telegram_id == telegram_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    # Balance operations
    async def get_balance(self, user_id: int, asset: str) -> Optional[Balance]:
        """Get user balance for a specific asset."""
        stmt = select(Balance).where(Balance.user_id == user_id, Balance.asset == asset.upper())
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_balances(self, user_id: int) -> list[Balance]:
        """Get all balances for a user."""
        stmt = select(Balance).where(Balance.user_id == user_id).order_by(Balance.asset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_or_create_balance(self, user_id: int, asset: str) -> Balance:
        """Get or create a balance record for user/asset."""
        balance = await self.get_balance(user_id, asset)
        if balance is None:
            balance = Balance(user_id=user_id, asset=asset.upper(), amount=Decimal("0"))
            self.session.add(balance)
            await self.session.flush()
        return balance

    async def credit_balance(self, user_id: int, asset: str, amount: Decimal) -> Balance:
        """Add amount to user balance."""
        balance = await self.get_or_create_balance(user_id, asset)
        balance.amount += amount
        await self.session.flush()
        return balance

    async def debit_balance(self, user_id: int, asset: str, amount: Decimal) -> Balance:
        """Subtract amount from user balance. Raises ValueError if insufficient."""
        balance = await self.get_or_create_balance(user_id, asset)
        if balance.available < amount:
            raise ValueError(
                f"Insufficient balance: have {balance.available} {asset}, need {amount}"
            )
        balance.amount -= amount
        await self.session.flush()
        return balance

    async def lock_balance(self, user_id: int, asset: str, amount: Decimal) -> Balance:
        """Lock amount for pending swap. Raises ValueError if insufficient."""
        balance = await self.get_or_create_balance(user_id, asset)
        if balance.available < amount:
            raise ValueError(
                f"Insufficient available balance: have {balance.available} {asset}, need {amount}"
            )
        balance.locked_amount += amount
        await self.session.flush()
        return balance

    async def unlock_balance(self, user_id: int, asset: str, amount: Decimal) -> Balance:
        """Unlock previously locked amount."""
        balance = await self.get_balance(user_id, asset)
        if balance is None:
            raise ValueError(f"No balance found for {asset}")
        balance.locked_amount = max(Decimal("0"), balance.locked_amount - amount)
        await self.session.flush()
        return balance

    # Deposit address operations
    async def get_deposit_address(self, user_id: int, asset: str) -> Optional[DepositAddress]:
        """Get deposit address for user/asset."""
        stmt = select(DepositAddress).where(
            DepositAddress.user_id == user_id, DepositAddress.asset == asset.upper()
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_or_create_deposit_address(self, user_id: int, asset: str) -> DepositAddress:
        """Get or generate a unique deposit address for user/asset."""
        addr = await self.get_deposit_address(user_id, asset)
        if addr is None:
            # Generate a deterministic but unique address (simulated for PoC)
            address = self._generate_simulated_address(user_id, asset)
            addr = DepositAddress(user_id=user_id, asset=asset.upper(), address=address)
            self.session.add(addr)
            await self.session.flush()
        return addr

    async def create_deposit_address(
        self, user_id: int, asset: str, address: str,
        derivation_path: Optional[str] = None,
        derivation_index: Optional[int] = None,
    ) -> DepositAddress:
        """Create a deposit address with a specific address string (from provider)."""
        addr = DepositAddress(
            user_id=user_id,
            asset=asset.upper(),
            address=address,
            derivation_path=derivation_path,
            derivation_index=derivation_index,
        )
        self.session.add(addr)
        await self.session.flush()
        return addr

    async def get_user_by_deposit_address(self, address: str) -> Optional[User]:
        """Find user by deposit address."""
        stmt = (
            select(User)
            .join(DepositAddress)
            .where(DepositAddress.address == address)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_deposit_address_record(self, address: str) -> Optional[DepositAddress]:
        """Get deposit address record by address string."""
        stmt = select(DepositAddress).where(DepositAddress.address == address)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    def _generate_simulated_address(self, user_id: int, asset: str) -> str:
        """Generate a simulated deposit address (PoC only)."""
        # Create deterministic but unique address based on user_id and asset
        seed = f"{user_id}:{asset}:{secrets.token_hex(8)}"
        hash_bytes = hashlib.sha256(seed.encode()).hexdigest()

        # Format based on asset type (simulated)
        prefixes = {
            "BTC": "bc1q",
            "ETH": "0x",
            "USDT": "0x",
            "USDC": "0x",
            "SOL": "",
            "ATOM": "cosmos1",
            "RUNE": "thor1",
        }
        prefix = prefixes.get(asset.upper(), "0x")

        if asset.upper() == "BTC":
            return f"{prefix}{hash_bytes[:38]}"
        elif asset.upper() in ("ETH", "USDT", "USDC"):
            return f"{prefix}{hash_bytes[:40]}"
        elif asset.upper() == "SOL":
            return hash_bytes[:44]
        else:
            return f"{prefix}{hash_bytes[:38]}"

    # Deposit operations
    async def create_deposit(
        self,
        user_id: int,
        asset: str,
        amount: Decimal,
        to_address: str,
        tx_hash: Optional[str] = None,
        from_address: Optional[str] = None,
        status: DepositStatus = DepositStatus.PENDING,
    ) -> Deposit:
        """Create a new deposit record."""
        deposit = Deposit(
            user_id=user_id,
            asset=asset.upper(),
            amount=amount,
            to_address=to_address,
            tx_hash=tx_hash,
            from_address=from_address,
            status=status,
        )
        self.session.add(deposit)
        await self.session.flush()
        return deposit

    async def confirm_deposit(self, deposit_id: int) -> Deposit:
        """Mark deposit as confirmed and credit user balance."""
        stmt = select(Deposit).where(Deposit.id == deposit_id)
        result = await self.session.execute(stmt)
        deposit = result.scalar_one_or_none()

        if deposit is None:
            raise ValueError(f"Deposit {deposit_id} not found")

        if deposit.status == DepositStatus.CONFIRMED:
            return deposit  # Already confirmed

        deposit.status = DepositStatus.CONFIRMED
        deposit.confirmed_at = datetime.utcnow()

        # Credit user balance
        await self.credit_balance(deposit.user_id, deposit.asset, deposit.amount)

        await self.session.flush()
        return deposit

    async def get_user_deposits(
        self, user_id: int, limit: int = 20, offset: int = 0
    ) -> list[Deposit]:
        """Get deposit history for a user."""
        stmt = (
            select(Deposit)
            .where(Deposit.user_id == user_id)
            .order_by(Deposit.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_deposit_by_txid(self, txid: str) -> Optional[Deposit]:
        """Get deposit by transaction hash (idempotent check)."""
        stmt = select(Deposit).where(Deposit.tx_hash == txid)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    # Swap operations
    async def create_swap(
        self,
        user_id: int,
        from_asset: str,
        to_asset: str,
        from_amount: Decimal,
        expected_to_amount: Decimal,
        route: str,
        fee_asset: str,
        fee_amount: Decimal,
        route_details: Optional[str] = None,
    ) -> Swap:
        """Create a new swap record and lock the from_amount."""
        # Lock the balance first
        await self.lock_balance(user_id, from_asset, from_amount)

        swap = Swap(
            user_id=user_id,
            from_asset=from_asset.upper(),
            to_asset=to_asset.upper(),
            from_amount=from_amount,
            expected_to_amount=expected_to_amount,
            route=route,
            route_details=route_details,
            fee_asset=fee_asset.upper(),
            fee_amount=fee_amount,
            status=SwapStatus.PENDING,
        )
        self.session.add(swap)
        await self.session.flush()
        return swap

    async def complete_swap(self, swap_id: int, actual_to_amount: Decimal) -> Swap:
        """Complete a swap, debit from_asset and credit to_asset."""
        stmt = select(Swap).where(Swap.id == swap_id)
        result = await self.session.execute(stmt)
        swap = result.scalar_one_or_none()

        if swap is None:
            raise ValueError(f"Swap {swap_id} not found")

        if swap.status == SwapStatus.COMPLETED:
            return swap

        # Unlock and debit the from_amount
        await self.unlock_balance(swap.user_id, swap.from_asset, swap.from_amount)
        await self.debit_balance(swap.user_id, swap.from_asset, swap.from_amount)

        # Credit the to_amount
        await self.credit_balance(swap.user_id, swap.to_asset, actual_to_amount)

        swap.to_amount = actual_to_amount
        swap.status = SwapStatus.COMPLETED
        swap.completed_at = datetime.utcnow()

        await self.session.flush()
        return swap

    async def fail_swap(self, swap_id: int, error_message: str) -> Swap:
        """Mark swap as failed and unlock the locked balance."""
        stmt = select(Swap).where(Swap.id == swap_id)
        result = await self.session.execute(stmt)
        swap = result.scalar_one_or_none()

        if swap is None:
            raise ValueError(f"Swap {swap_id} not found")

        # Unlock the balance
        await self.unlock_balance(swap.user_id, swap.from_asset, swap.from_amount)

        swap.status = SwapStatus.FAILED
        swap.error_message = error_message

        await self.session.flush()
        return swap

    async def get_user_swaps(self, user_id: int, limit: int = 20, offset: int = 0) -> list[Swap]:
        """Get swap history for a user."""
        stmt = (
            select(Swap)
            .where(Swap.user_id == user_id)
            .order_by(Swap.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_swap_by_id(self, swap_id: int) -> Optional[Swap]:
        """Get a swap by ID."""
        stmt = select(Swap).where(Swap.id == swap_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    # HD Wallet State operations
    async def get_hd_wallet_state(self, asset: str) -> Optional[HDWalletState]:
        """Get HD wallet state for an asset."""
        stmt = select(HDWalletState).where(HDWalletState.asset == asset.upper())
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_next_hd_index(self, asset: str) -> int:
        """Get the next available HD wallet index for an asset.

        Atomically increments the index to prevent collisions.
        """
        state = await self.get_hd_wallet_state(asset)

        if state is None:
            # Create initial state
            state = HDWalletState(asset=asset.upper(), last_index=0)
            self.session.add(state)
            await self.session.flush()
            return 0
        else:
            # Increment and return next index
            next_index = state.last_index + 1
            state.last_index = next_index
            await self.session.flush()
            return next_index

    async def get_all_active_deposit_addresses(
        self, asset: Optional[str] = None
    ) -> list[DepositAddress]:
        """Get all active deposit addresses, optionally filtered by asset.

        Used by the deposit scanner to monitor for incoming transactions.
        """
        stmt = select(DepositAddress).where(DepositAddress.status == "active")
        if asset:
            stmt = stmt.where(DepositAddress.asset == asset.upper())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # Xpub Key operations
    async def store_xpub(
        self,
        asset: str,
        encrypted_xpub: str,
        label: str,
        key_type: str = "xpub",
        is_testnet: bool = False,
    ) -> XpubKey:
        """Store an encrypted xpub key.

        If one already exists for the asset, it will be updated.
        """
        stmt = select(XpubKey).where(XpubKey.asset == asset.upper())
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.encrypted_xpub = encrypted_xpub
            existing.label = label
            existing.key_type = key_type
            existing.is_testnet = is_testnet
            await self.session.flush()
            return existing
        else:
            xpub_key = XpubKey(
                asset=asset.upper(),
                encrypted_xpub=encrypted_xpub,
                label=label,
                key_type=key_type,
                is_testnet=is_testnet,
            )
            self.session.add(xpub_key)
            await self.session.flush()
            return xpub_key

    async def get_xpub(self, asset: str) -> Optional[XpubKey]:
        """Get stored xpub for an asset."""
        stmt = select(XpubKey).where(XpubKey.asset == asset.upper())
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_xpubs(self) -> list[XpubKey]:
        """Get all stored xpub keys."""
        stmt = select(XpubKey).order_by(XpubKey.asset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def delete_xpub(self, asset: str) -> bool:
        """Delete stored xpub for an asset."""
        stmt = select(XpubKey).where(XpubKey.asset == asset.upper())
        result = await self.session.execute(stmt)
        xpub = result.scalar_one_or_none()
        if xpub:
            await self.session.delete(xpub)
            await self.session.flush()
            return True
        return False

    # Atomic HD index allocation (for PostgreSQL with FOR UPDATE)
    async def allocate_hd_index_atomic(self, asset: str) -> int:
        """Atomically allocate the next HD index.

        Uses SELECT FOR UPDATE to prevent race conditions.
        For SQLite, falls back to regular select (SQLite has implicit locking).
        """
        from sqlalchemy.dialects import postgresql

        # Check if we're using PostgreSQL
        dialect = self.session.bind.dialect.name if self.session.bind else "sqlite"

        if dialect == "postgresql":
            # Use FOR UPDATE for PostgreSQL
            stmt = (
                select(HDWalletState)
                .where(HDWalletState.asset == asset.upper())
                .with_for_update()
            )
        else:
            # SQLite uses implicit locking
            stmt = select(HDWalletState).where(HDWalletState.asset == asset.upper())

        result = await self.session.execute(stmt)
        state = result.scalar_one_or_none()

        if state is None:
            # Create initial state
            state = HDWalletState(asset=asset.upper(), last_index=0)
            self.session.add(state)
            await self.session.flush()
            return 0
        else:
            # Increment and return next index
            next_index = state.last_index + 1
            state.last_index = next_index
            await self.session.flush()
            return next_index

    # Processed transaction tracking (idempotency)
    async def is_transaction_processed(
        self, chain: str, tx_hash: str, tx_index: int = 0
    ) -> bool:
        """Check if a transaction has already been processed."""
        stmt = select(ProcessedTransaction).where(
            ProcessedTransaction.chain == chain.upper(),
            ProcessedTransaction.tx_hash == tx_hash,
            ProcessedTransaction.tx_index == tx_index,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def mark_transaction_processed(
        self,
        chain: str,
        tx_hash: str,
        amount: Decimal,
        to_address: str,
        source: str = "scanner",
        tx_index: int = 0,
        deposit_id: Optional[int] = None,
        raw_payload: Optional[str] = None,
    ) -> ProcessedTransaction:
        """Mark a transaction as processed."""
        processed = ProcessedTransaction(
            chain=chain.upper(),
            tx_hash=tx_hash,
            tx_index=tx_index,
            source=source,
            amount=amount,
            to_address=to_address,
            deposit_id=deposit_id,
            raw_payload=raw_payload,
        )
        self.session.add(processed)
        await self.session.flush()
        return processed

    async def get_processed_transaction(
        self, chain: str, tx_hash: str, tx_index: int = 0
    ) -> Optional[ProcessedTransaction]:
        """Get processed transaction record."""
        stmt = select(ProcessedTransaction).where(
            ProcessedTransaction.chain == chain.upper(),
            ProcessedTransaction.tx_hash == tx_hash,
            ProcessedTransaction.tx_index == tx_index,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    # Balance update (for withdrawals)
    async def update_balance(self, user_id: int, asset: str, delta: Decimal) -> Balance:
        """Update balance by delta (positive for credit, negative for debit)."""
        balance = await self.get_or_create_balance(user_id, asset)
        new_amount = balance.amount + delta
        if new_amount < 0:
            raise ValueError(f"Insufficient balance for {asset}")
        balance.amount = new_amount
        await self.session.flush()
        return balance

    # Withdrawal operations
    async def create_withdrawal(
        self,
        user_id: int,
        asset: str,
        amount: Decimal,
        fee_amount: Decimal,
        destination_address: str,
    ) -> Withdrawal:
        """Create a new withdrawal and debit user balance.

        Deducts the full amount (including fee) from user balance.
        """
        net_amount = amount - fee_amount

        # Debit the full amount from balance
        await self.debit_balance(user_id, asset, amount)

        withdrawal = Withdrawal(
            user_id=user_id,
            asset=asset.upper(),
            amount=amount,
            fee_amount=fee_amount,
            net_amount=net_amount,
            destination_address=destination_address,
            status=WithdrawalStatus.PENDING,
        )
        self.session.add(withdrawal)
        await self.session.flush()
        return withdrawal

    async def update_withdrawal_status(
        self,
        withdrawal_id: int,
        status: WithdrawalStatus,
        tx_hash: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> Withdrawal:
        """Update withdrawal status."""
        stmt = select(Withdrawal).where(Withdrawal.id == withdrawal_id)
        result = await self.session.execute(stmt)
        withdrawal = result.scalar_one_or_none()

        if withdrawal is None:
            raise ValueError(f"Withdrawal {withdrawal_id} not found")

        withdrawal.status = status

        if tx_hash:
            withdrawal.tx_hash = tx_hash

        if error_message:
            withdrawal.error_message = error_message

        if status == WithdrawalStatus.BROADCAST:
            withdrawal.broadcast_at = datetime.utcnow()
        elif status == WithdrawalStatus.COMPLETED:
            withdrawal.completed_at = datetime.utcnow()

        await self.session.flush()
        return withdrawal

    async def complete_withdrawal(
        self, withdrawal_id: int, tx_hash: str, confirmations: int = 1
    ) -> Withdrawal:
        """Mark withdrawal as completed."""
        stmt = select(Withdrawal).where(Withdrawal.id == withdrawal_id)
        result = await self.session.execute(stmt)
        withdrawal = result.scalar_one_or_none()

        if withdrawal is None:
            raise ValueError(f"Withdrawal {withdrawal_id} not found")

        withdrawal.status = WithdrawalStatus.COMPLETED
        withdrawal.tx_hash = tx_hash
        withdrawal.confirmations = confirmations
        withdrawal.completed_at = datetime.utcnow()

        await self.session.flush()
        return withdrawal

    async def fail_withdrawal(
        self, withdrawal_id: int, error_message: str, refund: bool = True
    ) -> Withdrawal:
        """Mark withdrawal as failed and optionally refund user."""
        stmt = select(Withdrawal).where(Withdrawal.id == withdrawal_id)
        result = await self.session.execute(stmt)
        withdrawal = result.scalar_one_or_none()

        if withdrawal is None:
            raise ValueError(f"Withdrawal {withdrawal_id} not found")

        withdrawal.status = WithdrawalStatus.FAILED
        withdrawal.error_message = error_message

        # Refund the full amount if requested
        if refund:
            await self.credit_balance(
                withdrawal.user_id, withdrawal.asset, withdrawal.amount
            )

        await self.session.flush()
        return withdrawal

    async def cancel_withdrawal(self, withdrawal_id: int) -> Withdrawal:
        """Cancel a pending withdrawal and refund user."""
        stmt = select(Withdrawal).where(Withdrawal.id == withdrawal_id)
        result = await self.session.execute(stmt)
        withdrawal = result.scalar_one_or_none()

        if withdrawal is None:
            raise ValueError(f"Withdrawal {withdrawal_id} not found")

        if withdrawal.status not in (WithdrawalStatus.PENDING, WithdrawalStatus.BUILDING):
            raise ValueError(f"Cannot cancel withdrawal in status {withdrawal.status}")

        withdrawal.status = WithdrawalStatus.CANCELLED

        # Refund the full amount
        await self.credit_balance(
            withdrawal.user_id, withdrawal.asset, withdrawal.amount
        )

        await self.session.flush()
        return withdrawal

    async def get_withdrawal_by_id(self, withdrawal_id: int) -> Optional[Withdrawal]:
        """Get withdrawal by ID."""
        stmt = select(Withdrawal).where(Withdrawal.id == withdrawal_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_withdrawals(
        self, user_id: int, limit: int = 20, offset: int = 0
    ) -> list[Withdrawal]:
        """Get withdrawal history for a user."""
        stmt = (
            select(Withdrawal)
            .where(Withdrawal.user_id == user_id)
            .order_by(Withdrawal.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_pending_withdrawals(self) -> list[Withdrawal]:
        """Get all pending withdrawals (for processing)."""
        stmt = (
            select(Withdrawal)
            .where(Withdrawal.status == WithdrawalStatus.PENDING)
            .order_by(Withdrawal.created_at)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_confirming_withdrawals(self) -> list[Withdrawal]:
        """Get all withdrawals waiting for confirmations."""
        stmt = (
            select(Withdrawal)
            .where(
                Withdrawal.status.in_([
                    WithdrawalStatus.BROADCAST,
                    WithdrawalStatus.CONFIRMING,
                ])
            )
            .order_by(Withdrawal.broadcast_at)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # Audit Log operations
    async def add_audit_log(
        self,
        user_id: int,
        asset: str,
        log_type: AuditLogType,
        amount: Decimal,
        balance_before: Decimal,
        balance_after: Decimal,
        reference_type: Optional[str] = None,
        reference_id: Optional[int] = None,
        description: Optional[str] = None,
        tx_hash: Optional[str] = None,
        metadata_json: Optional[str] = None,
        actor_type: str = "system",
        actor_id: Optional[str] = None,
    ) -> AuditLog:
        """Add an audit log entry for a balance change."""
        audit = AuditLog(
            user_id=user_id,
            asset=asset.upper(),
            log_type=log_type,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            reference_type=reference_type,
            reference_id=reference_id,
            description=description,
            tx_hash=tx_hash,
            metadata_json=metadata_json,
            actor_type=actor_type,
            actor_id=actor_id,
        )
        self.session.add(audit)
        await self.session.flush()
        return audit

    async def get_user_audit_logs(
        self, user_id: int, asset: Optional[str] = None, limit: int = 50
    ) -> list[AuditLog]:
        """Get audit logs for a user."""
        stmt = select(AuditLog).where(AuditLog.user_id == user_id)
        if asset:
            stmt = stmt.where(AuditLog.asset == asset.upper())
        stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_audit_logs_by_reference(
        self, reference_type: str, reference_id: int
    ) -> list[AuditLog]:
        """Get audit logs for a specific transaction."""
        stmt = (
            select(AuditLog)
            .where(
                AuditLog.reference_type == reference_type,
                AuditLog.reference_id == reference_id,
            )
            .order_by(AuditLog.created_at)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # Processed transaction helper for reconciliation
    async def record_processed_transaction(
        self,
        chain: str,
        tx_hash: str,
        tx_index: int,
        source: str,
        amount: Decimal,
        to_address: str,
        deposit_id: Optional[int] = None,
        raw_payload: Optional[str] = None,
    ) -> ProcessedTransaction:
        """Record a processed transaction (alias for mark_transaction_processed)."""
        return await self.mark_transaction_processed(
            chain=chain,
            tx_hash=tx_hash,
            amount=amount,
            to_address=to_address,
            source=source,
            tx_index=tx_index,
            deposit_id=deposit_id,
            raw_payload=raw_payload,
        )

    # Hot Wallet Balance tracking
    async def get_hot_wallet_balance(self, asset: str) -> Optional[HotWalletBalance]:
        """Get hot wallet balance record."""
        stmt = select(HotWalletBalance).where(HotWalletBalance.asset == asset.upper())
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_hot_wallet_balance(
        self,
        asset: str,
        address: str,
        expected_balance: Decimal,
        blockchain_balance: Optional[Decimal] = None,
    ) -> HotWalletBalance:
        """Update or create hot wallet balance record."""
        record = await self.get_hot_wallet_balance(asset)

        if record is None:
            record = HotWalletBalance(
                asset=asset.upper(),
                address=address,
                expected_balance=expected_balance,
            )
            self.session.add(record)
        else:
            record.expected_balance = expected_balance
            record.address = address

        if blockchain_balance is not None:
            record.last_blockchain_balance = blockchain_balance
            record.last_reconciled_at = datetime.utcnow()
            record.discrepancy = blockchain_balance - expected_balance

        await self.session.flush()
        return record

    # System Config operations
    async def get_config(self, key: str) -> Optional[str]:
        """Get a system config value."""
        stmt = select(SystemConfig).where(SystemConfig.key == key)
        result = await self.session.execute(stmt)
        config = result.scalar_one_or_none()
        return config.value if config else None

    async def set_config(
        self, key: str, value: str, description: Optional[str] = None, updated_by: Optional[str] = None
    ) -> SystemConfig:
        """Set a system config value."""
        stmt = select(SystemConfig).where(SystemConfig.key == key)
        result = await self.session.execute(stmt)
        config = result.scalar_one_or_none()

        if config is None:
            config = SystemConfig(
                key=key,
                value=value,
                description=description,
                updated_by=updated_by,
            )
            self.session.add(config)
        else:
            config.value = value
            if description:
                config.description = description
            config.updated_by = updated_by

        await self.session.flush()
        return config

    async def get_all_configs(self) -> list[SystemConfig]:
        """Get all system configs."""
        stmt = select(SystemConfig).order_by(SystemConfig.key)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # Admin operations
    async def get_all_users(self, limit: int = 100, offset: int = 0) -> list[User]:
        """Get all users (admin)."""
        stmt = select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_user_count(self) -> int:
        """Get total user count."""
        from sqlalchemy import func
        stmt = select(func.count(User.id))
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def get_total_balance_by_asset(self, asset: str) -> Decimal:
        """Get total balance across all users for an asset."""
        from sqlalchemy import func
        stmt = select(func.sum(Balance.amount)).where(Balance.asset == asset.upper())
        result = await self.session.execute(stmt)
        return result.scalar() or Decimal("0")
