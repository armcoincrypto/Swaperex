"""Deposit webhook endpoints.

Receives notifications from blockchain providers (e.g., Blockstream, Etherscan)
and processes deposits idempotently.
"""

import hashlib
import hmac
import json
import logging
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from swaperex.config import get_settings
from swaperex.ledger.database import get_db
from swaperex.ledger.models import DepositStatus
from swaperex.ledger.repository import LedgerRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["Webhooks"])


class DepositWebhookPayload(BaseModel):
    """Generic deposit webhook payload.

    Providers should adapt their payloads to this format,
    or we parse provider-specific formats in handlers.
    """
    chain: str  # BTC, ETH, TRX, etc.
    tx_hash: str
    to_address: str
    amount: str  # Decimal as string
    confirmations: int = 0
    from_address: Optional[str] = None
    block_height: Optional[int] = None
    tx_index: int = 0  # For multi-output transactions


class WebhookResponse(BaseModel):
    """Webhook response."""
    success: bool
    message: str
    deposit_id: Optional[int] = None


def verify_webhook_signature(
    payload: bytes,
    signature: str,
    secret: str,
    algorithm: str = "sha256",
) -> bool:
    """Verify webhook signature using HMAC.

    Args:
        payload: Raw request body
        signature: Signature from header (hex or base64)
        secret: Webhook secret key
        algorithm: Hash algorithm (sha256, sha512)

    Returns:
        True if signature is valid
    """
    if not secret:
        return True  # Skip verification if no secret configured

    # Remove any prefix like "sha256="
    if "=" in signature:
        signature = signature.split("=", 1)[1]

    # Compute expected signature
    mac = hmac.new(
        secret.encode(),
        payload,
        getattr(hashlib, algorithm),
    )
    expected = mac.hexdigest()

    return hmac.compare_digest(expected, signature.lower())


@router.post("/deposit", response_model=WebhookResponse)
async def handle_deposit_webhook(
    request: Request,
    payload: DepositWebhookPayload,
    x_webhook_signature: Optional[str] = Header(None),
) -> WebhookResponse:
    """Handle incoming deposit webhook.

    This endpoint:
    1. Verifies the webhook signature (if configured)
    2. Checks if transaction was already processed (idempotency)
    3. Finds the user by deposit address
    4. Creates deposit record and credits balance
    5. Logs raw payload for audit

    Provider integrations should send data to this endpoint.
    """
    settings = get_settings()

    # Verify signature if webhook secret is configured
    webhook_secret = settings.deposit_webhook_secret if hasattr(settings, 'deposit_webhook_secret') else None
    if webhook_secret and x_webhook_signature:
        body = await request.body()
        if not verify_webhook_signature(body, x_webhook_signature, webhook_secret):
            logger.warning(f"Invalid webhook signature for tx {payload.tx_hash}")
            raise HTTPException(status_code=401, detail="Invalid signature")

    async with get_db() as session:
        repo = LedgerRepository(session)

        # Check idempotency - was this transaction already processed?
        if await repo.is_transaction_processed(
            chain=payload.chain,
            tx_hash=payload.tx_hash,
            tx_index=payload.tx_index,
        ):
            logger.info(f"Transaction {payload.tx_hash} already processed, skipping")
            existing = await repo.get_processed_transaction(
                payload.chain, payload.tx_hash, payload.tx_index
            )
            return WebhookResponse(
                success=True,
                message="Transaction already processed",
                deposit_id=existing.deposit_id if existing else None,
            )

        # Find user by deposit address
        addr_record = await repo.get_deposit_address_record(payload.to_address)
        if not addr_record:
            logger.warning(f"Unknown deposit address: {payload.to_address}")
            # Still mark as processed to prevent repeated lookups
            await repo.mark_transaction_processed(
                chain=payload.chain,
                tx_hash=payload.tx_hash,
                amount=Decimal(payload.amount),
                to_address=payload.to_address,
                source="webhook",
                tx_index=payload.tx_index,
                raw_payload=json.dumps(payload.model_dump()),
            )
            return WebhookResponse(
                success=False,
                message="Unknown deposit address",
            )

        user_id = addr_record.user_id
        asset = addr_record.asset
        amount = Decimal(payload.amount)

        # Determine minimum confirmations required
        min_confirmations = {
            "BTC": 2,
            "ETH": 12,
            "TRX": 19,
            "LTC": 6,
        }.get(payload.chain.upper(), 2)

        # Determine deposit status based on confirmations
        if payload.confirmations >= min_confirmations:
            status = DepositStatus.CONFIRMED
        else:
            status = DepositStatus.PENDING

        # Create deposit record
        deposit = await repo.create_deposit(
            user_id=user_id,
            asset=asset,
            amount=amount,
            to_address=payload.to_address,
            tx_hash=payload.tx_hash,
            from_address=payload.from_address,
            status=status,
        )

        # If confirmed, credit balance
        if status == DepositStatus.CONFIRMED:
            await repo.credit_balance(user_id, asset, amount)
            logger.info(f"Deposit confirmed: {amount} {asset} to user {user_id}")

        # Mark transaction as processed
        await repo.mark_transaction_processed(
            chain=payload.chain,
            tx_hash=payload.tx_hash,
            amount=amount,
            to_address=payload.to_address,
            source="webhook",
            tx_index=payload.tx_index,
            deposit_id=deposit.id,
            raw_payload=json.dumps(payload.model_dump()),
        )

        # Send notification to user (async, don't wait)
        # This could be done via a background task queue
        if status == DepositStatus.CONFIRMED:
            # TODO: Send Telegram notification
            pass

        return WebhookResponse(
            success=True,
            message=f"Deposit {'confirmed' if status == DepositStatus.CONFIRMED else 'pending'}",
            deposit_id=deposit.id,
        )


