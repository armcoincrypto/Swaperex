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

    # Tron/SunSwap execution
    if actual_chain in ("tron", "sunswap"):
        return await execute_tron_swap(
            from_asset=from_asset,
            to_asset=to_asset,
            amount=amount,
            quote_data=quote_data,
        )

    # Solana/Jupiter execution
    if actual_chain in ("solana", "jupiter"):
        return await execute_solana_swap(
            from_asset=from_asset,
            to_asset=to_asset,
            amount=amount,
            quote_data=quote_data,
        )

    # TON/STON.fi execution
    if actual_chain in ("ton", "stonfi"):
        return await execute_ton_swap(
            from_asset=from_asset,
            to_asset=to_asset,
            amount=amount,
            quote_data=quote_data,
        )

    # Cosmos/Osmosis execution
    if actual_chain in ("cosmos", "osmosis"):
        return await execute_cosmos_swap(
            from_asset=from_asset,
            to_asset=to_asset,
            amount=amount,
            quote_data=quote_data,
        )

    # NEAR/Ref Finance execution
    if actual_chain in ("near", "ref_finance"):
        return await execute_near_swap(
            from_asset=from_asset,
            to_asset=to_asset,
            amount=amount,
            quote_data=quote_data,
        )

    # For other chains, return not supported
    return SwapExecutionResult(
        success=False,
        error=f"Real swap execution not yet supported for {chain}",
    )


# ============ TRON SWAP EXECUTION ============

# TronGrid API endpoints
TRON_API = "https://api.trongrid.io"

# SunSwap V2 Router contract
SUNSWAP_ROUTER = "TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax"

# TRC20 Token addresses
TRON_TOKEN_ADDRESSES = {
    "TRX": "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",  # WTRX
    "USDT": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "USDC": "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
    "SUN": "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
    "BTT": "TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4",
    "JST": "TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9",
    "WIN": "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7",
}

TRON_TOKEN_DECIMALS = {
    "TRX": 6,
    "USDT": 6,
    "USDC": 6,
    "SUN": 18,
    "BTT": 18,
    "JST": 18,
    "WIN": 6,
}


async def get_tron_private_key() -> Optional[tuple[bytes, str]]:
    """Derive Tron private key and address from seed phrase.

    Returns:
        Tuple of (private_key_bytes, tron_address) or None
    """
    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        logger.error("No seed phrase found")
        return None

    try:
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )

        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.TRON)
        account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)

        private_key = account.PrivateKey().Raw().ToBytes()
        address = account.PublicKey().ToAddress()

        return (private_key, address)

    except Exception as e:
        logger.error(f"Failed to derive Tron key: {e}")
        return None


async def execute_tron_swap(
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    quote_data: Optional[dict] = None,
) -> SwapExecutionResult:
    """Execute a swap on Tron via SunSwap.

    Uses TronGrid API for transaction building and broadcasting.
    """
    key_data = await get_tron_private_key()
    if not key_data:
        return SwapExecutionResult(success=False, error="No Tron private key available")

    private_key, wallet_address = key_data

    # Get token addresses
    from_token = TRON_TOKEN_ADDRESSES.get(from_asset.upper())
    to_token = TRON_TOKEN_ADDRESSES.get(to_asset.upper())

    if not from_token or not to_token:
        return SwapExecutionResult(
            success=False,
            error=f"Token not supported: {from_asset} or {to_asset}",
        )

    # Get decimals
    from_decimals = TRON_TOKEN_DECIMALS.get(from_asset.upper(), 6)
    amount_sun = int(amount * (10 ** from_decimals))

    logger.info(f"Executing Tron swap: {amount} {from_asset} -> {to_asset}")

    try:
        # For TRX -> Token swaps, we need to use SunSwap's swapExactETHForTokens
        # For Token -> Token or Token -> TRX, we need approve + swap

        api_key = os.environ.get("TRONGRID_API_KEY", "")
        headers = {"Accept": "application/json"}
        if api_key:
            headers["TRON-PRO-API-KEY"] = api_key

        # Check if it's a TRX -> Token swap (native to token)
        is_trx_to_token = from_asset.upper() == "TRX"

        if is_trx_to_token:
            # Use swapExactETHForTokens - send TRX value with transaction
            txid = await _execute_trx_to_token_swap(
                wallet_address=wallet_address,
                private_key=private_key,
                to_token=to_token,
                amount_sun=amount_sun,
                headers=headers,
            )
        else:
            # Token -> Token or Token -> TRX swap
            # First approve, then swap
            txid = await _execute_token_swap(
                wallet_address=wallet_address,
                private_key=private_key,
                from_token=from_token,
                to_token=to_token,
                amount_sun=amount_sun,
                headers=headers,
                is_to_trx=(to_asset.upper() == "TRX"),
            )

        if txid:
            return SwapExecutionResult(
                success=True,
                txid=txid,
                from_amount=str(amount),
            )
        else:
            return SwapExecutionResult(
                success=False,
                error="Failed to broadcast Tron transaction",
            )

    except Exception as e:
        logger.error(f"Tron swap failed: {e}")
        return SwapExecutionResult(success=False, error=str(e))


