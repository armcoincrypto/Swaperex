"""Wallet abstraction contracts for WalletConnect compatibility.

This module defines the wallet interface for WEB_NON_CUSTODIAL mode.
The wallet abstraction:
- Accepts address, chainId, provider
- NEVER accepts private keys or seed phrases
- Treats wallet as read-only + signer-proxy

All signing happens client-side via WalletConnect or similar.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class WalletType(str, Enum):
    """Supported wallet connection types."""

    WALLETCONNECT = "walletconnect"
    INJECTED = "injected"  # MetaMask, etc.
    READONLY = "readonly"  # View-only, no signing
    HARDWARE = "hardware"  # Ledger, Trezor via browser


class ChainConnection(BaseModel):
    """Connection info for a specific chain."""

    chain_id: int = Field(..., description="EVM chain ID")
    chain_name: str = Field(..., description="Chain name (ethereum, bsc, etc.)")
    rpc_url: Optional[str] = Field(
        None, description="Custom RPC URL (None = use default)"
    )
    is_connected: bool = Field(default=True, description="Whether chain is connected")


class WalletSession(BaseModel):
    """Wallet session for web mode.

    SECURITY: This model NEVER contains:
    - Private keys
    - Seed phrases / mnemonics
    - Any secret material

    The backend treats this as a READ-ONLY connection.
    All signing requests are proxied to the client.
    """

    # Identity
    address: str = Field(..., description="Wallet address (checksummed)")
    wallet_type: WalletType = Field(..., description="Type of wallet connection")

    # Chain info
    chain_id: int = Field(..., description="Current active chain ID")
    connected_chains: list[ChainConnection] = Field(
        default_factory=list, description="All connected chains"
    )

    # Session metadata
    session_id: Optional[str] = Field(
        None, description="WalletConnect session ID (if applicable)"
    )
    peer_metadata: Optional[dict] = Field(
        None, description="Connected wallet metadata (name, icons, etc.)"
    )

    # Capabilities
    can_sign_messages: bool = Field(
        default=True, description="Whether wallet can sign messages"
    )
    can_sign_transactions: bool = Field(
        default=True, description="Whether wallet can sign transactions"
    )
    can_sign_typed_data: bool = Field(
        default=True, description="Whether wallet supports EIP-712"
    )

    # Read-only flag
    is_read_only: bool = Field(
        default=False,
        description="If True, wallet is view-only (no signing capability)",
    )

    @field_validator("address")
    @classmethod
    def validate_address(cls, v: str) -> str:
        """Validate Ethereum address format."""
        if not v.startswith("0x") or len(v) != 42:
            raise ValueError("Invalid Ethereum address format")
        return v

    class Config:
        use_enum_values = True


class ConnectWalletRequest(BaseModel):
    """Request to register a wallet session.

    SECURITY: This request NEVER accepts private keys.
    It only registers an address for read-only queries and signing proxying.
    """

    address: str = Field(..., description="Wallet address to connect")
    chain_id: int = Field(default=1, description="Initial chain ID")
    wallet_type: WalletType = Field(
        default=WalletType.WALLETCONNECT, description="Wallet type"
    )
    session_id: Optional[str] = Field(
        None, description="WalletConnect session ID"
    )
    is_read_only: bool = Field(
        default=False, description="Connect in read-only mode"
    )

    @field_validator("address")
    @classmethod
    def validate_address(cls, v: str) -> str:
        """Ensure no private key material is passed."""
        # Address should be 42 chars (0x + 40 hex)
        if len(v) == 64 or len(v) == 66:
            # This looks like a private key, reject it
            raise ValueError(
                "SECURITY: Private keys must NEVER be sent to the backend. "
                "Only provide the public wallet address."
            )
        if not v.startswith("0x") or len(v) != 42:
            raise ValueError("Invalid Ethereum address format")
        return v


class ConnectWalletResponse(BaseModel):
    """Response after registering a wallet session."""

    success: bool = Field(..., description="Whether connection succeeded")
    session: Optional[WalletSession] = Field(
        None, description="Created wallet session"
    )
    error: Optional[str] = Field(None, description="Error message if failed")


class SwitchChainRequest(BaseModel):
    """Request to switch active chain for a wallet session."""

    address: str = Field(..., description="Wallet address")
    chain_id: int = Field(..., description="New chain ID to switch to")


class SignatureRequest(BaseModel):
    """Request structure for signing (proxied to client).

    This is returned to the client to sign locally.
    The backend NEVER signs transactions.
    """

    request_id: str = Field(..., description="Unique request ID")
    type: str = Field(
        ..., description="Request type: personal_sign, eth_signTypedData_v4, eth_sendTransaction"
    )
    params: dict = Field(..., description="Parameters for the signing request")

    # For transactions
    unsigned_tx: Optional[dict] = Field(
        None, description="Unsigned transaction data"
    )

    # Instructions for client
    message: str = Field(
        default="Please sign this request in your wallet",
        description="Human-readable message for the user",
    )


class SignatureResponse(BaseModel):
    """Response after client signs (submitted back to backend)."""

    request_id: str = Field(..., description="Original request ID")
    signature: Optional[str] = Field(
        None, description="Signature hex (for messages)"
    )
    signed_tx: Optional[str] = Field(
        None, description="Signed transaction hex (for transactions)"
    )
    tx_hash: Optional[str] = Field(
        None, description="Transaction hash if already broadcast"
    )
    error: Optional[str] = Field(None, description="Error if signing failed")


class WalletCapabilities(BaseModel):
    """Describes what operations a connected wallet can perform."""

    # Basic operations
    can_query_balance: bool = Field(default=True)
    can_sign_messages: bool = Field(default=True)
    can_sign_transactions: bool = Field(default=True)
    can_sign_typed_data: bool = Field(default=True)

    # Advanced operations
    can_batch_transactions: bool = Field(default=False)
    can_sponsor_gas: bool = Field(default=False)  # Account abstraction
    can_delegate: bool = Field(default=False)

    # Chain switching
    supported_chains: list[int] = Field(
        default_factory=lambda: [1, 56, 137],  # ETH, BSC, Polygon
        description="Supported chain IDs",
    )
