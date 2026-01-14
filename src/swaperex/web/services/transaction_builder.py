"""Transaction builder for preparing unsigned transactions.

This service builds unsigned transactions for client-side signing.
NO signing or broadcasting happens here - this is non-custodial.
"""

import logging
from decimal import Decimal
from typing import Optional

from swaperex.web.contracts.transactions import (
    UnsignedTransaction,
    TransactionRequest,
)
from swaperex.web.services.chain_service import SUPPORTED_CHAINS

logger = logging.getLogger(__name__)


# ERC-20 ABI fragments (minimal for transfers and approvals)
ERC20_TRANSFER_SELECTOR = "0xa9059cbb"  # transfer(address,uint256)
ERC20_APPROVE_SELECTOR = "0x095ea7b3"  # approve(address,uint256)

# Common DEX router addresses
DEX_ROUTERS = {
    "ethereum": {
        "uniswap_v2": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        "uniswap_v3": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        "1inch": "0x111111125421cA6dc452d289314280a0f8842A65",
    },
    "bsc": {
        "pancakeswap": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
        "1inch": "0x111111125421cA6dc452d289314280a0f8842A65",
    },
    "polygon": {
        "quickswap": "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
        "1inch": "0x111111125421cA6dc452d289314280a0f8842A65",
    },
}


class TransactionBuilder:
    """Builds unsigned transactions for client-side signing.

    This service NEVER:
    - Accesses private keys
    - Signs transactions
    - Broadcasts transactions

    It ONLY prepares transaction data for the client to sign locally.
    """

    def build_approval(
        self,
        chain: str,
        token_address: str,
        spender: str,
        amount: Optional[int] = None,
    ) -> UnsignedTransaction:
        """Build an ERC-20 approval transaction.

        Args:
            chain: Chain identifier
            token_address: Token contract address
            spender: Address to approve (usually DEX router)
            amount: Amount to approve (None = unlimited)

        Returns:
            UnsignedTransaction for client to sign
        """
        chain_info = SUPPORTED_CHAINS.get(chain.lower())
        if not chain_info:
            raise ValueError(f"Unsupported chain: {chain}")

        # Build approval data
        # approve(address spender, uint256 amount)
        if amount is None:
            amount = 2**256 - 1  # Max uint256 for unlimited approval

        # Encode function call
        spender_padded = spender.lower().replace("0x", "").zfill(64)
        amount_hex = hex(amount)[2:].zfill(64)
        data = f"{ERC20_APPROVE_SELECTOR}{spender_padded}{amount_hex}"

        return UnsignedTransaction(
            chain=chain,
            chain_id=chain_info.chain_id,
            to=token_address,
            value="0",
            data=data,
            description=f"Approve {spender[:10]}... to spend tokens",
            warnings=["This approves token spending. Review carefully."],
        )

    def build_native_transfer(
        self,
        chain: str,
        to_address: str,
        amount_wei: int,
    ) -> UnsignedTransaction:
        """Build a native token transfer (ETH, BNB, etc.).

        Args:
            chain: Chain identifier
            to_address: Recipient address
            amount_wei: Amount in wei

        Returns:
            UnsignedTransaction for client to sign
        """
        chain_info = SUPPORTED_CHAINS.get(chain.lower())
        if not chain_info:
            raise ValueError(f"Unsupported chain: {chain}")

        return UnsignedTransaction(
            chain=chain,
            chain_id=chain_info.chain_id,
            to=to_address,
            value=hex(amount_wei),
            data="0x",
            description=f"Transfer {chain_info.native_asset} to {to_address[:10]}...",
        )

    def build_token_transfer(
        self,
        chain: str,
        token_address: str,
        to_address: str,
        amount: int,
    ) -> UnsignedTransaction:
        """Build an ERC-20 token transfer.

        Args:
            chain: Chain identifier
            token_address: Token contract address
            to_address: Recipient address
            amount: Amount in token units (with decimals)

        Returns:
            UnsignedTransaction for client to sign
        """
        chain_info = SUPPORTED_CHAINS.get(chain.lower())
        if not chain_info:
            raise ValueError(f"Unsupported chain: {chain}")

        # Encode transfer(address to, uint256 amount)
        to_padded = to_address.lower().replace("0x", "").zfill(64)
        amount_hex = hex(amount)[2:].zfill(64)
        data = f"{ERC20_TRANSFER_SELECTOR}{to_padded}{amount_hex}"

        return UnsignedTransaction(
            chain=chain,
            chain_id=chain_info.chain_id,
            to=token_address,
            value="0",
            data=data,
            description=f"Transfer tokens to {to_address[:10]}...",
        )

    async def build_from_request(
        self,
        request: TransactionRequest,
    ) -> UnsignedTransaction:
        """Build an unsigned transaction from a request.

        Args:
            request: TransactionRequest with action details

        Returns:
            UnsignedTransaction for client to sign

        Raises:
            ValueError: If request is invalid
        """
        action = request.action.lower()

        if action == "approve":
            if not request.token or not request.spender:
                raise ValueError("approve requires token and spender")
            return self.build_approval(
                chain=request.chain,
                token_address=request.token,
                spender=request.spender,
            )

        elif action == "transfer":
            if not request.to_address or not request.amount:
                raise ValueError("transfer requires to_address and amount")

            # Determine if native or token transfer
            if request.token:
                # Token transfer
                amount_int = int(request.amount * Decimal(10**18))  # Assume 18 decimals
                return self.build_token_transfer(
                    chain=request.chain,
                    token_address=request.token,
                    to_address=request.to_address,
                    amount=amount_int,
                )
            else:
                # Native transfer
                amount_wei = int(request.amount * Decimal(10**18))
                return self.build_native_transfer(
                    chain=request.chain,
                    to_address=request.to_address,
                    amount_wei=amount_wei,
                )

        elif action == "swap":
            # For swaps, would typically call 1inch API to get swap data
            # Here we just return a placeholder showing the concept
            raise NotImplementedError(
                "Swap transaction building requires integration with DEX aggregator. "
                "Use quote endpoint first, then request swap data from aggregator."
            )

        else:
            raise ValueError(f"Unknown action: {action}")