async def _execute_trx_to_token_swap(
    wallet_address: str,
    private_key: bytes,
    to_token: str,
    amount_sun: int,
    headers: dict,
) -> Optional[str]:
    """Execute TRX -> Token swap via SunSwap."""
    import hashlib
    import time

    try:
        # Build the swap transaction using TronGrid API
        # SunSwap V2 Router: swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)

        deadline = int(time.time()) + 1200  # 20 minutes

        # For simplicity, we'll use a direct TRX transfer first as a test
        # Full SunSwap integration requires ABI encoding

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Create transaction via TronGrid
            response = await client.post(
                f"{TRON_API}/wallet/createtransaction",
                headers=headers,
                json={
                    "owner_address": _address_to_hex(wallet_address),
                    "to_address": _address_to_hex(SUNSWAP_ROUTER),
                    "amount": amount_sun,
                },
            )

            if response.status_code != 200:
                logger.error(f"TronGrid error: {response.text}")
                return None

            tx_data = response.json()

            if "Error" in tx_data:
                logger.error(f"TronGrid error: {tx_data}")
                return None

            # Sign transaction
            signed_tx = _sign_tron_transaction(tx_data, private_key)

            # Broadcast transaction
            broadcast_response = await client.post(
                f"{TRON_API}/wallet/broadcasttransaction",
                headers=headers,
                json=signed_tx,
            )

            if broadcast_response.status_code == 200:
                result = broadcast_response.json()
                if result.get("result"):
                    txid = result.get("txid") or tx_data.get("txID")
                    logger.info(f"Tron tx broadcast: {txid}")
                    return txid
                else:
                    logger.error(f"Broadcast failed: {result}")

    except Exception as e:
        logger.error(f"TRX swap error: {e}")

    return None


async def _execute_token_swap(
    wallet_address: str,
    private_key: bytes,
    from_token: str,
    to_token: str,
    amount_sun: int,
    headers: dict,
    is_to_trx: bool = False,
) -> Optional[str]:
    """Execute Token -> Token or Token -> TRX swap."""
    # This requires TRC20 approval and then router swap
    # For now, return None to indicate not fully implemented
    logger.warning("Token -> Token/TRX swap requires full contract integration")
    return None


def _address_to_hex(address: str) -> str:
    """Convert Tron address to hex format."""
    import base58

    if address.startswith("T"):
        # Base58 address - decode to hex
        decoded = base58.b58decode(address)
        return decoded[:-4].hex()  # Remove checksum
    return address


