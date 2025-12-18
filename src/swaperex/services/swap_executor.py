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

    # THORChain cross-chain execution
    if actual_chain in ("thorchain",):
        return await execute_thorchain_swap(
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

# SunSwap V2 Router contract (correct mainnet address)
# Source: https://sun.io/
SUNSWAP_ROUTER = "TXF1xDbVGdxFGbovmmmXvBGu8ZiE3Lq4mR"

# Alternative routers if V2 fails:
# SunSwap V1: "TQSKFiPkgZWjZpM8g3UJMEA8XLEXEr5ETf"
# SunSwap V3: Different interface

# TRC20 Token addresses
TRON_TOKEN_ADDRESSES = {
    "TRX": "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR",  # WTRX (SunSwap V2)
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

    logger.info(f"Tron wallet address: {wallet_address}")

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
    """Execute TRX -> Token swap via SunSwap router.

    Calls swapExactTRXForTokens on SunSwap V2 Router.
    """
    import time

    try:
        deadline = int(time.time()) + 1200  # 20 minutes

        # WTRX (Wrapped TRX) address for SunSwap V2 on mainnet
        wtrx_address = "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR"

        # Build swap path: WTRX -> Token
        path = [_address_to_hex(wtrx_address), _address_to_hex(to_token)]

        # Calculate minimum output (1% slippage)
        amount_out_min = 1  # Minimum 1 unit to avoid failed tx

        # Encode swapExactETHForTokens function call (SunSwap uses Uniswap V2 style)
        # Function: swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)
        # Selector: 0x7ff36ab5 (standard Uniswap V2)

        # Encode parameters
        params = _encode_swap_params(
            amount_out_min=amount_out_min,
            path=path,
            to_address=_address_to_hex(wallet_address),
            deadline=deadline,
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Create TriggerSmartContract transaction
            response = await client.post(
                f"{TRON_API}/wallet/triggersmartcontract",
                headers=headers,
                json={
                    "owner_address": _address_to_hex(wallet_address),
                    "contract_address": _address_to_hex(SUNSWAP_ROUTER),
                    "function_selector": "swapExactETHForTokens(uint256,address[],address,uint256)",
                    "parameter": params,
                    "call_value": amount_sun,  # TRX amount in sun
                    "fee_limit": 150000000,  # 150 TRX max fee (more for complex swaps)
                },
            )

            if response.status_code != 200:
                logger.error(f"TronGrid error: {response.text}")
                return None

            data = response.json()

            if not data.get("result", {}).get("result"):
                error_msg = data.get("result", {}).get("message", "Unknown error")
                if error_msg:
                    error_msg = bytes.fromhex(error_msg).decode('utf-8', errors='ignore')
                logger.error(f"TriggerSmartContract failed: {error_msg}")
                return None

            tx_data = data.get("transaction", {})
            if not tx_data:
                logger.error("No transaction data returned")
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
                    logger.info(f"Tron swap tx broadcast: {txid}")
                    return txid
                else:
                    error = result.get("message", "Unknown broadcast error")
                    if isinstance(error, str) and len(error) > 10:
                        try:
                            error = bytes.fromhex(error).decode('utf-8', errors='ignore')
                        except Exception:
                            pass
                    logger.error(f"Broadcast failed: {error}")

    except Exception as e:
        logger.error(f"TRX->Token swap error: {e}")

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
    """Execute Token -> Token or Token -> TRX swap.

    First approves the router to spend tokens, then executes swap.
    """
    import time

    try:
        # Step 1: Approve router to spend tokens
        logger.info(f"Approving {from_token} for SunSwap router...")

        approval_txid = await _approve_trc20(
            wallet_address=wallet_address,
            private_key=private_key,
            token_address=from_token,
            spender_address=SUNSWAP_ROUTER,
            amount=amount_sun,
            headers=headers,
        )

        if not approval_txid:
            logger.error("Token approval failed")
            return None

        logger.info(f"Token approved: {approval_txid}")

        # Wait for approval to be confirmed (3 seconds)
        import asyncio
        await asyncio.sleep(3)

        # Step 2: Execute swap
        deadline = int(time.time()) + 1200
        wtrx_address = "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR"

        if is_to_trx:
            # Token -> TRX: swapExactTokensForETH (Uniswap V2 style)
            path = [_address_to_hex(from_token), _address_to_hex(wtrx_address)]
            function_selector = "swapExactTokensForETH(uint256,uint256,address[],address,uint256)"
        else:
            # Token -> Token: swapExactTokensForTokens (Uniswap V2 style)
            path = [_address_to_hex(from_token), _address_to_hex(wtrx_address), _address_to_hex(to_token)]
            function_selector = "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)"

        params = _encode_token_swap_params(
            amount_in=amount_sun,
            amount_out_min=1,
            path=path,
            to_address=_address_to_hex(wallet_address),
            deadline=deadline,
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{TRON_API}/wallet/triggersmartcontract",
                headers=headers,
                json={
                    "owner_address": _address_to_hex(wallet_address),
                    "contract_address": _address_to_hex(SUNSWAP_ROUTER),
                    "function_selector": function_selector,
                    "parameter": params,
                    "fee_limit": 100000000,
                },
            )

            if response.status_code != 200:
                logger.error(f"TronGrid error: {response.text}")
                return None

            data = response.json()

            if not data.get("result", {}).get("result"):
                error_msg = data.get("result", {}).get("message", "Unknown error")
                if error_msg:
                    try:
                        error_msg = bytes.fromhex(error_msg).decode('utf-8', errors='ignore')
                    except Exception:
                        pass
                logger.error(f"Token swap failed: {error_msg}")
                return None

            tx_data = data.get("transaction", {})
            if not tx_data:
                return None

            signed_tx = _sign_tron_transaction(tx_data, private_key)

            broadcast_response = await client.post(
                f"{TRON_API}/wallet/broadcasttransaction",
                headers=headers,
                json=signed_tx,
            )

            if broadcast_response.status_code == 200:
                result = broadcast_response.json()
                if result.get("result"):
                    txid = result.get("txid") or tx_data.get("txID")
                    logger.info(f"Token swap tx broadcast: {txid}")
                    return txid
                else:
                    logger.error(f"Swap broadcast failed: {result}")

    except Exception as e:
        logger.error(f"Token swap error: {e}")

    return None


async def _approve_trc20(
    wallet_address: str,
    private_key: bytes,
    token_address: str,
    spender_address: str,
    amount: int,
    headers: dict,
) -> Optional[str]:
    """Approve TRC20 token spending."""
    try:
        # approve(address spender, uint256 amount)
        # Use max uint256 for unlimited approval
        max_amount = 2**256 - 1

        spender_hex = _address_to_hex(spender_address)
        # Pad spender to 32 bytes (remove 41 prefix for Tron, pad to 64 hex chars)
        if spender_hex.startswith("41"):
            spender_hex = spender_hex[2:]
        spender_padded = spender_hex.zfill(64)
        amount_padded = hex(max_amount)[2:].zfill(64)

        params = spender_padded + amount_padded

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{TRON_API}/wallet/triggersmartcontract",
                headers=headers,
                json={
                    "owner_address": _address_to_hex(wallet_address),
                    "contract_address": _address_to_hex(token_address),
                    "function_selector": "approve(address,uint256)",
                    "parameter": params,
                    "fee_limit": 50000000,  # 50 TRX
                },
            )

            if response.status_code != 200:
                return None

            data = response.json()

            if not data.get("result", {}).get("result"):
                return None

            tx_data = data.get("transaction", {})
            if not tx_data:
                return None

            signed_tx = _sign_tron_transaction(tx_data, private_key)

            broadcast_response = await client.post(
                f"{TRON_API}/wallet/broadcasttransaction",
                headers=headers,
                json=signed_tx,
            )

            if broadcast_response.status_code == 200:
                result = broadcast_response.json()
                if result.get("result"):
                    return result.get("txid") or tx_data.get("txID")

    except Exception as e:
        logger.error(f"TRC20 approval error: {e}")

    return None


def _encode_swap_params(
    amount_out_min: int,
    path: list[str],
    to_address: str,
    deadline: int,
) -> str:
    """Encode parameters for swapExactTRXForTokens."""
    # Offset to path array (4 * 32 = 128 bytes = 0x80)
    offset_path = 128

    # Remove 41 prefix from addresses
    to_addr = to_address[2:] if to_address.startswith("41") else to_address

    result = ""
    # amountOutMin (uint256)
    result += hex(amount_out_min)[2:].zfill(64)
    # offset to path array
    result += hex(offset_path)[2:].zfill(64)
    # to address (padded)
    result += to_addr.zfill(64)
    # deadline (uint256)
    result += hex(deadline)[2:].zfill(64)
    # path array length
    result += hex(len(path))[2:].zfill(64)
    # path addresses
    for addr in path:
        addr_clean = addr[2:] if addr.startswith("41") else addr
        result += addr_clean.zfill(64)

    return result


def _encode_token_swap_params(
    amount_in: int,
    amount_out_min: int,
    path: list[str],
    to_address: str,
    deadline: int,
) -> str:
    """Encode parameters for swapExactTokensForTokens/TRX."""
    # Offset to path array (5 * 32 = 160 bytes = 0xa0)
    offset_path = 160

    to_addr = to_address[2:] if to_address.startswith("41") else to_address

    result = ""
    # amountIn (uint256)
    result += hex(amount_in)[2:].zfill(64)
    # amountOutMin (uint256)
    result += hex(amount_out_min)[2:].zfill(64)
    # offset to path array
    result += hex(offset_path)[2:].zfill(64)
    # to address (padded)
    result += to_addr.zfill(64)
    # deadline (uint256)
    result += hex(deadline)[2:].zfill(64)
    # path array length
    result += hex(len(path))[2:].zfill(64)
    # path addresses
    for addr in path:
        addr_clean = addr[2:] if addr.startswith("41") else addr
        result += addr_clean.zfill(64)

    return result


def _address_to_hex(address: str) -> str:
    """Convert Tron address to hex format."""
    import base58

    if address.startswith("T"):
        # Base58 address - decode to hex
        decoded = base58.b58decode(address)
        return decoded[:-4].hex()  # Remove checksum
    return address


def _sign_tron_transaction(tx_data: dict, private_key: bytes) -> dict:
    """Sign a Tron transaction.

    Tron uses secp256k1 ECDSA signatures with recovery byte (r, s, v format).
    The recovery byte v (27 or 28) indicates which of two possible public keys
    was used to create the signature.
    """
    import hashlib

    try:
        from ecdsa import SigningKey, SECP256k1, util
        from ecdsa.keys import BadSignatureError

        # Get raw data hash
        raw_data_hex = tx_data.get("raw_data_hex", "")
        if not raw_data_hex:
            logger.error("No raw_data_hex in transaction")
            return tx_data

        # Hash the raw data
        raw_bytes = bytes.fromhex(raw_data_hex)
        tx_hash = hashlib.sha256(raw_bytes).digest()

        # Sign with private key using deterministic k (RFC 6979)
        sk = SigningKey.from_string(private_key, curve=SECP256k1)
        signature = sk.sign_digest(
            tx_hash,
            sigencode=util.sigencode_string_canonize
        )

        # Get r and s from signature (each 32 bytes)
        r = int.from_bytes(signature[:32], 'big')
        s = int.from_bytes(signature[32:], 'big')

        # Get our public key for verification
        our_pubkey = sk.get_verifying_key()
        our_pubkey_bytes = our_pubkey.to_string()  # 64 bytes (x, y coordinates)

        # Determine correct recovery byte by trying to recover public key
        # For secp256k1, v can be 0 or 1 (mapped to 27 or 28 for Ethereum/Tron)
        correct_v = 27  # default

        try:
            from ecdsa import VerifyingKey, SECP256k1

            # The recovery process: for each v value, try to recover the public key
            # and check if it matches our public key
            for recovery_flag in [0, 1]:
                try:
                    # Recover public key from signature
                    # Using the formula for ecrecover
                    recovered_pubkey = _recover_public_key(tx_hash, r, s, recovery_flag)

                    if recovered_pubkey and recovered_pubkey == our_pubkey_bytes:
                        correct_v = 27 + recovery_flag
                        logger.debug(f"Found correct recovery byte: v={correct_v}")
                        break
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"Could not determine recovery byte, using default: {e}")

        # Build final signature: r (32 bytes) + s (32 bytes) + v (1 byte)
        sig_with_v = r.to_bytes(32, 'big') + s.to_bytes(32, 'big') + bytes([correct_v])
        tx_data["signature"] = [sig_with_v.hex()]

        logger.info(f"Tron transaction signed with v={correct_v}")
        return tx_data

    except ImportError as e:
        logger.error(f"ecdsa library not installed for Tron signing: {e}")
        return tx_data
    except Exception as e:
        logger.error(f"Tron signing error: {e}")
        return tx_data


def _recover_public_key(msg_hash: bytes, r: int, s: int, recovery_flag: int) -> Optional[bytes]:
    """Recover public key from ECDSA signature using recovery flag.

    This implements ecrecover for secp256k1.

    Args:
        msg_hash: 32-byte message hash
        r: r component of signature
        s: s component of signature
        recovery_flag: 0 or 1 indicating which of two possible public keys

    Returns:
        64-byte public key (x, y coordinates) or None
    """
    try:
        from ecdsa import SECP256k1
        from ecdsa.ellipticcurve import Point

        curve = SECP256k1.curve
        generator = SECP256k1.generator
        order = SECP256k1.order

        # Calculate x coordinate of R point
        x = r + (recovery_flag >> 1) * order

        # Check if x is valid
        if x >= curve.p():
            return None

        # Calculate y^2 = x^3 + ax + b (mod p)
        y_squared = (pow(x, 3, curve.p()) + curve.a() * x + curve.b()) % curve.p()

        # Calculate y using modular square root
        y = _mod_sqrt(y_squared, curve.p())
        if y is None:
            return None

        # Choose correct y based on recovery flag parity
        if (recovery_flag & 1) != (y & 1):
            y = curve.p() - y

        # Create point R
        R = Point(curve, x, y)

        # Calculate public key: Q = r^(-1) * (s*R - e*G)
        r_inv = pow(r, -1, order)
        e = int.from_bytes(msg_hash, 'big')

        # Calculate s*R
        sR = R * s
        # Calculate e*G
        eG = generator * e
        # Calculate s*R - e*G
        diff = sR + Point(curve, eG.x(), (-eG.y()) % curve.p())
        # Calculate Q = r^(-1) * diff
        Q = diff * r_inv

        # Return public key as 64 bytes (x || y)
        x_bytes = Q.x().to_bytes(32, 'big')
        y_bytes = Q.y().to_bytes(32, 'big')

        return x_bytes + y_bytes

    except Exception as e:
        logger.debug(f"Public key recovery failed: {e}")
        return None


def _mod_sqrt(a: int, p: int) -> Optional[int]:
    """Calculate modular square root using Tonelli-Shanks algorithm.

    For p ≡ 3 (mod 4), this simplifies to a^((p+1)/4) mod p.
    secp256k1's p satisfies this condition.
    """
    if a == 0:
        return 0

    # For secp256k1, p ≡ 3 (mod 4), so we can use the simple formula
    result = pow(a, (p + 1) // 4, p)

    # Verify the result
    if pow(result, 2, p) == a:
        return result
    return None


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
    """Sign and send a Solana transaction.

    Jupiter returns versioned transactions that need proper ed25519 signing.
    The transaction format:
    - For versioned: 1 byte prefix (0x80) + num_signatures + signatures + message
    - Signature placeholder is 64 zero bytes
    """
    import base64

    try:
        # Decode the transaction
        tx_bytes = bytearray(base64.b64decode(swap_tx_base64))

        # Sign with ed25519
        try:
            from nacl.signing import SigningKey
            signing_key = SigningKey(private_key[:32])
        except ImportError:
            logger.error("PyNaCl not installed - cannot sign Solana transactions")
            return None

        # Parse versioned transaction to find message location
        # Versioned transactions start with 0x80
        is_versioned = tx_bytes[0] == 0x80

        if is_versioned:
            # Versioned transaction format:
            # byte 0: 0x80 (version prefix)
            # byte 1: number of signatures
            # bytes 2-66: first signature (64 bytes, filled with zeros)
            # remaining: message to sign

            num_signatures = tx_bytes[1]
            signature_offset = 2
            message_offset = 2 + (num_signatures * 64)

            # Extract the message to sign
            message_to_sign = bytes(tx_bytes[message_offset:])

            # Sign the message
            signed = signing_key.sign(message_to_sign)
            signature = signed.signature

            # Insert signature into transaction
            for i, byte in enumerate(signature):
                tx_bytes[signature_offset + i] = byte

        else:
            # Legacy transaction format:
            # byte 0: number of signatures
            # bytes 1-65: first signature (64 bytes)
            # remaining: message

            num_signatures = tx_bytes[0]
            signature_offset = 1
            message_offset = 1 + (num_signatures * 64)

            # Extract the message to sign
            message_to_sign = bytes(tx_bytes[message_offset:])

            # Sign the message
            signed = signing_key.sign(message_to_sign)
            signature = signed.signature

            # Insert signature into transaction
            for i, byte in enumerate(signature):
                tx_bytes[signature_offset + i] = byte

        # Convert back to base64
        signed_tx_base64 = base64.b64encode(bytes(tx_bytes)).decode()

        logger.info(f"Solana transaction signed (versioned={is_versioned})")

        # Broadcast transaction using multiple RPC endpoints for reliability
        rpc_endpoints = [
            SOLANA_RPC,
            "https://solana-mainnet.g.alchemy.com/v2/demo",
            "https://rpc.ankr.com/solana",
        ]

        async with httpx.AsyncClient(timeout=60.0) as client:
            for rpc_url in rpc_endpoints:
                try:
                    response = await client.post(
                        rpc_url,
                        json={
                            "jsonrpc": "2.0",
                            "id": 1,
                            "method": "sendTransaction",
                            "params": [
                                signed_tx_base64,
                                {
                                    "encoding": "base64",
                                    "skipPreflight": False,
                                    "preflightCommitment": "confirmed",
                                },
                            ],
                        },
                        timeout=30.0,
                    )

                    if response.status_code == 200:
                        result = response.json()
                        if "result" in result:
                            txid = result["result"]
                            logger.info(f"Solana tx broadcast via {rpc_url}: {txid}")
                            return txid
                        elif "error" in result:
                            error_msg = result.get("error", {})
                            if isinstance(error_msg, dict):
                                error_msg = error_msg.get("message", str(error_msg))
                            logger.warning(f"Solana RPC error ({rpc_url}): {error_msg}")
                            # Try next RPC if this one fails
                            continue
                except Exception as e:
                    logger.warning(f"Solana RPC {rpc_url} failed: {e}")
                    continue

            logger.error("All Solana RPC endpoints failed")

    except Exception as e:
        logger.error(f"Solana signing error: {e}")

    return None


# ============ TON SWAP EXECUTION ============

TON_API = "https://toncenter.com/api/v2"
STONFI_API = "https://api.ston.fi/v1"
STONFI_ROUTER = "EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt"  # STON.fi Router v1

# TON token addresses (jetton masters)
TON_TOKENS = {
    "TON": {"address": "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c", "decimals": 9, "is_native": True},
    "USDT": {"address": "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", "decimals": 6, "is_native": False},
    "USDC": {"address": "EQC61IQRl0_la95t27xhIpjxZt32vl1QQVF2UgTNuvD18W-4", "decimals": 6, "is_native": False},
    "NOT": {"address": "EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT", "decimals": 9, "is_native": False},
    "STON": {"address": "EQA2kCVNwVsil2EM2mB0SkXytxCqWwTpEpbg6RG-0f6_zZDI", "decimals": 9, "is_native": False},
    "JETTON": {"address": "EQBZ_cafPyDr5KUTs0aNxh0ZTDhkpEZONmLJA2SNGlLm4Cko", "decimals": 9, "is_native": False},
}


def _calculate_ton_address_from_pubkey(pubkey_bytes: bytes, workchain: int = 0) -> tuple[bytes, str]:
    """Calculate TON wallet v4r2 address from public key.

    Returns:
        Tuple of (raw_address_bytes, user_friendly_address)
    """
    import hashlib
    import base64

    # TON Wallet V4R2 code hash
    wallet_v4r2_code_hash = bytes.fromhex(
        "feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0"
    )

    # State init hash = SHA256(code_hash + data_hash)
    # For wallet v4r2, data = pubkey
    state_hash = hashlib.sha256(wallet_v4r2_code_hash + pubkey_bytes).digest()

    # Raw address = workchain (1 byte) + hash (32 bytes)
    raw_address = bytes([workchain & 0xFF]) + state_hash

    # User-friendly address (bounceable)
    tag = 0x11  # Bounceable
    address_bytes = bytes([tag, workchain & 0xFF]) + state_hash

    # CRC16-CCITT checksum
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
    user_friendly = base64.urlsafe_b64encode(address_with_crc).decode().rstrip('=')

    return (raw_address, user_friendly)


async def get_ton_keypair() -> Optional[tuple[bytes, bytes, str]]:
    """Derive TON keypair from seed phrase.

    Returns:
        Tuple of (private_key, public_key, user_friendly_address) or None
    """
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
        # TON uses coin type 607
        derived = bip32_ctx.DerivePath("44'/607'/0'/0'/0'")

        private_key = derived.PrivateKey().Raw().ToBytes()

        # Get raw public key (32 bytes for ed25519)
        pubkey_bytes = derived.PublicKey().RawCompressed().ToBytes()
        if len(pubkey_bytes) == 33 and pubkey_bytes[0] == 0:
            pubkey_bytes = pubkey_bytes[1:]

        # Calculate address
        _, user_friendly = _calculate_ton_address_from_pubkey(pubkey_bytes)

        return (private_key, pubkey_bytes, user_friendly)

    except Exception as e:
        logger.error(f"Failed to derive TON key: {e}")
        return None


async def _get_ton_wallet_seqno(address: str) -> int:
    """Get wallet sequence number for transaction."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{TON_API}/runGetMethod",
                params={
                    "address": address,
                    "method": "seqno",
                    "stack": "[]",
                },
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    result = data.get("result", {})
                    stack = result.get("stack", [])
                    if stack and len(stack) > 0:
                        # Stack format: [["num", "0x..."]]
                        if stack[0][0] == "num":
                            return int(stack[0][1], 16)
                        return int(stack[0][1])

    except Exception as e:
        logger.error(f"Failed to get TON seqno: {e}")

    return 0  # New wallet starts at 0


async def _get_stonfi_swap_route(
    from_token: str, to_token: str, amount: int
) -> Optional[dict]:
    """Get swap route from STON.fi API."""
    from_info = TON_TOKENS.get(from_token.upper())
    to_info = TON_TOKENS.get(to_token.upper())

    if not from_info or not to_info:
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get swap simulation from STON.fi
            response = await client.get(
                f"{STONFI_API}/swap/simulate",
                params={
                    "offer_address": from_info["address"],
                    "ask_address": to_info["address"],
                    "units": str(amount),
                    "slippage_tolerance": "0.01",
                },
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "ask_units": data.get("ask_units", "0"),
                    "min_ask_units": data.get("min_ask_units", "0"),
                    "price_impact": data.get("price_impact", "0"),
                    "fee_units": data.get("fee_units", "0"),
                    "router_address": data.get("router_address", STONFI_ROUTER),
                }

    except Exception as e:
        logger.error(f"Failed to get STON.fi route: {e}")

    return None


def _build_ton_internal_message(
    dest_address: str,
    amount: int,
    body: bytes = b"",
    bounce: bool = True,
) -> bytes:
    """Build a simple internal message for TON.

    This is a simplified builder - for production use pytoniq or tonsdk.
    """
    import struct

    # Message flags
    # ihr_disabled = True, bounce, bounced = False
    flags = 0b01100000 if bounce else 0b01000000

    # Parse destination address
    # For simplicity, we encode as raw address
    dest_bytes = _parse_ton_address(dest_address)

    # Build cell (simplified)
    # Real implementation would use proper BOC serialization
    msg = bytes([flags])
    msg += dest_bytes  # 33 bytes (workchain + hash)
    msg += struct.pack(">Q", amount)  # Amount in nanotons
    msg += body

    return msg


def _parse_ton_address(address: str) -> bytes:
    """Parse TON address to raw bytes."""
    import base64

    try:
        # Handle user-friendly address
        if address.startswith("EQ") or address.startswith("UQ") or address.startswith("0:"):
            if address.startswith("0:"):
                # Raw format: 0:hex
                hex_part = address[2:]
                return bytes([0]) + bytes.fromhex(hex_part)
            else:
                # Base64 format
                # Pad to multiple of 4
                padded = address + "=" * (4 - len(address) % 4) if len(address) % 4 else address
                decoded = base64.urlsafe_b64decode(padded)
                # Skip tag (1 byte), take workchain (1 byte) + hash (32 bytes)
                return decoded[1:34]

    except Exception as e:
        logger.error(f"Failed to parse TON address: {e}")

    return bytes(33)


def _build_ton_wallet_transfer(
    seqno: int,
    messages: list[dict],
    valid_until: int = 0,
) -> bytes:
    """Build wallet v4r2 transfer message body.

    Args:
        seqno: Wallet sequence number
        messages: List of {dest, amount, body} dicts
        valid_until: Transaction expiry timestamp (0 = no expiry)

    Returns:
        Message body bytes for signing
    """
    import struct
    import time

    if valid_until == 0:
        valid_until = int(time.time()) + 60  # 60 seconds from now

    # Wallet v4r2 message format:
    # subwallet_id (32 bits) + valid_until (32 bits) + seqno (32 bits) + op (8 bits) + messages
    subwallet_id = 698983191  # Default v4r2 subwallet

    body = struct.pack(">I", subwallet_id)  # Subwallet ID
    body += struct.pack(">I", valid_until)  # Valid until
    body += struct.pack(">I", seqno)  # Seqno
    body += bytes([0])  # Simple send mode

    # Add messages (up to 4)
    for msg in messages[:4]:
        mode = msg.get("mode", 3)  # Pay gas separately + ignore errors
        body += bytes([mode])

        # Internal message
        dest = msg["dest"]
        amount = msg["amount"]
        payload = msg.get("body", b"")

        # Simplified internal message (would need proper cell serialization)
        body += _build_ton_internal_message(dest, amount, payload)

    return body


async def _sign_and_send_ton_tx(
    private_key: bytes,
    public_key: bytes,
    sender_address: str,
    messages: list[dict],
) -> Optional[str]:
    """Sign and broadcast a TON transaction."""
    try:
        import base64
        import hashlib
        from nacl.signing import SigningKey

        # Get seqno
        seqno = await _get_ton_wallet_seqno(sender_address)
        logger.info(f"TON wallet seqno: {seqno}")

        # Build message body
        body = _build_ton_wallet_transfer(seqno, messages)

        # Hash for signing
        body_hash = hashlib.sha256(body).digest()

        # Sign with ed25519
        signing_key = SigningKey(private_key)
        signed = signing_key.sign(body_hash)
        signature = signed.signature  # 64 bytes

        # Combine signature + body
        signed_body = signature + body

        # Build external message (simplified)
        # Real implementation needs proper BOC encoding
        ext_msg = bytes([0x88])  # External message flag
        ext_msg += _parse_ton_address(sender_address)  # Destination
        ext_msg += signed_body

        # Base64 encode for API
        boc_b64 = base64.b64encode(ext_msg).decode()

        # Broadcast via toncenter
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{TON_API}/sendBoc",
                json={"boc": boc_b64},
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    # TON doesn't return tx hash directly, we compute it
                    tx_hash = hashlib.sha256(ext_msg).hexdigest()
                    return tx_hash
                else:
                    logger.error(f"TON tx failed: {data.get('error')}")

    except Exception as e:
        logger.error(f"Failed to sign/send TON tx: {e}")

    return None


async def execute_ton_swap(
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    quote_data: Optional[dict] = None,
) -> SwapExecutionResult:
    """Execute a swap on TON via STON.fi.

    STON.fi is the leading DEX on TON blockchain.
    Supports TON and jetton (TRC-20 equivalent) swaps.

    Note: This implementation uses simplified BOC encoding.
    For production, consider using pytoniq or tonsdk libraries.
    """
    logger.info(f"Executing TON swap: {amount} {from_asset} -> {to_asset}")

    # Validate tokens
    from_token = TON_TOKENS.get(from_asset.upper())
    to_token = TON_TOKENS.get(to_asset.upper())

    if not from_token:
        return SwapExecutionResult(
            success=False,
            error=f"Token {from_asset} not supported on TON.\n\n"
                  f"Supported tokens: {', '.join(TON_TOKENS.keys())}",
        )

    if not to_token:
        return SwapExecutionResult(
            success=False,
            error=f"Token {to_asset} not supported on TON.\n\n"
                  f"Supported tokens: {', '.join(TON_TOKENS.keys())}",
        )

    try:
        # Step 1: Get keypair
        keypair = await get_ton_keypair()
        if not keypair:
            return SwapExecutionResult(
                success=False,
                error="Could not derive TON wallet. Check your seed phrase.",
            )

        private_key, public_key, sender_address = keypair
        logger.info(f"Using TON address: {sender_address}")

        # Step 2: Calculate amounts
        from_decimals = from_token["decimals"]
        to_decimals = to_token["decimals"]
        amount_in = int(amount * (10 ** from_decimals))

        # Step 3: Get swap route
        route_info = await _get_stonfi_swap_route(from_asset, to_asset, amount_in)
        if not route_info:
            return SwapExecutionResult(
                success=False,
                error=f"Could not get STON.fi swap route for {from_asset} -> {to_asset}",
            )

        expected_out = int(route_info.get("ask_units", "0"))
        min_out = int(route_info.get("min_ask_units", expected_out * 99 // 100))

        # Step 4: Build swap transaction
        # For TON native -> Jetton: send TON to router with swap payload
        # For Jetton -> TON/Jetton: send jetton transfer to router

        if from_token["is_native"]:
            # Sending native TON
            # Build swap payload for STON.fi router
            import struct

            # STON.fi swap opcode
            swap_op = 0x25938561  # swap

            swap_payload = struct.pack(">I", swap_op)
            swap_payload += _parse_ton_address(to_token["address"])  # Ask jetton
            swap_payload += struct.pack(">Q", min_out)  # Min output

            messages = [{
                "dest": STONFI_ROUTER,
                "amount": amount_in + 300_000_000,  # Add gas (0.3 TON)
                "body": swap_payload,
                "mode": 3,
            }]

        else:
            # Sending jetton - need to call jetton wallet's transfer
            # This requires getting user's jetton wallet address first
            # Simplified: return error for now
            return SwapExecutionResult(
                success=False,
                error="Jetton -> Token swaps require jetton wallet lookup.\n\n"
                      "For now, please use https://ston.fi directly for this swap.",
            )

        # Step 5: Sign and send
        txid = await _sign_and_send_ton_tx(
            private_key=private_key,
            public_key=public_key,
            sender_address=sender_address,
            messages=messages,
        )

        if txid:
            to_amount = Decimal(expected_out) / Decimal(10 ** to_decimals)
            return SwapExecutionResult(
                success=True,
                txid=txid,
                from_amount=str(amount),
                to_amount=str(to_amount),
            )
        else:
            return SwapExecutionResult(
                success=False,
                error="Failed to broadcast TON transaction.\n\n"
                      "This could be due to:\n"
                      "- Insufficient TON for gas fees\n"
                      "- Invalid wallet state\n"
                      "- Network issues\n\n"
                      "Try again or use https://ston.fi directly.",
            )

    except Exception as e:
        logger.error(f"TON swap failed: {e}")
        return SwapExecutionResult(
            success=False,
            error=f"TON swap error: {str(e)}",
        )


# ============ COSMOS/OSMOSIS SWAP EXECUTION ============

OSMOSIS_LCD = "https://lcd.osmosis.zone"
OSMOSIS_RPC = "https://rpc.osmosis.zone"
OSMOSIS_CHAIN_ID = "osmosis-1"

# Osmosis tokens with denoms and decimals
OSMOSIS_TOKENS = {
    "OSMO": {"denom": "uosmo", "decimals": 6},
    "ATOM": {
        "denom": "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2",
        "decimals": 6,
    },
    "USDC": {
        "denom": "ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858",
        "decimals": 6,
    },
    "JUNO": {
        "denom": "ibc/46B44899322F3CD854D2D46DEEF881958467CDD4B3B10086DA49296BBED94BED",
        "decimals": 6,
    },
    "INJ": {
        "denom": "ibc/64BA6E31FE887D66C6F8F31C7B1A80C7CA179239677B4088BB55F5EA07DBE273",
        "decimals": 18,
    },
    "TIA": {
        "denom": "ibc/D79E7D83AB399BFFF93433E54FAA480C191248FC556924A2A8351AE2638B3877",
        "decimals": 6,
    },
    "SCRT": {
        "denom": "ibc/0954E1C28EB7AF5B72D24F3BC2B47BBB2FDF91BDDFD57B74B99E133AED40972A",
        "decimals": 6,
    },
    "STARS": {
        "denom": "ibc/987C17B11ABC2B20019178ACE62929FE9840202CE79498E29FE8E5CB02B7C0A4",
        "decimals": 6,
    },
}

# Common Osmosis pool IDs
OSMOSIS_POOLS = {
    ("OSMO", "ATOM"): 1,
    ("ATOM", "OSMO"): 1,
    ("OSMO", "USDC"): 678,
    ("USDC", "OSMO"): 678,
    ("ATOM", "USDC"): 1221,
    ("USDC", "ATOM"): 1221,
    ("OSMO", "JUNO"): 497,
    ("JUNO", "OSMO"): 497,
    ("OSMO", "INJ"): 725,
    ("INJ", "OSMO"): 725,
    ("OSMO", "TIA"): 1248,
    ("TIA", "OSMO"): 1248,
}


async def get_osmosis_keypair() -> Optional[tuple[bytes, bytes, str]]:
    """Derive Osmosis keypair from seed phrase.

    Returns:
        Tuple of (private_key, public_key, osmo_address) or None
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
        import hashlib

        seed = Bip39SeedGenerator(seed_phrase).Generate()
        # Osmosis uses coin type 118 (same as Cosmos)
        bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.COSMOS)
        account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)

        private_key = account.PrivateKey().Raw().ToBytes()
        public_key = account.PublicKey().RawCompressed().ToBytes()

        # Derive bech32 address with 'osmo' prefix
        # Address = bech32(RIPEMD160(SHA256(pubkey)))
        sha256_hash = hashlib.sha256(public_key).digest()
        ripemd160_hash = hashlib.new("ripemd160", sha256_hash).digest()

        # Bech32 encode with osmo prefix
        from swaperex.hdwallet.cosmos import bech32_encode
        address = bech32_encode("osmo", ripemd160_hash)

        return (private_key, public_key, address)

    except Exception as e:
        logger.error(f"Failed to derive Osmosis key: {e}")
        return None


