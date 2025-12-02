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

    Stores the xpub in the database (encrypted if MASTER_KEY is set).
    Also sets runtime environment variable for immediate use.
    """
    import os
    from swaperex.crypto import encrypt_xpub

    # Validate xpub format first
    try:
        wallet = get_hd_wallet(asset)
        # Temporarily set for validation
        os.environ[f"XPUB_{asset.upper()}"] = request.xpub
        from swaperex.hdwallet.factory import reset_wallet_cache
        reset_wallet_cache()
        wallet = get_hd_wallet(asset)
        if hasattr(wallet, '_validate_xpub'):
            wallet._validate_xpub()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Determine key type and testnet from prefix
    xpub = request.xpub
    key_type = "xpub"
    is_testnet = False
    if xpub.startswith("tpub") or xpub.startswith("vpub"):
        is_testnet = True
        key_type = xpub[:4]
    elif xpub.startswith("xpub") or xpub.startswith("zpub"):
        key_type = xpub[:4]

    # Encrypt xpub if MASTER_KEY is available
    encrypted = encrypt_xpub(xpub)
    xpub_to_store = encrypted if encrypted else xpub

    # Store in database
    async with get_db() as session:
        repo = LedgerRepository(session)
        await repo.store_xpub(
            asset=asset,
            encrypted_xpub=xpub_to_store,
            label=request.label,
            key_type=key_type,
            is_testnet=is_testnet,
        )

    persistence = "encrypted in DB" if encrypted else "stored in DB (unencrypted - set MASTER_KEY for encryption)"

    return XpubRegisterResponse(
        ok=True,
        label=request.label,
        asset=asset.upper(),
        message=f"Xpub registered for {asset.upper()} ({persistence})",
    )


@router.get("/{asset}/xpub")
async def get_stored_xpub(
    asset: str,
    _: bool = Depends(require_admin_token),
) -> dict:
    """Get stored xpub info (admin only, xpub value is masked)."""
    async with get_db() as session:
        repo = LedgerRepository(session)
        xpub_record = await repo.get_xpub(asset)

        if not xpub_record:
            raise HTTPException(status_code=404, detail=f"No xpub stored for {asset}")

        return {
            "asset": xpub_record.asset,
            "label": xpub_record.label,
            "key_type": xpub_record.key_type,
            "is_testnet": xpub_record.is_testnet,
            "is_encrypted": xpub_record.encrypted_xpub.startswith("gAAAAA"),  # Fernet prefix
            "created_at": xpub_record.created_at.isoformat(),
        }


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