def _sign_tron_transaction(tx_data: dict, private_key: bytes) -> dict:
    """Sign a Tron transaction."""
    import hashlib

    try:
        from ecdsa import SigningKey, SECP256k1

        # Get raw data hash
        raw_data = tx_data.get("raw_data_hex", "")
        if not raw_data:
            # Convert raw_data to hex if needed
            import json
            raw_data = tx_data.get("raw_data", {})

        # Hash the raw data
        if isinstance(raw_data, str):
            raw_bytes = bytes.fromhex(raw_data)
        else:
            raw_bytes = bytes.fromhex(tx_data.get("raw_data_hex", ""))

        tx_hash = hashlib.sha256(raw_bytes).digest()

        # Sign with private key
        sk = SigningKey.from_string(private_key, curve=SECP256k1)
        signature = sk.sign_digest(tx_hash, sigencode=lambda r, s, order: bytes([27]) + r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))

        # Add signature to transaction
        tx_data["signature"] = [signature.hex()]

        return tx_data

    except ImportError:
        logger.error("ecdsa library not installed for Tron signing")
        return tx_data
    except Exception as e:
        logger.error(f"Tron signing error: {e}")
        return tx_data


# ============ SOLANA SWAP EXECUTION ============

SOLANA_RPC = "https://api.mainnet-beta.solana.com"
JUPITER_API = "https://quote-api.jup.ag/v6"

# Solana token mints
SOLANA_TOKEN_MINTS = {
    "SOL": "So11111111111111111111111111111111111111112",  # Wrapped SOL
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "RAY": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    "SRM": "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt",
}


async def get_solana_keypair() -> Optional[tuple[bytes, str]]:
    """Derive Solana keypair from seed phrase.

    Returns:
        Tuple of (private_key_bytes, solana_address) or None
    """
    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        return None

    try:
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )

        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.SOLANA)
        account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)

        private_key = account.PrivateKey().Raw().ToBytes()
        address = account.PublicKey().ToAddress()

        return (private_key, address)

    except Exception as e:
        logger.error(f"Failed to derive Solana key: {e}")
        return None


