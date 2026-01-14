"""Transaction API endpoints for non-custodial operations.

These endpoints prepare unsigned transactions for client-side signing.
NO signing or broadcasting happens server-side.
"""

from fastapi import APIRouter, HTTPException

from swaperex.web.contracts.transactions import (
    UnsignedTransaction,
    TransactionRequest,
)
from swaperex.web.services.transaction_builder import TransactionBuilder

router = APIRouter(prefix="/transactions", tags=["transactions"])

# Service instance
_tx_builder = TransactionBuilder()


@router.post("/build", response_model=UnsignedTransaction)
async def build_transaction(request: TransactionRequest) -> UnsignedTransaction:
    """Build an unsigned transaction for client-side signing.

    This endpoint prepares transaction data but does NOT sign or broadcast.
    The client must:
    1. Sign the returned transaction with their private key
    2. Broadcast to the network themselves

    Supported actions:
    - approve: ERC-20 token approval
    - transfer: Native or token transfer
    - swap: DEX swap (requires quote first)
    """
    try:
        return await _tx_builder.build_from_request(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))


@router.post("/approve", response_model=UnsignedTransaction)
async def build_approval(
    chain: str,
    token_address: str,
    spender: str,
    unlimited: bool = True,
) -> UnsignedTransaction:
    """Build a token approval transaction.

    Args:
        chain: Chain identifier (ethereum, bsc, etc.)
        token_address: Token contract to approve
        spender: Address to approve (usually DEX router)
        unlimited: If True, approve max amount

    Returns:
        Unsigned transaction for client to sign
    """
    try:
        amount = None if unlimited else 0
        return _tx_builder.build_approval(
            chain=chain,
            token_address=token_address,
            spender=spender,
            amount=amount,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