async def get_cosmos_keypair() -> Optional[tuple[bytes, str]]:
    """Derive Cosmos keypair from seed phrase (legacy function)."""
    result = await get_osmosis_keypair()
    if result:
        private_key, _, address = result
        # Convert osmo address to cosmos
        cosmos_address = address.replace("osmo", "cosmos") if address.startswith("osmo") else address
        return (private_key, cosmos_address)
    return None


async def _get_osmosis_account_info(address: str) -> Optional[dict]:
    """Get Osmosis account info (sequence and account number)."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{OSMOSIS_LCD}/cosmos/auth/v1beta1/accounts/{address}"
            )

            if response.status_code == 200:
                data = response.json()
                account = data.get("account", {})
                return {
                    "account_number": int(account.get("account_number", 0)),
                    "sequence": int(account.get("sequence", 0)),
                }
    except Exception as e:
        logger.error(f"Failed to get Osmosis account info: {e}")

    return None


async def _get_osmosis_swap_route(
    from_asset: str, to_asset: str, amount_in: int
) -> Optional[dict]:
    """Get optimal swap route from Osmosis router."""
    from_token = OSMOSIS_TOKENS.get(from_asset.upper())
    to_token = OSMOSIS_TOKENS.get(to_asset.upper())

    if not from_token or not to_token:
        return None

    try:
        # Use Osmosis SQS (Smart Query Service) for optimal routing
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"https://sqs.osmosis.zone/router/quote",
                params={
                    "tokenIn": f"{amount_in}{from_token['denom']}",
                    "tokenOutDenom": to_token["denom"],
                },
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "routes": data.get("route", []),
                    "amount_out": data.get("amount_out", "0"),
                    "price_impact": data.get("price_impact", "0"),
                }
    except Exception as e:
        logger.error(f"Failed to get Osmosis route: {e}")

    # Fallback to direct pool if SQS fails
    pool_id = OSMOSIS_POOLS.get((from_asset.upper(), to_asset.upper()))
    if pool_id:
        return {
            "routes": [{"pool_id": str(pool_id), "token_out_denom": to_token["denom"]}],
            "amount_out": "0",  # Will be estimated
            "direct_pool": True,
        }

    return None


def _build_osmosis_swap_msg(
    sender: str,
    token_in_denom: str,
    token_in_amount: str,
    token_out_denom: str,
    token_out_min_amount: str,
    routes: list[dict],
) -> dict:
    """Build MsgSwapExactAmountIn message for Osmosis.

    Uses Amino JSON format for legacy broadcast compatibility.
    """
    # Build routes array
    osmosis_routes = []
    for route in routes:
        osmosis_routes.append({
            "pool_id": str(route.get("pool_id", "1")),
            "token_out_denom": route.get("token_out_denom", token_out_denom),
        })

    # If no routes provided, use simple direct route
    if not osmosis_routes:
        pool_id = "1"  # Default ATOM/OSMO pool
        osmosis_routes = [{"pool_id": pool_id, "token_out_denom": token_out_denom}]

    # Use Amino type name for legacy broadcast
    return {
        "type": "osmosis/poolmanager/swap-exact-amount-in",
        "value": {
            "sender": sender,
            "routes": osmosis_routes,
            "token_in": {
                "denom": token_in_denom,
                "amount": token_in_amount,
            },
            "token_out_min_amount": token_out_min_amount,
        },
    }


def _sign_cosmos_transaction(
    private_key: bytes,
    public_key: bytes,
    chain_id: str,
    account_number: int,
    sequence: int,
    messages: list[dict],
    fee_amount: str = "10000",
    fee_denom: str = "uosmo",
    gas_limit: int = 500000,
    memo: str = "",
) -> Optional[str]:
    """Sign a Cosmos transaction and return the signed tx bytes in base64.

    Uses Direct (protobuf) signing mode.
    """
    try:
        import base64
        import hashlib
        import json

        from ecdsa import SECP256k1, SigningKey

        # For Cosmos, we need to use Amino JSON signing for simpler implementation
        # This is the legacy signing mode but still widely supported

        # Build the sign doc (Amino JSON)
        sign_doc = {
            "account_number": str(account_number),
            "chain_id": chain_id,
            "fee": {
                "amount": [{"amount": fee_amount, "denom": fee_denom}],
                "gas": str(gas_limit),
            },
            "memo": memo,
            "msgs": messages,
            "sequence": str(sequence),
        }

        # Canonical JSON (sorted keys, no whitespace)
        sign_bytes = json.dumps(sign_doc, sort_keys=True, separators=(",", ":")).encode()

        # Sign with secp256k1
        signing_key = SigningKey.from_string(private_key, curve=SECP256k1)
        signature = signing_key.sign_digest(
            hashlib.sha256(sign_bytes).digest(),
            sigencode=lambda r, s, order: r.to_bytes(32, "big") + s.to_bytes(32, "big"),
        )

        # Build the broadcast-ready transaction
        # For Amino, we wrap in a StdTx structure
        tx = {
            "tx": {
                "msg": messages,
                "fee": {
                    "amount": [{"amount": fee_amount, "denom": fee_denom}],
                    "gas": str(gas_limit),
                },
                "signatures": [
                    {
                        "pub_key": {
                            "type": "tendermint/PubKeySecp256k1",
                            "value": base64.b64encode(public_key).decode(),
                        },
                        "signature": base64.b64encode(signature).decode(),
                    }
                ],
                "memo": memo,
            },
            "mode": "sync",
        }

        return json.dumps(tx)

    except Exception as e:
        logger.error(f"Failed to sign Cosmos transaction: {e}")
        return None


async def _broadcast_osmosis_tx(signed_tx_json: str) -> Optional[str]:
    """Broadcast signed transaction to Osmosis network.

    Uses the legacy /txs endpoint for Amino JSON transactions.
    """
    import json

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Use legacy /txs endpoint for Amino JSON format
            response = await client.post(
                f"{OSMOSIS_LCD}/txs",
                content=signed_tx_json,
                headers={"Content-Type": "application/json"},
            )

            logger.info(f"Osmosis broadcast response: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                logger.info(f"Osmosis broadcast result: {data}")

                # Check for success
                if data.get("code") is None or data.get("code") == 0:
                    txhash = data.get("txhash") or data.get("hash")
                    if txhash:
                        return txhash

                # Log any error
                raw_log = data.get("raw_log") or data.get("log")
                if raw_log:
                    logger.error(f"Osmosis tx failed: {raw_log}")
            else:
                # Try to parse error
                try:
                    error_data = response.json()
                    logger.error(f"Osmosis broadcast error: {error_data}")
                except Exception:
                    logger.error(f"Osmosis broadcast failed: {response.text[:500]}")

    except Exception as e:
        logger.error(f"Failed to broadcast Osmosis tx: {e}")

    return None


async def execute_cosmos_swap(
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    quote_data: Optional[dict] = None,
) -> SwapExecutionResult:
    """Execute a swap on Osmosis DEX.

    Osmosis is the primary DEX for Cosmos ecosystem tokens.
    Uses MsgSwapExactAmountIn with optimal routing.
    """
    logger.info(f"Executing Osmosis swap: {amount} {from_asset} -> {to_asset}")

    # Validate tokens
    from_token = OSMOSIS_TOKENS.get(from_asset.upper())
    to_token = OSMOSIS_TOKENS.get(to_asset.upper())

    if not from_token:
        return SwapExecutionResult(
            success=False,
            error=f"Token {from_asset} not supported on Osmosis.\n\n"
                  f"Supported tokens: {', '.join(OSMOSIS_TOKENS.keys())}",
        )

    if not to_token:
        return SwapExecutionResult(
            success=False,
            error=f"Token {to_asset} not supported on Osmosis.\n\n"
                  f"Supported tokens: {', '.join(OSMOSIS_TOKENS.keys())}",
        )

    try:
        # Step 1: Get keypair
        keypair = await get_osmosis_keypair()
        if not keypair:
            return SwapExecutionResult(
                success=False,
                error="Could not derive Osmosis wallet. Check your seed phrase.",
            )

        private_key, public_key, sender_address = keypair
        logger.info(f"Using Osmosis address: {sender_address}")

        # Step 2: Get account info (for signing)
        account_info = await _get_osmosis_account_info(sender_address)
        if not account_info:
            return SwapExecutionResult(
                success=False,
                error="Could not fetch Osmosis account info. "
                      "Make sure the account exists and has some OSMO for fees.",
            )

        # Step 3: Calculate amounts
        from_decimals = from_token["decimals"]
        to_decimals = to_token["decimals"]
        amount_in = int(amount * (10 ** from_decimals))

        # Step 4: Get optimal swap route
        route_info = await _get_osmosis_swap_route(
            from_asset, to_asset, amount_in
        )

        if not route_info:
            return SwapExecutionResult(
                success=False,
                error=f"Could not find swap route for {from_asset} -> {to_asset}",
            )

        # Calculate minimum output (with 1% slippage)
        expected_out = route_info.get("amount_out", "0")
        if expected_out and int(expected_out) > 0:
            min_out = int(int(expected_out) * 0.99)
        else:
            # If no expected output, use quote data or estimate
            if quote_data and "to_amount" in quote_data:
                expected_decimal = Decimal(str(quote_data["to_amount"]))
                min_out = int(expected_decimal * (10 ** to_decimals) * Decimal("0.99"))
            else:
                # Very conservative estimate - may fail if slippage is too high
                min_out = 1

        # Step 5: Build swap message
        swap_msg = _build_osmosis_swap_msg(
            sender=sender_address,
            token_in_denom=from_token["denom"],
            token_in_amount=str(amount_in),
            token_out_denom=to_token["denom"],
            token_out_min_amount=str(min_out),
            routes=route_info.get("routes", []),
        )

        # Step 6: Sign transaction
        signed_tx = _sign_cosmos_transaction(
            private_key=private_key,
            public_key=public_key,
            chain_id=OSMOSIS_CHAIN_ID,
            account_number=account_info["account_number"],
            sequence=account_info["sequence"],
            messages=[swap_msg],
            fee_amount="25000",  # 0.025 OSMO
            fee_denom="uosmo",
            gas_limit=500000,
            memo="Swaperex",
        )

        if not signed_tx:
            return SwapExecutionResult(
                success=False,
                error="Failed to sign Osmosis transaction.",
            )

        # Step 7: Broadcast transaction
        txid = await _broadcast_osmosis_tx(signed_tx)

        if txid:
            to_amount = Decimal(expected_out or min_out) / Decimal(10 ** to_decimals)
            return SwapExecutionResult(
                success=True,
                txid=txid,
                from_amount=str(amount),
                to_amount=str(to_amount),
            )
        else:
            return SwapExecutionResult(
                success=False,
                error="Failed to broadcast transaction to Osmosis network.\n\n"
                      "This could be due to:\n"
                      "- Insufficient OSMO for gas fees\n"
                      "- Insufficient token balance\n"
                      "- Slippage exceeded\n\n"
                      "Try again or use https://app.osmosis.zone directly.",
            )

    except Exception as e:
        logger.error(f"Osmosis swap failed: {e}")
        return SwapExecutionResult(
            success=False,
            error=f"Osmosis swap error: {str(e)}",
        )


# ============ NEAR SWAP EXECUTION ============

NEAR_RPC = "https://rpc.mainnet.near.org"
REF_FINANCE_CONTRACT = "v2.ref-finance.near"
WRAP_NEAR_CONTRACT = "wrap.near"

# NEAR token contracts
NEAR_TOKENS = {
    "NEAR": {"contract": "wrap.near", "decimals": 24},  # wNEAR for swaps
    "WNEAR": {"contract": "wrap.near", "decimals": 24},
    "USDC": {"contract": "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", "decimals": 6},
    "USDT": {"contract": "usdt.tether-token.near", "decimals": 6},
    "DAI": {"contract": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near", "decimals": 18},
    "AURORA": {"contract": "auroratoken.bridge.near", "decimals": 18},
    "REF": {"contract": "token.v2.ref-finance.near", "decimals": 18},
    "STNEAR": {"contract": "meta-pool.near", "decimals": 24},
}


async def get_near_keypair() -> Optional[tuple[bytes, bytes, str]]:
    """Derive NEAR keypair from seed phrase.

    Returns:
        Tuple of (private_key, public_key, implicit_address) or None
    """
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
        # NEAR uses path m/44'/397'/0'
        derived = bip32_ctx.DerivePath("44'/397'/0'")

        private_key = derived.PrivateKey().Raw().ToBytes()

        # Get raw public key (32 bytes for ed25519)
        pubkey_bytes = derived.PublicKey().RawCompressed().ToBytes()
        if len(pubkey_bytes) == 33 and pubkey_bytes[0] == 0:
            pubkey_bytes = pubkey_bytes[1:]

        # NEAR implicit address is hex of public key (64 characters)
        address = pubkey_bytes.hex().lower()

        return (private_key, pubkey_bytes, address)

    except Exception as e:
        logger.error(f"Failed to derive NEAR key: {e}")
        return None


async def _get_near_access_key(account_id: str, public_key: bytes) -> Optional[dict]:
    """Get NEAR access key info (nonce) for signing."""
    try:
        import base64

        # NEAR public key format: ed25519:base58(pubkey)
        import base58
        pk_b58 = base58.b58encode(public_key).decode()
        pk_str = f"ed25519:{pk_b58}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                NEAR_RPC,
                json={
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "query",
                    "params": {
                        "request_type": "view_access_key",
                        "finality": "final",
                        "account_id": account_id,
                        "public_key": pk_str,
                    },
                },
            )

            if response.status_code == 200:
                data = response.json()
                result = data.get("result", {})
                if "nonce" in result:
                    return {
                        "nonce": result["nonce"],
                        "block_hash": result.get("block_hash"),
                    }

    except Exception as e:
        logger.error(f"Failed to get NEAR access key: {e}")

    return None


async def _get_near_block_hash() -> Optional[bytes]:
    """Get recent block hash for transaction."""
    try:
        import base58

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                NEAR_RPC,
                json={
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "block",
                    "params": {"finality": "final"},
                },
            )

            if response.status_code == 200:
                data = response.json()
                block_hash_b58 = data.get("result", {}).get("header", {}).get("hash")
                if block_hash_b58:
                    return base58.b58decode(block_hash_b58)

    except Exception as e:
        logger.error(f"Failed to get NEAR block hash: {e}")

    return None


def _serialize_near_action(action: dict) -> bytes:
    """Serialize a NEAR action using borsh encoding."""
    action_type = action.get("type")

    if action_type == "FunctionCall":
        # FunctionCall action index is 2
        result = (2).to_bytes(1, "little")

        # Method name (u32 len + bytes)
        method_name = action["method_name"].encode()
        result += len(method_name).to_bytes(4, "little") + method_name

        # Args (u32 len + bytes)
        args = action["args"]
        if isinstance(args, str):
            args = args.encode()
        result += len(args).to_bytes(4, "little") + args

        # Gas (u64)
        gas = action.get("gas", 30_000_000_000_000)  # 30 TGas default
        result += gas.to_bytes(8, "little")

        # Deposit (u128)
        deposit = action.get("deposit", 0)
        result += deposit.to_bytes(16, "little")

        return result

    elif action_type == "Transfer":
        # Transfer action index is 3
        result = (3).to_bytes(1, "little")
        # Amount (u128)
        amount = action.get("amount", 0)
        result += amount.to_bytes(16, "little")
        return result

    return b""


def _serialize_near_transaction(
    signer_id: str,
    public_key: bytes,
    nonce: int,
    receiver_id: str,
    block_hash: bytes,
    actions: list[dict],
) -> bytes:
    """Serialize a NEAR transaction using borsh encoding."""
    import base58

    result = b""

    # Signer ID (string: u32 len + bytes)
    signer_bytes = signer_id.encode()
    result += len(signer_bytes).to_bytes(4, "little") + signer_bytes

    # Public key (enum variant 0 for ed25519 + 32 bytes)
    result += (0).to_bytes(1, "little")  # ED25519 = 0
    result += public_key

    # Nonce (u64)
    result += nonce.to_bytes(8, "little")

    # Receiver ID (string)
    receiver_bytes = receiver_id.encode()
    result += len(receiver_bytes).to_bytes(4, "little") + receiver_bytes

    # Block hash (32 bytes)
    result += block_hash

    # Actions (vector: u32 len + serialized actions)
    result += len(actions).to_bytes(4, "little")
    for action in actions:
        result += _serialize_near_action(action)

    return result


async def _sign_and_send_near_tx(
    private_key: bytes,
    public_key: bytes,
    signer_id: str,
    receiver_id: str,
    actions: list[dict],
) -> Optional[str]:
    """Sign and broadcast a NEAR transaction."""
    try:
        import base58
        import base64
        import hashlib
        from nacl.signing import SigningKey

        # Get current nonce
        access_key = await _get_near_access_key(signer_id, public_key)
        if not access_key:
            # Account might not exist yet - use nonce 0
            nonce = 1
        else:
            nonce = access_key["nonce"] + 1

        # Get block hash
        block_hash = await _get_near_block_hash()
        if not block_hash:
            logger.error("Could not get NEAR block hash")
            return None

        # Serialize transaction
        tx_bytes = _serialize_near_transaction(
            signer_id=signer_id,
            public_key=public_key,
            nonce=nonce,
            receiver_id=receiver_id,
            block_hash=block_hash,
            actions=actions,
        )

        # Hash transaction
        tx_hash = hashlib.sha256(tx_bytes).digest()

        # Sign with ed25519
        signing_key = SigningKey(private_key)
        signed = signing_key.sign(tx_hash)
        signature = signed.signature  # 64 bytes

        # Create signed transaction (transaction + signature)
        # Signature: enum variant 0 (ED25519) + 64 bytes signature
        signed_tx = tx_bytes + (0).to_bytes(1, "little") + signature

        # Broadcast
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                NEAR_RPC,
                json={
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "broadcast_tx_commit",
                    "params": [base64.b64encode(signed_tx).decode()],
                },
            )

            if response.status_code == 200:
                data = response.json()

                if "error" in data:
                    logger.error(f"NEAR tx error: {data['error']}")
                    return None

                result = data.get("result", {})
                tx_hash = result.get("transaction", {}).get("hash")

                if result.get("status", {}).get("SuccessValue") is not None:
                    return tx_hash
                elif result.get("status", {}).get("SuccessReceiptId"):
                    return tx_hash
                elif "Failure" in str(result.get("status", {})):
                    logger.error(f"NEAR tx failed: {result.get('status')}")
                    return None
                else:
                    # Transaction might still succeed
                    return tx_hash

    except Exception as e:
        logger.error(f"Failed to sign/send NEAR tx: {e}")

    return None


async def _get_ref_finance_pool(
    from_token: str, to_token: str
) -> Optional[dict]:
    """Get Ref Finance pool for token pair."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get all pools
            response = await client.get(
                "https://indexer.ref.finance/list-pools"
            )

            if response.status_code == 200:
                pools = response.json()

                from_contract = NEAR_TOKENS.get(from_token.upper(), {}).get("contract")
                to_contract = NEAR_TOKENS.get(to_token.upper(), {}).get("contract")

                if not from_contract or not to_contract:
                    return None

                # Find matching pool
                for pool in pools:
                    token_ids = pool.get("token_account_ids", [])
                    if from_contract in token_ids and to_contract in token_ids:
                        return {
                            "pool_id": pool.get("id"),
                            "token_ids": token_ids,
                            "amounts": pool.get("amounts", {}),
                            "total_fee": pool.get("total_fee", 30),  # basis points
                        }

    except Exception as e:
        logger.error(f"Failed to get Ref Finance pool: {e}")

    return None