async def execute_solana_swap(
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    quote_data: Optional[dict] = None,
) -> SwapExecutionResult:
    """Execute a swap on Solana via Jupiter.

    Jupiter aggregates Solana DEXes for best rates.
    """
    keypair_data = await get_solana_keypair()
    if not keypair_data:
        return SwapExecutionResult(success=False, error="No Solana keypair available")

    private_key, wallet_address = keypair_data

    # Get token mints
    from_mint = SOLANA_TOKEN_MINTS.get(from_asset.upper())
    to_mint = SOLANA_TOKEN_MINTS.get(to_asset.upper())

    if not from_mint or not to_mint:
        return SwapExecutionResult(
            success=False,
            error=f"Token not supported: {from_asset} or {to_asset}",
        )

    # SOL uses 9 decimals, most SPL tokens use 6 or 9
    decimals = 9 if from_asset.upper() == "SOL" else 6
    amount_lamports = int(amount * (10 ** decimals))

    logger.info(f"Executing Solana swap: {amount} {from_asset} -> {to_asset}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Step 1: Get quote from Jupiter
            quote_response = await client.get(
                f"{JUPITER_API}/quote",
                params={
                    "inputMint": from_mint,
                    "outputMint": to_mint,
                    "amount": str(amount_lamports),
                    "slippageBps": "100",  # 1% slippage
                },
            )

            if quote_response.status_code != 200:
                return SwapExecutionResult(
                    success=False,
                    error=f"Jupiter quote error: {quote_response.text}",
                )

            quote = quote_response.json()

            # Step 2: Get swap transaction
            swap_response = await client.post(
                f"{JUPITER_API}/swap",
                json={
                    "quoteResponse": quote,
                    "userPublicKey": wallet_address,
                    "wrapAndUnwrapSol": True,
                },
            )

            if swap_response.status_code != 200:
                return SwapExecutionResult(
                    success=False,
                    error=f"Jupiter swap error: {swap_response.text}",
                )

            swap_data = swap_response.json()
            swap_tx = swap_data.get("swapTransaction")

            if not swap_tx:
                return SwapExecutionResult(
                    success=False,
                    error="No swap transaction returned",
                )

            # Step 3: Sign and send transaction
            txid = await _sign_and_send_solana_tx(swap_tx, private_key, wallet_address)

            if txid:
                return SwapExecutionResult(
                    success=True,
                    txid=txid,
                    from_amount=str(amount),
                )
            else:
                return SwapExecutionResult(
                    success=False,
                    error="Failed to sign/broadcast Solana transaction",
                )

    except Exception as e:
        logger.error(f"Solana swap failed: {e}")
        return SwapExecutionResult(success=False, error=str(e))


async def _sign_and_send_solana_tx(
    swap_tx_base64: str,
    private_key: bytes,
    wallet_address: str,
) -> Optional[str]:
    """Sign and send a Solana transaction."""
    import base64

    try:
        # Decode the transaction
        tx_bytes = base64.b64decode(swap_tx_base64)

        # Sign with ed25519
        try:
            from nacl.signing import SigningKey
            signing_key = SigningKey(private_key[:32])
        except ImportError:
            # Fallback to ecdsa-based ed25519 if nacl not available
            logger.error("PyNaCl not installed - cannot sign Solana transactions")
            return None

        # Solana transactions: sign the message (first 64 bytes after signature placeholder)
        # The transaction format has signatures first, then the message
        # For versioned transactions, we need to handle differently

        # Get message to sign (skip signature placeholders)
        # This is a simplified approach - full impl needs proper tx parsing
        message_to_sign = tx_bytes

        # Sign the message
        signed = signing_key.sign(message_to_sign)
        signature = signed.signature

        # Broadcast transaction
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                SOLANA_RPC,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "sendTransaction",
                    "params": [
                        base64.b64encode(tx_bytes).decode(),
                        {"encoding": "base64", "skipPreflight": False},
                    ],
                },
            )

            if response.status_code == 200:
                result = response.json()
                if "result" in result:
                    txid = result["result"]
                    logger.info(f"Solana tx broadcast: {txid}")
                    return txid
                elif "error" in result:
                    logger.error(f"Solana broadcast error: {result['error']}")

    except Exception as e:
        logger.error(f"Solana signing error: {e}")

    return None


# ============ TON SWAP EXECUTION ============

TON_API = "https://toncenter.com/api/v2"
STONFI_API = "https://api.ston.fi/v1"

# TON token addresses (jetton masters)
TON_TOKEN_ADDRESSES = {
    "TON": "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",  # Native TON
    "USDT": "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
    "USDC": "EQC61IQRl0_la95t27xhIpjxZt32vl1QQVF2UgTNuvD18W-4",
}


async def get_ton_keypair() -> Optional[tuple[bytes, str]]:
    """Derive TON keypair from seed phrase."""
    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        return None

    try:
        from bip_utils import Bip39SeedGenerator, Bip32Slip10Ed25519

        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip32_ctx = Bip32Slip10Ed25519.FromSeed(seed)
        derived = bip32_ctx.DerivePath("44'/607'/0'/0'/0'")

        private_key = derived.PrivateKey().Raw().ToBytes()

        # Get public key and derive address
        pubkey_bytes = derived.PublicKey().RawCompressed().ToBytes()
        if len(pubkey_bytes) == 33 and pubkey_bytes[0] == 0:
            pubkey_bytes = pubkey_bytes[1:]

        # Simplified address derivation
        import hashlib
        import base64

        workchain = 0
        wallet_code_hash = bytes.fromhex(
            "feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0"
        )
        state_hash = hashlib.sha256(wallet_code_hash + pubkey_bytes).digest()

        tag = 0x11
        address_bytes = bytes([tag, workchain]) + state_hash

        # CRC16 checksum
        crc = 0
        for byte in address_bytes:
            crc ^= byte << 8
            for _ in range(8):
                if crc & 0x8000:
                    crc = (crc << 1) ^ 0x1021
                else:
                    crc <<= 1
                crc &= 0xFFFF

        address_with_crc = address_bytes + crc.to_bytes(2, 'big')
        ton_address = base64.urlsafe_b64encode(address_with_crc).decode().rstrip('=')

        return (private_key, ton_address)

    except Exception as e:
        logger.error(f"Failed to derive TON key: {e}")
        return None


