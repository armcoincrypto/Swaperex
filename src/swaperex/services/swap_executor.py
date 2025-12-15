"""Real on-chain swap execution service.

Executes swaps on-chain by signing and broadcasting transactions.
Supports EVM chains via 1inch DEX aggregator.
"""

import logging
import os
from decimal import Decimal
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# RPC endpoints for different chains
RPC_ENDPOINTS = {
    "bsc": "https://bsc-dataseed.binance.org/",
    "ethereum": "https://eth.llamarpc.com",
    "polygon": "https://polygon-rpc.com/",
    "avalanche": "https://api.avax.network/ext/bc/C/rpc",
}

# Chain IDs
CHAIN_IDS = {
    "bsc": 56,
    "ethereum": 1,
    "polygon": 137,
    "avalanche": 43114,
}

# 1inch router addresses (v6)
ONEINCH_ROUTER = {
    "bsc": "0x111111125421cA6dc452d289314280a0f8842A65",
    "ethereum": "0x111111125421cA6dc452d289314280a0f8842A65",
    "polygon": "0x111111125421cA6dc452d289314280a0f8842A65",
    "avalanche": "0x111111125421cA6dc452d289314280a0f8842A65",
}

# 1inch API
ONEINCH_API = "https://api.1inch.dev/swap/v6.0"

# Native token address (used by 1inch for native swaps)
NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"


class SwapExecutionResult:
    """Result of swap execution."""

    def __init__(
        self,
        success: bool,
        txid: Optional[str] = None,
        error: Optional[str] = None,
        from_amount: Optional[str] = None,
        to_amount: Optional[str] = None,
        gas_used: Optional[int] = None,
    ):
        self.success = success
        self.txid = txid
        self.error = error
        self.from_amount = from_amount
        self.to_amount = to_amount
        self.gas_used = gas_used


async def get_private_key_from_seed(chain: str = "bsc") -> Optional[bytes]:
    """Derive private key from seed phrase for the given chain.

    Args:
        chain: Chain name (bsc, ethereum, etc.)

    Returns:
        Private key bytes or None
    """
    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        logger.error("No seed phrase found in environment")
        return None

    try:
        from bip_utils import Bip39SeedGenerator, Bip32Secp256k1

        # Generate seed from mnemonic
        seed = Bip39SeedGenerator(seed_phrase).Generate()

        # Use BIP32 for EVM chains (coin_type 60)
        bip32_ctx = Bip32Secp256k1.FromSeed(seed)

        # Standard path: m/44'/60'/0'/0/0
        # All EVM chains use coin_type 60
        path = "44'/60'/0'/0/0"
        account_ctx = bip32_ctx.DerivePath(path)

        return account_ctx.PrivateKey().Raw().ToBytes()

    except ImportError:
        logger.error("bip_utils not installed")
        return None
    except Exception as e:
        logger.error(f"Failed to derive private key: {e}")
        return None


async def get_wallet_address(chain: str = "bsc") -> Optional[str]:
    """Get wallet address for the given chain.

    Args:
        chain: Chain name

    Returns:
        Wallet address or None
    """
    private_key = await get_private_key_from_seed(chain)
    if not private_key:
        return None

    try:
        from eth_account import Account

        account = Account.from_key(private_key)
        return account.address
    except ImportError:
        logger.error("eth_account not installed")
        return None