async def execute_near_swap(
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    quote_data: Optional[dict] = None,
) -> SwapExecutionResult:
    """Execute a swap on NEAR via Ref Finance.

    Ref Finance is the main DEX on NEAR Protocol.
    Uses ft_transfer_call to swap tokens through pools.
    """
    logger.info(f"Executing NEAR swap: {amount} {from_asset} -> {to_asset}")

    # Validate tokens
    from_token = NEAR_TOKENS.get(from_asset.upper())
    to_token = NEAR_TOKENS.get(to_asset.upper())

    if not from_token:
        return SwapExecutionResult(
            success=False,
            error=f"Token {from_asset} not supported on NEAR.\n\n"
                  f"Supported tokens: {', '.join(NEAR_TOKENS.keys())}",
        )

    if not to_token:
        return SwapExecutionResult(
            success=False,
            error=f"Token {to_asset} not supported on NEAR.\n\n"
                  f"Supported tokens: {', '.join(NEAR_TOKENS.keys())}",
        )

    try:
        # Step 1: Get keypair
        keypair = await get_near_keypair()
        if not keypair:
            return SwapExecutionResult(
                success=False,
                error="Could not derive NEAR wallet. Check your seed phrase.",
            )

        private_key, public_key, account_id = keypair
        logger.info(f"Using NEAR account: {account_id}")

        # Step 2: Get pool info
        pool_info = await _get_ref_finance_pool(from_asset, to_asset)
        if not pool_info:
            return SwapExecutionResult(
                success=False,
                error=f"No Ref Finance pool found for {from_asset} -> {to_asset}",
            )

        pool_id = pool_info["pool_id"]
        logger.info(f"Using Ref Finance pool {pool_id}")

        # Step 3: Calculate amounts
        from_decimals = from_token["decimals"]
        to_decimals = to_token["decimals"]
        amount_in = int(amount * (10 ** from_decimals))

        # Estimate output (with 1% slippage)
        if quote_data and "to_amount" in quote_data:
            expected_out = int(Decimal(str(quote_data["to_amount"])) * (10 ** to_decimals))
        else:
            # Simple estimate based on pool
            expected_out = amount_in  # 1:1 estimate, actual will differ
        min_out = int(expected_out * 0.99)

        # Step 4: Handle NEAR -> wNEAR wrapping if needed
        if from_asset.upper() == "NEAR":
            # First wrap NEAR to wNEAR
            wrap_actions = [{
                "type": "FunctionCall",
                "method_name": "near_deposit",
                "args": "{}",
                "gas": 30_000_000_000_000,
                "deposit": amount_in,
            }]

            wrap_txid = await _sign_and_send_near_tx(
                private_key=private_key,
                public_key=public_key,
                signer_id=account_id,
                receiver_id=WRAP_NEAR_CONTRACT,
                actions=wrap_actions,
            )

            if not wrap_txid:
                return SwapExecutionResult(
                    success=False,
                    error="Failed to wrap NEAR to wNEAR",
                )

            logger.info(f"Wrapped NEAR: {wrap_txid}")

        # Step 5: Execute swap via ft_transfer_call
        import json

        # Ref Finance swap message format
        swap_msg = json.dumps({
            "actions": [{
                "pool_id": pool_id,
                "token_in": from_token["contract"],
                "amount_in": str(amount_in),
                "token_out": to_token["contract"],
                "min_amount_out": str(min_out),
            }]
        })

        swap_actions = [{
            "type": "FunctionCall",
            "method_name": "ft_transfer_call",
            "args": json.dumps({
                "receiver_id": REF_FINANCE_CONTRACT,
                "amount": str(amount_in),
                "msg": swap_msg,
            }),
            "gas": 100_000_000_000_000,  # 100 TGas for swap
            "deposit": 1,  # 1 yoctoNEAR for storage
        }]

        # Call ft_transfer_call on the source token contract
        txid = await _sign_and_send_near_tx(
            private_key=private_key,
            public_key=public_key,
            signer_id=account_id,
            receiver_id=from_token["contract"],
            actions=swap_actions,
        )

        if txid:
            to_amount = Decimal(expected_out) / Decimal(10 ** to_decimals)
            return SwapExecutionResult(
                success=True,
                txid=txid,
                from_amount=str(amount),
                to_amount=str(to_amount),
            )
        else:
            return SwapExecutionResult(
                success=False,
                error="Failed to execute swap on Ref Finance.\n\n"
                      "This could be due to:\n"
                      "- Insufficient NEAR for gas fees\n"
                      "- Insufficient token balance\n"
                      "- Token not registered with Ref Finance\n\n"
                      "Try again or use https://app.ref.finance directly.",
            )

    except Exception as e:
        logger.error(f"NEAR swap failed: {e}")
        return SwapExecutionResult(
            success=False,
            error=f"NEAR swap error: {str(e)}",
        )


