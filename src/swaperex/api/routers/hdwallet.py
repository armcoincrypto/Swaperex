"""HD Wallet API endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from swaperex.config import get_settings
from swaperex.hdwallet import get_hd_wallet, get_supported_assets
from swaperex.ledger.database import get_db
from swaperex.ledger.repository import LedgerRepository

router = APIRouter(prefix="/api/v1/hd", tags=["HD Wallet"])


async def require_admin_token(x_admin_token: str = Header(None)) -> bool:
    """Verify admin token."""
    settings = get_settings()
    if settings.admin_token and x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    return True


# Request/Response models
class XpubRegisterRequest(BaseModel):
    """Request to register an xpub."""
    label: str
    xpub: str
    asset: str


class XpubRegisterResponse(BaseModel):
    """Response from xpub registration."""
    ok: bool
    label: str
    asset: str
    message: Optional[str] = None


class AddressRequest(BaseModel):
    """Request for address derivation."""
    user_id: Optional[int] = None
    telegram_id: Optional[int] = None


class AddressResponse(BaseModel):
    """Response with derived address."""
    user_id: int
    asset: str
    address: str
    derivation_path: Optional[str]
    derivation_index: int
    is_new: bool


class WalletInfoResponse(BaseModel):
    """HD wallet info."""
    asset: str
    wallet_type: str
    is_simulated: bool
    coin_type: int
    purpose: int
    testnet: bool
    has_xpub: bool


@router.get("/supported")
async def get_supported() -> dict:
    """Get list of supported HD wallet assets."""
    return {"assets": get_supported_assets()}


@router.get("/{asset}/info", response_model=WalletInfoResponse)
async def get_wallet_info(asset: str) -> WalletInfoResponse:
    """Get HD wallet info for an asset."""
    wallet = get_hd_wallet(asset)

    return WalletInfoResponse(
        asset=asset.upper(),
        wallet_type=type(wallet).__name__,
        is_simulated=type(wallet).__name__ == "SimulatedHDWallet",
        coin_type=wallet.coin_type,
        purpose=wallet.purpose,
        testnet=wallet.testnet,
        has_xpub=bool(wallet.xpub) and not wallet.xpub.startswith("sim_"),
    )


@router.post("/{asset}/xpub", response_model=XpubRegisterResponse)
async def register_xpub(
    asset: str,
    request: XpubRegisterRequest,
    _: bool = Depends(require_admin_token),
) -> XpubRegisterResponse:
    """Register an xpub for HD wallet derivation.

    NOTE: In production, xpubs should be configured via environment
    variables (XPUB_BTC, XPUB_ETH, etc.) rather than this endpoint.
    This endpoint is for testing/development convenience.
    """
    import os

    # Set environment variable (runtime only, not persisted)
    env_key = f"XPUB_{asset.upper()}"
    os.environ[env_key] = request.xpub

    # Reset wallet cache to pick up new xpub
    from swaperex.hdwallet.factory import reset_wallet_cache
    reset_wallet_cache()

    # Validate by trying to create wallet
    try:
        wallet = get_hd_wallet(asset)
        if hasattr(wallet, '_validate_xpub'):
            wallet._validate_xpub()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return XpubRegisterResponse(
        ok=True,
        label=request.label,
        asset=asset.upper(),
        message=f"Xpub registered for {asset.upper()} (runtime only)",
    )


@router.get("/{asset}/address", response_model=AddressResponse)
async def get_or_create_address(
    asset: str,
    user_id: Optional[int] = None,
    telegram_id: Optional[int] = None,
) -> AddressResponse:
    """Get or derive a deposit address for a user.

    Either user_id (internal) or telegram_id must be provided.
    """
    if not user_id and not telegram_id:
        raise HTTPException(
            status_code=400,
            detail="Either user_id or telegram_id must be provided",
        )

    async with get_db() as session:
        repo = LedgerRepository(session)

        # Get user
        if telegram_id:
            user = await repo.get_user_by_telegram_id(telegram_id)
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            user_id = user.id

        # Check for existing address
        existing = await repo.get_deposit_address(user_id, asset)

        if existing:
            return AddressResponse(
                user_id=user_id,
                asset=asset.upper(),
                address=existing.address,
                derivation_path=existing.derivation_path,
                derivation_index=existing.derivation_index or 0,
                is_new=False,
            )

        # Derive new address
        hd_wallet = get_hd_wallet(asset)
        index = await repo.get_next_hd_index(asset)
        addr_info = hd_wallet.derive_address(index)

        # Store address
        await repo.create_deposit_address(
            user_id=user_id,
            asset=asset,
            address=addr_info.address,
            derivation_path=addr_info.derivation_path,
            derivation_index=index,
        )

        return AddressResponse(
            user_id=user_id,
            asset=asset.upper(),
            address=addr_info.address,
            derivation_path=addr_info.derivation_path,
            derivation_index=index,
            is_new=True,
        )


@router.get("/{asset}/derive")
async def derive_address_at_index(
    asset: str,
    index: int,
    change: int = 0,
    _: bool = Depends(require_admin_token),
) -> dict:
    """Derive address at specific index (admin/debug).

    Does NOT store the address - just returns the derivation result.
    Useful for verifying deterministic derivation.
    """
    hd_wallet = get_hd_wallet(asset)
    addr_info = hd_wallet.derive_address(index, change)

    return {
        "asset": asset.upper(),
        "address": addr_info.address,
        "derivation_path": addr_info.derivation_path,
        "index": addr_info.index,
        "change": addr_info.change,
        "script_type": addr_info.script_type,
        "wallet_type": type(hd_wallet).__name__,
    }


@router.get("/{asset}/state")
async def get_wallet_state(
    asset: str,
    _: bool = Depends(require_admin_token),
) -> dict:
    """Get current HD wallet state (last index used)."""
    async with get_db() as session:
        repo = LedgerRepository(session)
        state = await repo.get_hd_wallet_state(asset)

        if not state:
            return {
                "asset": asset.upper(),
                "last_index": -1,
                "message": "No state yet (no addresses derived)",
            }

        return {
            "asset": asset.upper(),
            "last_index": state.last_index,
            "change": state.change,
            "updated_at": state.updated_at.isoformat() if state.updated_at else None,
        }