async def check_and_approve_token(
    token_address: str,
    spender_address: str,
    amount_wei: int,
    chain: str = "bsc",
) -> Optional[str]:
    """Check token allowance and approve if needed.

    Args:
        token_address: ERC20 token contract address
        spender_address: Address to approve (1inch router)
        amount_wei: Amount to approve in wei
        chain: Chain name

    Returns:
        Approval txid if approval was needed, None otherwise
    """
    # Skip approval for native token
    if token_address.lower() == NATIVE_TOKEN.lower():
        return None

    private_key = await get_private_key_from_seed(chain)
    if not private_key:
        return None

    try:
        from eth_account import Account
        from web3 import Web3

        account = Account.from_key(private_key)
        rpc_url = RPC_ENDPOINTS.get(chain, RPC_ENDPOINTS["bsc"])
        chain_id = CHAIN_IDS.get(chain, 56)

        # Check current allowance
        allowance = await _get_allowance(
            token_address, account.address, spender_address, rpc_url
        )

        if allowance >= amount_wei:
            logger.info(f"Token already approved: allowance={allowance}")
            return None

        logger.info(f"Approving token: {token_address} for {spender_address}")

        # Build approve transaction
        # approve(address spender, uint256 amount)
        approve_data = (
            "0x095ea7b3"  # approve function selector
            + spender_address[2:].zfill(64)  # spender address padded to 32 bytes
            + hex(2**256 - 1)[2:].zfill(64)  # max uint256 (unlimited approval)
        )

        # Get nonce and gas price
        nonce = await _get_nonce(account.address, rpc_url)
        gas_price = await _get_gas_price(rpc_url)

        tx = {
            "nonce": nonce,
            "gasPrice": gas_price,
            "gas": 100000,  # Standard approval gas
            "to": Web3.to_checksum_address(token_address),
            "value": 0,
            "data": approve_data,
            "chainId": chain_id,
        }

        # Sign and broadcast
        signed_tx = account.sign_transaction(tx)
        txid = await _broadcast_transaction(signed_tx.raw_transaction.hex(), rpc_url)

        if txid:
            logger.info(f"Approval tx broadcast: {txid}")
            # Wait for confirmation
            await _wait_for_confirmation(txid, rpc_url)

        return txid

    except Exception as e:
        logger.error(f"Token approval failed: {e}")
        return None


async def _get_allowance(
    token_address: str,
    owner: str,
    spender: str,
    rpc_url: str,
) -> int:
    """Get token allowance."""
    # allowance(address owner, address spender) -> uint256
    data = (
        "0xdd62ed3e"  # allowance function selector
        + owner[2:].lower().zfill(64)
        + spender[2:].lower().zfill(64)
    )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "eth_call",
                    "params": [{"to": token_address, "data": data}, "latest"],
                    "id": 1,
                },
            )

            if response.status_code == 200:
                result = response.json()
                if "result" in result and result["result"] != "0x":
                    return int(result["result"], 16)
    except Exception as e:
        logger.error(f"Failed to get allowance: {e}")

    return 0


async def _get_nonce(address: str, rpc_url: str) -> int:
    """Get transaction count (nonce)."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "eth_getTransactionCount",
                    "params": [address, "pending"],
                    "id": 1,
                },
            )

            if response.status_code == 200:
                data = response.json()
                return int(data.get("result", "0x0"), 16)
    except Exception as e:
        logger.error(f"Failed to get nonce: {e}")

    return 0


async def _get_gas_price(rpc_url: str) -> int:
    """Get current gas price in wei."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "eth_gasPrice",
                    "params": [],
                    "id": 1,
                },
            )

            if response.status_code == 200:
                data = response.json()
                return int(data.get("result", "0x0"), 16)
    except Exception as e:
        logger.error(f"Failed to get gas price: {e}")

    # Fallback: 5 gwei for BSC, 30 gwei for others
    return 5 * 10**9