# ============ THORCHAIN CROSS-CHAIN SWAP EXECUTION ============

THORCHAIN_API = "https://thornode.ninerealms.com/thorchain"
THORSWAP_API = "https://api.thorswap.net/aggregator"

# THORChain asset notation: CHAIN.SYMBOL
THORCHAIN_ASSETS = {
    # Native assets
    "BTC": "BTC.BTC",
    "ETH": "ETH.ETH",
    "BNB": "BNB.BNB",
    "AVAX": "AVAX.AVAX",
    "ATOM": "GAIA.ATOM",
    "DOGE": "DOGE.DOGE",
    "LTC": "LTC.LTC",
    "BCH": "BCH.BCH",
    "RUNE": "THOR.RUNE",
    # ERC20 tokens
    "USDT": "ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "USDC": "ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
}

# Chain identifiers for address derivation
THORCHAIN_CHAINS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "BNB": "bsc",
    "AVAX": "avalanche",
    "ATOM": "cosmos",
    "DOGE": "dogecoin",
    "LTC": "litecoin",
    "BCH": "bitcoin-cash",
}


async def execute_thorchain_swap(
    from_asset: str,
    to_asset: str,
    amount: Decimal,
    quote_data: Optional[dict] = None,
) -> SwapExecutionResult:
    """Execute a cross-chain swap via THORChain.

    THORChain swaps work by:
    1. Getting a quote with inbound address
    2. Sending native tokens to inbound address with memo
    3. THORChain nodes observe and execute the swap
    """
    logger.info(f"Executing THORChain swap: {amount} {from_asset} -> {to_asset}")

    # Convert asset symbols to THORChain notation
    from_thor = THORCHAIN_ASSETS.get(from_asset.upper())
    to_thor = THORCHAIN_ASSETS.get(to_asset.upper())

    if not from_thor or not to_thor:
        return SwapExecutionResult(
            success=False,
            error=f"THORChain doesn't support {from_asset} or {to_asset}.\n\n"
                  f"Supported assets: {', '.join(THORCHAIN_ASSETS.keys())}",
        )

    try:
        # Step 1: Get sender address for the source chain
        from_chain = from_asset.upper()
        sender_address = await _get_chain_address(from_chain)
        if not sender_address:
            return SwapExecutionResult(
                success=False,
                error=f"Could not derive {from_chain} address for swap",
            )

        # Step 2: Get recipient address for destination chain
        to_chain = to_asset.upper()
        recipient_address = await _get_chain_address(to_chain)
        if not recipient_address:
            return SwapExecutionResult(
                success=False,
                error=f"Could not derive {to_chain} address for swap",
            )

        # Step 3: Get swap quote from THORChain
        # Determine decimals for amount conversion
        from_decimals = 8  # Most chains use 8 decimals for THORChain
        if from_chain in ("ETH", "AVAX"):
            from_decimals = 18
        elif from_chain == "BNB":
            from_decimals = 8

        amount_base = int(amount * (10 ** from_decimals))

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get quote from THORNode
            quote_response = await client.get(
                f"{THORCHAIN_API}/quote/swap",
                params={
                    "from_asset": from_thor,
                    "to_asset": to_thor,
                    "amount": str(amount_base),
                    "destination": recipient_address,
                },
            )

            if quote_response.status_code != 200:
                error_text = quote_response.text
                logger.error(f"THORChain quote error: {error_text}")
                return SwapExecutionResult(
                    success=False,
                    error=f"THORChain quote failed: {error_text[:200]}",
                )

            quote = quote_response.json()
            logger.info(f"THORChain quote: {quote}")

            # Extract quote details
            inbound_address = quote.get("inbound_address")
            memo = quote.get("memo")
            expected_amount_out = quote.get("expected_amount_out", "0")

            if not inbound_address or not memo:
                return SwapExecutionResult(
                    success=False,
                    error="THORChain quote missing inbound_address or memo",
                )

            # Step 4: Execute the swap by sending to inbound address
            # The memo tells THORChain what to do with the funds
            txid = await _send_to_thorchain_vault(
                chain=from_chain,
                inbound_address=inbound_address,
                amount=amount,
                memo=memo,
                sender_address=sender_address,
            )

            if txid:
                # Calculate expected output
                to_decimals = 8
                if to_chain in ("ETH", "AVAX"):
                    to_decimals = 18
                to_amount = Decimal(expected_amount_out) / Decimal(10 ** to_decimals)

                return SwapExecutionResult(
                    success=True,
                    txid=txid,
                    from_amount=str(amount),
                    to_amount=str(to_amount),
                )
            else:
                return SwapExecutionResult(
                    success=False,
                    error="Failed to send transaction to THORChain vault",
                )

    except Exception as e:
        logger.error(f"THORChain swap failed: {e}")
        return SwapExecutionResult(success=False, error=str(e))