@router.post("/deposit/confirm/{tx_hash}")
async def confirm_deposit_manual(
    tx_hash: str,
    x_admin_token: str = Header(None),
) -> WebhookResponse:
    """Manually confirm a pending deposit (admin only).

    Use this to confirm deposits that haven't received enough confirmations
    via the normal webhook flow.
    """
    settings = get_settings()
    if settings.admin_token and x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")

    async with get_db() as session:
        repo = LedgerRepository(session)

        deposit = await repo.get_deposit_by_txid(tx_hash)
        if not deposit:
            raise HTTPException(status_code=404, detail="Deposit not found")

        if deposit.status == DepositStatus.CONFIRMED:
            return WebhookResponse(
                success=True,
                message="Deposit already confirmed",
                deposit_id=deposit.id,
            )

        # Confirm and credit
        await repo.confirm_deposit(deposit.id)

        return WebhookResponse(
            success=True,
            message="Deposit confirmed manually",
            deposit_id=deposit.id,
        )


# Provider-specific webhook handlers

@router.post("/blockstream")
async def handle_blockstream_webhook(request: Request) -> WebhookResponse:
    """Handle Blockstream webhook (BTC/LTC).

    Blockstream sends transaction notifications when a watched address
    receives funds.
    """
    body = await request.json()

    # Parse Blockstream format
    # Example: {"txid": "...", "vout": [...], "status": {"confirmed": true}}
    tx_hash = body.get("txid")
    status = body.get("status", {})
    confirmed = status.get("confirmed", False)
    block_height = status.get("block_height")

    # Find outputs to our addresses
    for i, vout in enumerate(body.get("vout", [])):
        address = vout.get("scriptpubkey_address")
        value_sats = vout.get("value", 0)

        if address and value_sats > 0:
            # Convert satoshis to BTC
            amount = Decimal(value_sats) / Decimal("100000000")

            payload = DepositWebhookPayload(
                chain="BTC",
                tx_hash=tx_hash,
                to_address=address,
                amount=str(amount),
                confirmations=1 if confirmed else 0,
                block_height=block_height,
                tx_index=i,
            )

            return await handle_deposit_webhook(request, payload, None)

    return WebhookResponse(success=False, message="No relevant outputs found")


@router.post("/etherscan")
async def handle_etherscan_webhook(request: Request) -> WebhookResponse:
    """Handle Etherscan webhook (ETH/ERC20).

    Etherscan sends notifications for address activity.
    """
    body = await request.json()

    # Parse Etherscan format
    tx_hash = body.get("hash")
    to_address = body.get("to")
    value_wei = int(body.get("value", "0"))
    confirmations = int(body.get("confirmations", "0"))

    if not tx_hash or not to_address:
        return WebhookResponse(success=False, message="Invalid payload")

    # Convert wei to ETH
    amount = Decimal(value_wei) / Decimal("1000000000000000000")

    payload = DepositWebhookPayload(
        chain="ETH",
        tx_hash=tx_hash,
        to_address=to_address,
        amount=str(amount),
        confirmations=confirmations,
        from_address=body.get("from"),
    )

    return await handle_deposit_webhook(request, payload, None)


@router.post("/trongrid")
async def handle_trongrid_webhook(request: Request) -> WebhookResponse:
    """Handle TronGrid webhook (TRX/TRC20).

    TronGrid sends notifications for TRX transactions.
    """
    body = await request.json()

    # Parse TronGrid format
    tx_hash = body.get("transaction_id") or body.get("txID")
    to_address = body.get("to_address")
    raw_data = body.get("raw_data", {})
    contract = raw_data.get("contract", [{}])[0]
    value = contract.get("parameter", {}).get("value", {})

    amount_sun = value.get("amount", 0)
    confirmations = body.get("confirmations", 0)

    if not tx_hash or not to_address:
        return WebhookResponse(success=False, message="Invalid payload")

    # Convert SUN to TRX
    amount = Decimal(amount_sun) / Decimal("1000000")

    payload = DepositWebhookPayload(
        chain="TRX",
        tx_hash=tx_hash,
        to_address=to_address,
        amount=str(amount),
        confirmations=confirmations,
        from_address=value.get("owner_address"),
    )

    return await handle_deposit_webhook(request, payload, None)
