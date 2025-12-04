"""Initial schema with all current tables.

Revision ID: 001_initial
Revises:
Create Date: 2024-12-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('telegram_id', sa.BigInteger(), nullable=False),
        sa.Column('username', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('telegram_id')
    )
    op.create_index('ix_users_telegram_id', 'users', ['telegram_id'])

    # Balances table
    op.create_table(
        'balances',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('asset', sa.String(20), nullable=False),
        sa.Column('available', sa.Numeric(36, 18), nullable=False),
        sa.Column('locked', sa.Numeric(36, 18), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'asset', name='uq_user_asset')
    )

    # Deposits table
    op.create_table(
        'deposits',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('asset', sa.String(20), nullable=False),
        sa.Column('amount', sa.Numeric(36, 18), nullable=False),
        sa.Column('txid', sa.String(255), nullable=False),
        sa.Column('vout', sa.Integer(), nullable=True),
        sa.Column('address', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('confirmations', sa.Integer(), nullable=False, default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('txid', 'vout', name='uq_txid_vout')
    )
    op.create_index('ix_deposits_txid', 'deposits', ['txid'])
    op.create_index('ix_deposits_status', 'deposits', ['status'])

    # Deposit addresses table
    op.create_table(
        'deposit_addresses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('asset', sa.String(20), nullable=False),
        sa.Column('address', sa.String(255), nullable=False),
        sa.Column('derivation_index', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('address')
    )
    op.create_index('ix_deposit_addresses_address', 'deposit_addresses', ['address'])

    # Swaps table
    op.create_table(
        'swaps',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('client_ref', sa.String(100), nullable=True),
        sa.Column('from_asset', sa.String(20), nullable=False),
        sa.Column('to_asset', sa.String(20), nullable=False),
        sa.Column('from_amount', sa.Numeric(36, 18), nullable=False),
        sa.Column('to_amount', sa.Numeric(36, 18), nullable=True),
        sa.Column('expected_to_amount', sa.Numeric(36, 18), nullable=False),
        sa.Column('dest_address', sa.String(255), nullable=True),
        sa.Column('route', sa.String(50), nullable=False),
        sa.Column('route_details', sa.Text(), nullable=True),
        sa.Column('fee_asset', sa.String(20), nullable=False),
        sa.Column('fee_amount', sa.Numeric(36, 18), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('mm2_order_id', sa.String(100), nullable=True),
        sa.Column('inbound_txid', sa.String(255), nullable=True),
        sa.Column('outbound_txid', sa.String(255), nullable=True),
        sa.Column('vault_address', sa.String(255), nullable=True),
        sa.Column('memo', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('client_ref')
    )

    # Withdrawals table
    op.create_table(
        'withdrawals',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('asset', sa.String(20), nullable=False),
        sa.Column('amount', sa.Numeric(36, 18), nullable=False),
        sa.Column('fee', sa.Numeric(36, 18), nullable=False),
        sa.Column('destination_address', sa.String(255), nullable=False),
        sa.Column('txid', sa.String(255), nullable=True),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('confirmations', sa.Integer(), nullable=False, default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('broadcast_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_withdrawals_status', 'withdrawals', ['status'])


def downgrade() -> None:
    op.drop_table('withdrawals')
    op.drop_table('swaps')
    op.drop_table('deposit_addresses')
    op.drop_table('deposits')
    op.drop_table('balances')
    op.drop_table('users')