async def _get_chain_address(chain: str) -> Optional[str]:
    """Get wallet address for a specific blockchain.

    Derives address from seed phrase for the given chain.
    """
    seed_phrase = (
        os.environ.get("SEED_PHRASE")
        or os.environ.get("WALLET_SEED_PHRASE")
        or os.environ.get("MNEMONIC")
    )

    if not seed_phrase:
        return None

    try:
        # EVM chains (ETH, BNB, AVAX) share the same address
        if chain in ("ETH", "BNB", "AVAX"):
            from bip_utils import Bip39SeedGenerator, Bip32Secp256k1, EthAddrEncoder
            seed = Bip39SeedGenerator(seed_phrase).Generate()
            bip32_ctx = Bip32Secp256k1.FromSeed(seed)
            account_ctx = bip32_ctx.DerivePath("44'/60'/0'/0/0")
            pubkey = account_ctx.PublicKey().RawUncompressed().ToBytes()
            return EthAddrEncoder.EncodeKey(pubkey)

        # Cosmos/ATOM
        if chain == "ATOM":
            from bip_utils import Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
            seed = Bip39SeedGenerator(seed_phrase).Generate()
            bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.COSMOS)
            account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)
            return account.PublicKey().ToAddress()

        # Bitcoin and UTXO chains (BTC, LTC, DOGE, BCH)
        if chain in ("BTC", "LTC", "DOGE", "BCH"):
            from bip_utils import Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
            coin_map = {
                "BTC": Bip44Coins.BITCOIN,
                "LTC": Bip44Coins.LITECOIN,
                "DOGE": Bip44Coins.DOGECOIN,
                "BCH": Bip44Coins.BITCOIN_CASH,
            }
            coin = coin_map.get(chain, Bip44Coins.BITCOIN)
            seed = Bip39SeedGenerator(seed_phrase).Generate()
            bip44_ctx = Bip44.FromSeed(seed, coin)
            account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)
            return account.PublicKey().ToAddress()

        # RUNE (THORChain native)
        if chain == "RUNE":
            from bip_utils import Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
            # THORChain uses coin type 931
            seed = Bip39SeedGenerator(seed_phrase).Generate()
            bip44_ctx = Bip44.FromSeed(seed, Bip44Coins.COSMOS)  # Uses Cosmos-like derivation
            account = bip44_ctx.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT).AddressIndex(0)
            # Convert to thor prefix
            address = account.PublicKey().ToAddress()
            if address.startswith("cosmos"):
                address = "thor" + address[6:]
            return address

    except Exception as e:
        logger.error(f"Failed to derive {chain} address: {e}")

    return None


