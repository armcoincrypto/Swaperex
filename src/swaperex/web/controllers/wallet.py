"""Wallet connection API endpoints for non-custodial web mode.

These endpoints manage wallet sessions for WalletConnect and similar
wallet connection protocols.

SECURITY: These endpoints:
- NEVER accept private keys or seed phrases
- Only store public wallet addresses
- Proxy signing requests to the client
- Treat all wallets as read-only from backend perspective
"""

import logging

from fastapi import APIRouter, HTTPException

from swaperex.config import get_settings, ExecutionMode
from swaperex.web.contracts.wallet import (
    ConnectWalletRequest,
    ConnectWalletResponse,
    SwitchChainRequest,
    WalletSession,
    WalletCapabilities,
    WalletType,
)
from swaperex.web.services.wallet_service import WalletService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wallet", tags=["wallet"])

# Service instance
_wallet_service = WalletService()


@router.post("/connect", response_model=ConnectWalletResponse)
async def connect_wallet(request: ConnectWalletRequest) -> ConnectWalletResponse:
    """Connect a wallet session.

    SECURITY: This endpoint NEVER accepts private keys.
    It only registers a public wallet address for:
    - Balance queries
    - Transaction building (unsigned)
    - Signing request proxying

    All signing happens client-side. The backend is wallet-agnostic.

    Args:
        request: Wallet connection request with address and chain info

    Returns:
        ConnectWalletResponse with session info
    """
    settings = get_settings()

    if settings.mode != ExecutionMode.WEB_NON_CUSTODIAL:
        logger.warning(
            "Wallet connect called in %s mode. This endpoint is designed for web mode.",
            settings.mode.value,
        )

    logger.info(
        "Wallet connect request: %s (type=%s)",
        request.address[:10] + "...",
        request.wallet_type,
    )

    return await _wallet_service.connect_wallet(request)


@router.post("/disconnect")
async def disconnect_wallet(address: str) -> dict:
    """Disconnect a wallet session.

    Args:
        address: Wallet address to disconnect

    Returns:
        Success status
    """
    success = await _wallet_service.disconnect_wallet(address)

    if not success:
        raise HTTPException(status_code=404, detail="Wallet session not found")

    return {
        "success": True,
        "message": "Wallet disconnected",
        "address": address,
    }


@router.get("/session/{address}", response_model=WalletSession)
async def get_session(address: str) -> WalletSession:
    """Get wallet session info.

    Args:
        address: Wallet address

    Returns:
        WalletSession with connection info
    """
    session = await _wallet_service.get_session(address)

    if not session:
        raise HTTPException(status_code=404, detail="Wallet session not found")

    return session


@router.post("/switch-chain")
async def switch_chain(request: SwitchChainRequest) -> dict:
    """Switch active chain for a wallet session.

    Args:
        request: Chain switch request

    Returns:
        Updated session info
    """
    session = await _wallet_service.switch_chain(request)

    if not session:
        raise HTTPException(status_code=404, detail="Wallet session not found")

    return {
        "success": True,
        "address": session.address,
        "chain_id": session.chain_id,
        "connected_chains": [c.chain_id for c in session.connected_chains],
    }


@router.get("/capabilities/{wallet_type}")
async def get_capabilities(
    wallet_type: str,
    read_only: bool = False,
) -> WalletCapabilities:
    """Get capabilities for a wallet type.

    Args:
        wallet_type: Type of wallet (walletconnect, injected, readonly, hardware)
        read_only: Whether wallet is in read-only mode

    Returns:
        WalletCapabilities describing what the wallet can do
    """
    try:
        wt = WalletType(wallet_type.lower())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown wallet type: {wallet_type}. "
            f"Valid types: {[t.value for t in WalletType]}",
        )

    return _wallet_service.get_wallet_capabilities(wt, read_only)


@router.get("/sessions")
async def list_sessions() -> dict:
    """List all active wallet sessions.

    Returns:
        List of active sessions (for debugging)
    """
    sessions = _wallet_service.get_active_sessions()

    return {
        "count": len(sessions),
        "sessions": [
            {
                "address": s.address,
                "chain_id": s.chain_id,
                "wallet_type": s.wallet_type,
                "is_read_only": s.is_read_only,
            }
            for s in sessions
        ],
    }


@router.get("/security-info")
async def wallet_security_info() -> dict:
    """Get security information about wallet handling.

    This endpoint explains the security model for wallet connections.
    """
    settings = get_settings()

    return {
        "mode": settings.mode.value,
        "security_model": {
            "private_keys": "NEVER stored or transmitted to backend",
            "signing": "ALWAYS happens client-side",
            "backend_role": "Read-only queries + transaction building",
            "wallet_sessions": "Store only public addresses",
        },
        "guarantees": [
            "Backend cannot sign transactions",
            "Backend cannot access wallet funds",
            "Backend cannot broadcast transactions without client approval",
            "All signing requests are proxied to client",
        ],
        "wallet_connect_flow": [
            "1. Client connects via WalletConnect or injected wallet",
            "2. Backend receives only public address",
            "3. Backend builds unsigned transactions",
            "4. Client signs in their wallet",
            "5. Client broadcasts to network",
        ],
        "rejected_inputs": [
            "Private keys (64 or 66 char hex strings)",
            "Seed phrases / mnemonics",
            "Keystore files",
            "Any secret material",
        ],
    }