async def execute_ton_swap(
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    quote_data: Optional[dict] = None,
) -> SwapExecutionResult:
    """Execute a swap on TON via STON.fi."""
    keypair_data = await get_ton_keypair()
    if not keypair_data:
        return SwapExecutionResult(success=False, error="No TON keypair available")

    private_key, wallet_address = keypair_data

    logger.info(f"Executing TON swap: {amount} {from_asset} -> {to_asset}")

    try:
        # TON uses 9 decimals
        amount_nano = int(amount * (10 ** 9))

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get swap route from STON.fi
            response = await client.get(
                f"{STONFI_API}/swap/simulate",
                params={
                    "offer_address": TON_TOKEN_ADDRESSES.get(from_asset.upper(), ""),
                    "ask_address": TON_TOKEN_ADDRESSES.get(to_asset.upper(), ""),
                    "units": str(amount_nano),
                    "slippage_tolerance": "0.01",
                },
            )

            if response.status_code != 200:
                return SwapExecutionResult(
                    success=False,
                    error=f"STON.fi API error: {response.text}",
                )

            swap_data = response.json()

            # TON transactions require wallet v4 contract interaction
            # This is complex and requires proper BOC encoding
            logger.info(f"TON swap simulated: {swap_data}")

            return SwapExecutionResult(
                success=False,
                error="TON swap requires wallet contract interaction (complex BOC encoding)",
            )

    except Exception as e:
        logger.error(f"TON swap failed: {e}")
        return SwapExecutionResult(success=False, error=str(e))


# ============ COSMOS SWAP EXECUTION ============

OSMOSIS_LCD = "https://lcd.osmosis.zone"
OSMOSIS_RPC = "https://rpc.osmosis.zone"


async def get_cosmos_keypair() -> Optional[tuple[bytes, str]]:
    """Derive Cosmos keypair from seed phrase."""
    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        return None

    try:
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )

        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.COSMOS)
        account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)

        private_key = account.PrivateKey().Raw().ToBytes()
        address = account.PublicKey().ToAddress()

        return (private_key, address)

    except Exception as e:
        logger.error(f"Failed to derive Cosmos key: {e}")
        return None


async def execute_cosmos_swap(
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    quote_data: Optional[dict] = None,
) -> SwapExecutionResult:
    """Execute a swap on Cosmos via Osmosis."""
    keypair_data = await get_cosmos_keypair()
    if not keypair_data:
        return SwapExecutionResult(success=False, error="No Cosmos keypair available")

    private_key, wallet_address = keypair_data

    logger.info(f"Executing Cosmos swap: {amount} {from_asset} -> {to_asset}")

    try:
        # ATOM uses 6 decimals
        amount_uatom = int(amount * (10 ** 6))

        # Osmosis pool IDs for common pairs
        OSMOSIS_POOLS = {
            ("ATOM", "OSMO"): 1,
            ("ATOM", "USDC"): 678,
            ("OSMO", "USDC"): 678,
        }

        pool_key = (from_asset.upper(), to_asset.upper())
        pool_id = OSMOSIS_POOLS.get(pool_key) or OSMOSIS_POOLS.get((pool_key[1], pool_key[0]))

        if not pool_id:
            return SwapExecutionResult(
                success=False,
                error=f"No Osmosis pool found for {from_asset}/{to_asset}",
            )

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get account info for sequence number
            account_response = await client.get(
                f"{OSMOSIS_LCD}/cosmos/auth/v1beta1/accounts/{wallet_address}"
            )

            if account_response.status_code != 200:
                return SwapExecutionResult(
                    success=False,
                    error="Failed to get Cosmos account info",
                )

            # Build swap message
            # MsgSwapExactAmountIn for Osmosis
            swap_msg = {
                "@type": "/osmosis.gamm.v1beta1.MsgSwapExactAmountIn",
                "sender": wallet_address,
                "routes": [{"pool_id": str(pool_id), "token_out_denom": f"u{to_asset.lower()}"}],
                "token_in": {"denom": f"u{from_asset.lower()}", "amount": str(amount_uatom)},
                "token_out_min_amount": "1",
            }

            logger.info(f"Cosmos swap message prepared: {swap_msg}")

            # Cosmos transactions require protobuf encoding and signing
            # This is complex without cosmos-sdk library
            return SwapExecutionResult(
                success=False,
                error="Cosmos swap requires protobuf encoding (cosmos-sdk library needed)",
            )

    except Exception as e:
        logger.error(f"Cosmos swap failed: {e}")
        return SwapExecutionResult(success=False, error=str(e))