async def _send_to_thorchain_vault(
    chain: str,
    inbound_address: str,
    amount: Decimal,
    memo: str,
    sender_address: str,
) -> Optional[str]:
    """Send tokens to THORChain vault with memo.

    This initiates the cross-chain swap.
    """
    logger.info(f"Sending {amount} {chain} to THORChain vault {inbound_address}")
    logger.info(f"Memo: {memo}")

    try:
        # For EVM chains (ETH, BNB, AVAX), use web3-style transaction
        if chain in ("ETH", "BNB", "AVAX"):
            return await _send_evm_to_thorchain(
                chain=chain,
                to_address=inbound_address,
                amount=amount,
                memo=memo,
            )

        # For ATOM, use Cosmos transaction
        if chain == "ATOM":
            # Cosmos transactions require protobuf - not yet implemented
            logger.warning("ATOM -> THORChain not yet implemented")
            return None

        # For UTXO chains (BTC, LTC, DOGE, BCH)
        if chain in ("BTC", "LTC", "DOGE", "BCH"):
            # UTXO transactions require special handling - not yet implemented
            logger.warning(f"{chain} -> THORChain not yet implemented")
            return None

    except Exception as e:
        logger.error(f"Failed to send to THORChain vault: {e}")

    return None


async def _send_evm_to_thorchain(
    chain: str,
    to_address: str,
    amount: Decimal,
    memo: str,
) -> Optional[str]:
    """Send EVM native token to THORChain vault with memo in data field."""
    from eth_account import Account

    # Get private key
    private_key = await get_private_key_from_seed(chain.lower())
    if not private_key:
        return None

    account = Account.from_key(private_key)

    # Chain-specific settings
    chain_settings = {
        "ETH": {"rpc": RPC_ENDPOINTS["ethereum"], "chain_id": 1},
        "BNB": {"rpc": RPC_ENDPOINTS["bsc"], "chain_id": 56},
        "AVAX": {"rpc": RPC_ENDPOINTS["avalanche"], "chain_id": 43114},
    }

    settings = chain_settings.get(chain)
    if not settings:
        return None

    rpc_url = settings["rpc"]
    chain_id = settings["chain_id"]

    try:
        from web3 import Web3

        # Convert amount to wei (18 decimals for EVM)
        amount_wei = int(amount * (10 ** 18))

        # Get nonce and gas price
        nonce = await _get_nonce(account.address, rpc_url)
        gas_price = await _get_gas_price(rpc_url)

        # Build transaction with memo in data field
        # THORChain reads the memo from the transaction data
        memo_hex = "0x" + memo.encode().hex()

        tx = {
            "nonce": nonce,
            "gasPrice": gas_price,
            "gas": 80000,  # Standard transfer + memo
            "to": Web3.to_checksum_address(to_address),
            "value": amount_wei,
            "data": memo_hex,
            "chainId": chain_id,
        }

        # Sign transaction
        signed_tx = account.sign_transaction(tx)

        # Broadcast
        txid = await _broadcast_transaction(signed_tx.raw_transaction.hex(), rpc_url)

        if txid:
            logger.info(f"THORChain vault transaction broadcast: {txid}")
            return txid

    except Exception as e:
        logger.error(f"EVM to THORChain failed: {e}")

    return None