async def _broadcast_transaction(raw_tx_hex: str, rpc_url: str) -> Optional[str]:
    """Broadcast raw transaction to network."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "eth_sendRawTransaction",
                    "params": [
                        f"0x{raw_tx_hex}"
                        if not raw_tx_hex.startswith("0x")
                        else raw_tx_hex
                    ],
                    "id": 1,
                },
            )

            if response.status_code == 200:
                data = response.json()
                if "result" in data:
                    return data["result"]
                elif "error" in data:
                    logger.error(f"Broadcast error: {data['error']}")
    except Exception as e:
        logger.error(f"Failed to broadcast tx: {e}")

    return None


async def _wait_for_confirmation(txid: str, rpc_url: str, timeout: int = 60) -> bool:
    """Wait for transaction confirmation."""
    import asyncio

    for _ in range(timeout // 2):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    rpc_url,
                    json={
                        "jsonrpc": "2.0",
                        "method": "eth_getTransactionReceipt",
                        "params": [txid],
                        "id": 1,
                    },
                )

                if response.status_code == 200:
                    data = response.json()
                    result = data.get("result")
                    if result is not None:
                        status = int(result.get("status", "0x0"), 16)
                        return status == 1
        except Exception:
            pass

        await asyncio.sleep(2)

    return False


async def execute_1inch_swap(
    from_token: str,
    to_token: str,
    amount: Decimal,
    chain: str = "bsc",
    slippage: Decimal = Decimal("1"),
    from_symbol: str = "",
    to_symbol: str = "",
) -> SwapExecutionResult:
    """Execute a swap using 1inch DEX aggregator.

    Args:
        from_token: Source token contract address
        to_token: Destination token contract address
        amount: Amount to swap in human-readable units
        chain: Chain name (bsc, ethereum, polygon, avalanche)
        slippage: Slippage tolerance in percent
        from_symbol: Source token symbol (for decimals detection)
        to_symbol: Destination token symbol (for decimals detection)

    Returns:
        SwapExecutionResult with transaction details
    """
    api_key = os.environ.get("ONEINCH_API_KEY")
    if not api_key:
        return SwapExecutionResult(success=False, error="No 1inch API key configured")

    private_key = await get_private_key_from_seed(chain)
    if not private_key:
        return SwapExecutionResult(success=False, error="No private key available")

    try:
        from eth_account import Account
        from web3 import Web3

        account = Account.from_key(private_key)
        wallet_address = account.address

        rpc_url = RPC_ENDPOINTS.get(chain, RPC_ENDPOINTS["bsc"])
        chain_id = CHAIN_IDS.get(chain, 56)
        router_address = ONEINCH_ROUTER.get(chain, ONEINCH_ROUTER["bsc"])

        # Determine decimals based on token symbol
        # USDT/USDC use 6 decimals on most chains, 18 on BSC
        from_symbol_upper = from_symbol.upper()
        decimals = 18
        if from_symbol_upper in ("USDT", "USDC"):
            # BSC USDT/USDC uses 18 decimals, ETH uses 6
            decimals = 18 if chain == "bsc" else 6
        elif from_token.lower() == NATIVE_TOKEN.lower():
            decimals = 18

        amount_wei = int(amount * (10**decimals))

        logger.info(
            f"Executing swap: {amount} ({amount_wei} wei) from {from_token} to {to_token}"
        )

        # Step 1: Approve token if not native
        if from_token.lower() != NATIVE_TOKEN.lower():
            approval_txid = await check_and_approve_token(
                from_token, router_address, amount_wei, chain
            )
            if approval_txid:
                logger.info(f"Token approved: {approval_txid}")

        # Step 2: Get swap transaction from 1inch
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{ONEINCH_API}/{chain_id}/swap",
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                params={
                    "src": from_token,
                    "dst": to_token,
                    "amount": str(amount_wei),
                    "from": wallet_address,
                    "slippage": str(slippage),
                    "disableEstimate": "false",
                },
            )

            if response.status_code != 200:
                error_msg = f"1inch API error: {response.status_code} - {response.text}"
                logger.error(error_msg)
                return SwapExecutionResult(success=False, error=error_msg)

            swap_data = response.json()
            logger.info(f"1inch swap response: {swap_data}")

        # Step 3: Build and sign transaction
        tx_data = swap_data.get("tx", {})
        if not tx_data:
            return SwapExecutionResult(success=False, error="No transaction data from 1inch")

        # Get nonce
        nonce = await _get_nonce(wallet_address, rpc_url)

        # Parse value field (can be int, string decimal, or hex string)
        value_raw = tx_data.get("value", 0)
        if isinstance(value_raw, str):
            if value_raw.startswith("0x"):
                tx_value = int(value_raw, 16)
            else:
                tx_value = int(value_raw)
        else:
            tx_value = int(value_raw)

        # Parse gasPrice (can be int or string)
        gas_price_raw = tx_data.get("gasPrice")
        if gas_price_raw:
            if isinstance(gas_price_raw, str):
                tx_gas_price = int(gas_price_raw)
            else:
                tx_gas_price = int(gas_price_raw)
        else:
            tx_gas_price = await _get_gas_price(rpc_url)

        # Build transaction
        tx = {
            "nonce": nonce,
            "gasPrice": tx_gas_price,
            "gas": int(tx_data.get("gas", 500000)),
            "to": Web3.to_checksum_address(tx_data.get("to", router_address)),
            "value": tx_value,
            "data": tx_data.get("data", ""),
            "chainId": chain_id,
        }

        logger.info(f"Signing swap transaction: nonce={nonce}, gas={tx['gas']}")

        # Sign transaction
        signed_tx = account.sign_transaction(tx)

        # Step 4: Broadcast transaction
        txid = await _broadcast_transaction(signed_tx.raw_transaction.hex(), rpc_url)

        if not txid:
            return SwapExecutionResult(success=False, error="Failed to broadcast transaction")

        logger.info(f"Swap transaction broadcast: {txid}")

        # Step 5: Wait for confirmation (optional, can be done async)
        confirmed = await _wait_for_confirmation(txid, rpc_url, timeout=120)

        if confirmed:
            # Get expected output from swap data
            dst_amount = swap_data.get("dstAmount", "0")
            to_symbol_upper = to_symbol.upper()
            to_decimals = 18
            if to_symbol_upper in ("USDT", "USDC"):
                to_decimals = 18 if chain == "bsc" else 6

            to_amount_human = str(Decimal(dst_amount) / Decimal(10**to_decimals))

            return SwapExecutionResult(
                success=True,
                txid=txid,
                from_amount=str(amount),
                to_amount=to_amount_human,
                gas_used=tx["gas"],
            )
        else:
            return SwapExecutionResult(
                success=True,  # Tx was broadcast, just not confirmed yet
                txid=txid,
                from_amount=str(amount),
                error="Transaction pending confirmation",
            )

    except ImportError as e:
        return SwapExecutionResult(
            success=False, error=f"Required library not installed: {e}"
        )
    except Exception as e:
        logger.error(f"Swap execution failed: {e}")
        return SwapExecutionResult(success=False, error=str(e))


async def execute_swap(
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    chain: str,
    quote_data: Optional[dict] = None,
) -> SwapExecutionResult:
    """Execute a swap based on chain type.

    This is the main entry point for swap execution.

    Args:
        from_asset: Source asset symbol
        to_asset: Destination asset symbol
        amount: Amount to swap
        chain: Chain/DEX identifier (pancakeswap, uniswap, etc.)
        quote_data: Optional quote data with token addresses

    Returns:
        SwapExecutionResult
    """
    # Map chain names to actual chains
    chain_mapping = {
        "pancakeswap": "bsc",
        "uniswap": "ethereum",
        "quickswap": "polygon",
        "traderjoe": "avalanche",
    }

    actual_chain = chain_mapping.get(chain.lower(), chain.lower())

    # For EVM chains using 1inch
    if actual_chain in RPC_ENDPOINTS:
        # Get token addresses from routing module
        from swaperex.routing.oneinch import TOKEN_ADDRESSES

        chain_tokens = TOKEN_ADDRESSES.get(actual_chain, {})
        from_token = chain_tokens.get(from_asset.upper())
        to_token = chain_tokens.get(to_asset.upper())

        if not from_token or not to_token:
            return SwapExecutionResult(
                success=False,
                error=f"Token address not found for {from_asset} or {to_asset} on {actual_chain}",
            )

        return await execute_1inch_swap(
            from_token=from_token,
            to_token=to_token,
            amount=amount,
            chain=actual_chain,
            from_symbol=from_asset,
            to_symbol=to_asset,
        )

    # For non-EVM chains, return not supported for now
    return SwapExecutionResult(
        success=False,
        error=f"Real swap execution not yet supported for {chain}",
    )
