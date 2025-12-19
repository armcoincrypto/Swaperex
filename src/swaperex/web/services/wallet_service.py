"""Wallet service for WalletConnect compatibility.

This service manages wallet sessions for WEB_NON_CUSTODIAL mode.
It provides a wallet abstraction that:
- Accepts address, chainId, provider
- NEVER accepts private keys or seed phrases
- Treats wallet as read-only + signer-proxy

SECURITY PRINCIPLES:
1. Backend NEVER holds private keys
2. Backend NEVER signs transactions
3. All signing requests are proxied to the client
4. Wallet connections are read-only from backend perspective
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from swaperex.config import get_settings, ExecutionMode
from swaperex.web.contracts.wallet import (
    WalletSession,
    WalletType,
    ChainConnection,
    ConnectWalletRequest,
    ConnectWalletResponse,
    SwitchChainRequest,
    SignatureRequest,
    WalletCapabilities,
)
from swaperex.web.services.chain_service import SUPPORTED_CHAINS

logger = logging.getLogger(__name__)


# In-memory session store (use Redis in production)
_wallet_sessions: dict[str, WalletSession] = {}


class WalletService:
    """Service for managing wallet connections in web mode.

    SECURITY: This service:
    - Only stores public wallet addresses
    - Never accesses or stores private keys
    - Proxies signing requests to the client
    - Treats all wallets as read-only from backend perspective
    """

    def _check_mode(self) -> None:
        """Warn if used in wrong mode."""
        settings = get_settings()
        if settings.mode == ExecutionMode.TELEGRAM_CUSTODIAL:
            logger.warning(
                "WalletService (web) called in TELEGRAM_CUSTODIAL mode. "
                "This service is designed for WEB_NON_CUSTODIAL mode."
            )

    def _log_security_event(self, event: str, address: str) -> None:
        """Log security-relevant events."""
        logger.info(
            "WALLET_SECURITY: %s | Address: %s | Mode: %s",
            event,
            address[:10] + "..." if len(address) > 10 else address,
            get_settings().mode.value,
        )

    async def connect_wallet(
        self,
        request: ConnectWalletRequest,
    ) -> ConnectWalletResponse:
        """Register a wallet session.

        SECURITY: This method ONLY accepts a public address.
        Private keys are NEVER accepted or stored.

        Args:
            request: Connection request with address and chain info

        Returns:
            ConnectWalletResponse with session info
        """
        self._check_mode()
        self._log_security_event("CONNECT_REQUEST", request.address)

        try:
            # Validate address format (already done by Pydantic, but be explicit)
            address = request.address.lower()
            if not address.startswith("0x") or len(address) != 42:
                return ConnectWalletResponse(
                    success=False,
                    error="Invalid address format",
                )

            # Get chain info
            chain_info = None
            chain_name = "ethereum"
            for name, info in SUPPORTED_CHAINS.items():
                if info.chain_id == request.chain_id:
                    chain_info = info
                    chain_name = name
                    break

            # Create chain connection
            connected_chains = [
                ChainConnection(
                    chain_id=request.chain_id,
                    chain_name=chain_name,
                    is_connected=True,
                )
            ]

            # Determine capabilities based on wallet type
            can_sign = request.wallet_type != WalletType.READONLY
            is_read_only = request.is_read_only or request.wallet_type == WalletType.READONLY

            # Create session
            session = WalletSession(
                address=request.address,  # Keep original case (checksummed)
                wallet_type=request.wallet_type,
                chain_id=request.chain_id,
                connected_chains=connected_chains,
                session_id=request.session_id or str(uuid.uuid4()),
                can_sign_messages=can_sign and not is_read_only,
                can_sign_transactions=can_sign and not is_read_only,
                can_sign_typed_data=can_sign and not is_read_only,
                is_read_only=is_read_only,
            )

            # Store session
            _wallet_sessions[address] = session

            self._log_security_event("CONNECT_SUCCESS", request.address)
            logger.info(
                "Wallet connected: %s (type=%s, chain=%d, read_only=%s)",
                request.address[:10] + "...",
                request.wallet_type,
                request.chain_id,
                is_read_only,
            )

            return ConnectWalletResponse(
                success=True,
                session=session,
            )

        except ValueError as e:
            self._log_security_event(f"CONNECT_REJECTED: {e}", request.address)
            return ConnectWalletResponse(
                success=False,
                error=str(e),
            )

        except Exception as e:
            logger.error(f"Wallet connection failed: {e}")
            return ConnectWalletResponse(
                success=False,
                error="Connection failed",
            )

    async def disconnect_wallet(self, address: str) -> bool:
        """Disconnect a wallet session.

        Args:
            address: Wallet address to disconnect

        Returns:
            True if disconnected, False if not found
        """
        self._log_security_event("DISCONNECT_REQUEST", address)

        address_lower = address.lower()
        if address_lower in _wallet_sessions:
            del _wallet_sessions[address_lower]
            self._log_security_event("DISCONNECT_SUCCESS", address)
            return True

        return False

    async def get_session(self, address: str) -> Optional[WalletSession]:
        """Get wallet session by address.

        Args:
            address: Wallet address

        Returns:
            WalletSession or None if not connected
        """
        return _wallet_sessions.get(address.lower())

    async def switch_chain(
        self,
        request: SwitchChainRequest,
    ) -> Optional[WalletSession]:
        """Switch active chain for a wallet session.

        Args:
            request: Chain switch request

        Returns:
            Updated session or None if not found
        """
        address_lower = request.address.lower()
        session = _wallet_sessions.get(address_lower)

        if not session:
            return None

        # Update chain ID
        session.chain_id = request.chain_id

        # Add new chain to connected chains if not present
        chain_name = "unknown"
        for name, info in SUPPORTED_CHAINS.items():
            if info.chain_id == request.chain_id:
                chain_name = name
                break

        chain_exists = any(
            c.chain_id == request.chain_id for c in session.connected_chains
        )
        if not chain_exists:
            session.connected_chains.append(
                ChainConnection(
                    chain_id=request.chain_id,
                    chain_name=chain_name,
                    is_connected=True,
                )
            )

        self._log_security_event(
            f"CHAIN_SWITCH: {request.chain_id}", request.address
        )

        return session

    async def create_signature_request(
        self,
        address: str,
        request_type: str,
        params: dict,
        unsigned_tx: Optional[dict] = None,
    ) -> Optional[SignatureRequest]:
        """Create a signature request for the client.

        The backend NEVER signs anything. This method creates a request
        that will be sent to the client for signing.

        Args:
            address: Wallet address
            request_type: Type of signature (personal_sign, eth_signTypedData_v4, etc.)
            params: Signature parameters
            unsigned_tx: Unsigned transaction data (for transaction signing)

        Returns:
            SignatureRequest for the client to sign
        """
        session = await self.get_session(address)

        if not session:
            logger.warning(f"Signature request for unknown wallet: {address[:10]}...")
            return None

        if session.is_read_only:
            logger.warning(
                f"Signature request for read-only wallet: {address[:10]}..."
            )
            return None

        request_id = str(uuid.uuid4())

        self._log_security_event(
            f"SIGN_REQUEST_CREATED: {request_type}", address
        )

        return SignatureRequest(
            request_id=request_id,
            type=request_type,
            params=params,
            unsigned_tx=unsigned_tx,
            message=f"Please sign this {request_type} request in your wallet",
        )

    def get_wallet_capabilities(
        self,
        wallet_type: WalletType,
        is_read_only: bool = False,
    ) -> WalletCapabilities:
        """Get capabilities for a wallet type.

        Args:
            wallet_type: Type of wallet
            is_read_only: Whether wallet is in read-only mode

        Returns:
            WalletCapabilities describing what the wallet can do
        """
        if is_read_only or wallet_type == WalletType.READONLY:
            return WalletCapabilities(
                can_query_balance=True,
                can_sign_messages=False,
                can_sign_transactions=False,
                can_sign_typed_data=False,
                can_batch_transactions=False,
                can_sponsor_gas=False,
                can_delegate=False,
                supported_chains=[1, 56, 137, 42161, 10],  # All EVM chains
            )

        if wallet_type == WalletType.WALLETCONNECT:
            return WalletCapabilities(
                can_query_balance=True,
                can_sign_messages=True,
                can_sign_transactions=True,
                can_sign_typed_data=True,
                can_batch_transactions=False,
                can_sponsor_gas=False,
                can_delegate=False,
                supported_chains=[1, 56, 137, 42161, 10],
            )

        if wallet_type == WalletType.INJECTED:
            return WalletCapabilities(
                can_query_balance=True,
                can_sign_messages=True,
                can_sign_transactions=True,
                can_sign_typed_data=True,
                can_batch_transactions=True,  # Some injected wallets support
                can_sponsor_gas=False,
                can_delegate=False,
                supported_chains=[1, 56, 137, 42161, 10],
            )

        if wallet_type == WalletType.HARDWARE:
            return WalletCapabilities(
                can_query_balance=True,
                can_sign_messages=True,
                can_sign_transactions=True,
                can_sign_typed_data=True,  # Most hardware wallets support EIP-712
                can_batch_transactions=False,
                can_sponsor_gas=False,
                can_delegate=False,
                supported_chains=[1, 56, 137],  # May have limited chain support
            )

        # Default capabilities
        return WalletCapabilities()

    def get_active_sessions(self) -> list[WalletSession]:
        """Get all active wallet sessions.

        Returns:
            List of active sessions
        """
        return list(_wallet_sessions.values())

    def clear_all_sessions(self) -> int:
        """Clear all wallet sessions.

        Returns:
            Number of sessions cleared
        """
        count = len(_wallet_sessions)
        _wallet_sessions.clear()
        logger.info(f"Cleared {count} wallet sessions")
        return count