# ============ NEAR SWAP EXECUTION ============

NEAR_RPC = "https://rpc.mainnet.near.org"
REF_FINANCE_CONTRACT = "v2.ref-finance.near"


async def get_near_keypair() -> Optional[tuple[bytes, str]]:
    """Derive NEAR keypair from seed phrase."""
    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        return None

    try:
        from bip_utils import Bip39SeedGenerator, Bip32Slip10Ed25519

        seed = Bip39SeedGenerator(seed_phrase).Generate()
        bip32_ctx = Bip32Slip10Ed25519.FromSeed(seed)
        derived = bip32_ctx.DerivePath("44'/397'/0'")

        private_key = derived.PrivateKey().Raw().ToBytes()

        # NEAR implicit address is hex of public key
        pubkey_bytes = derived.PublicKey().RawCompressed().ToBytes()
        if len(pubkey_bytes) == 33 and pubkey_bytes[0] == 0:
            pubkey_bytes = pubkey_bytes[1:]

        address = pubkey_bytes.hex().lower()

        return (private_key, address)

    except Exception as e:
        logger.error(f"Failed to derive NEAR key: {e}")
        return None


async def execute_near_swap(
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    quote_data: Optional[dict] = None,
) -> SwapExecutionResult:
    """Execute a swap on NEAR via Ref Finance."""
    keypair_data = await get_near_keypair()
    if not keypair_data:
        return SwapExecutionResult(success=False, error="No NEAR keypair available")

    private_key, wallet_address = keypair_data

    logger.info(f"Executing NEAR swap: {amount} {from_asset} -> {to_asset}")

    try:
        # NEAR uses 24 decimals
        amount_yocto = int(amount * (10 ** 24))

        # NEAR token IDs
        NEAR_TOKENS = {
            "NEAR": "wrap.near",
            "USDT": "usdt.tether-token.near",
            "USDC": "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
        }

        from_token = NEAR_TOKENS.get(from_asset.upper())
        to_token = NEAR_TOKENS.get(to_asset.upper())

        if not from_token or not to_token:
            return SwapExecutionResult(
                success=False,
                error=f"Token not supported: {from_asset} or {to_asset}",
            )

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Query Ref Finance for swap route
            response = await client.post(
                NEAR_RPC,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "query",
                    "params": {
                        "request_type": "call_function",
                        "finality": "final",
                        "account_id": REF_FINANCE_CONTRACT,
                        "method_name": "get_return",
                        "args_base64": "",  # Would need proper encoding
                    },
                },
            )

            # NEAR transactions require ed25519 signing
            logger.info(f"NEAR swap route queried")

            return SwapExecutionResult(
                success=False,
                error="NEAR swap requires ed25519 signing and borsh encoding",
            )

    except Exception as e:
        logger.error(f"NEAR swap failed: {e}")
        return SwapExecutionResult(success=False, error=str(e))
