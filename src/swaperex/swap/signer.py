"""Transaction signer for all supported chains.

Derives private keys from seed phrase and signs transactions for:
- EVM chains (ETH, BNB, LINK, HYPE)
- Solana (SOL)
- Cosmos (ATOM)
- Cardano (ADA)
- Bitcoin/Litecoin (BTC, LTC)
"""

import logging
from typing import Optional, Any
from decimal import Decimal

from swaperex.config import get_settings

logger = logging.getLogger(__name__)


class ChainSigner:
    """Base class for chain-specific transaction signing."""

    def __init__(self, seed_phrase: str):
        self.seed_phrase = seed_phrase

    def get_address(self, index: int = 0) -> str:
        """Get address at derivation index."""
        raise NotImplementedError

    def get_private_key(self, index: int = 0) -> Any:
        """Get private key at derivation index."""
        raise NotImplementedError


class EVMSigner(ChainSigner):
    """Signer for EVM-compatible chains (ETH, BNB, LINK, HYPE)."""

    # Class-level nonce cache to prevent race conditions
    _nonce_cache: dict[str, int] = {}
    _nonce_lock = None  # Will be initialized lazily

    def __init__(self, seed_phrase: str, rpc_url: str):
        super().__init__(seed_phrase)
        self.rpc_url = rpc_url
        self._web3 = None
        self._account = None

    @classmethod
    def _get_lock(cls):
        """Get or create thread lock for nonce management."""
        import threading
        if cls._nonce_lock is None:
            cls._nonce_lock = threading.Lock()
        return cls._nonce_lock

    @property
    def web3(self):
        """Lazy load web3 instance."""
        if self._web3 is None:
            from web3 import Web3
            self._web3 = Web3(Web3.HTTPProvider(self.rpc_url))
        return self._web3

    def _get_next_nonce(self, address: str) -> int:
        """Get next nonce for address with thread-safe caching.

        Prevents race condition where concurrent transactions get same nonce.
        Includes retry logic for RPC failures.
        """
        import time
        max_retries = 3

        with self._get_lock():
            chain_nonce = None
            last_error = None

            # Retry RPC call with exponential backoff
            for attempt in range(max_retries):
                try:
                    chain_nonce = self.web3.eth.get_transaction_count(address, 'pending')
                    break
                except Exception as e:
                    last_error = e
                    if attempt < max_retries - 1:
                        time.sleep(1 * (attempt + 1))  # 1s, 2s, 3s backoff
                        logger.warning(f"RPC error getting nonce (attempt {attempt + 1}): {e}")

            if chain_nonce is None:
                raise Exception(f"Failed to get nonce after {max_retries} attempts: {last_error}")

            # Get cached nonce (might be higher if we have pending txs)
            cached_nonce = self._nonce_cache.get(address, 0)

            # Use the higher of chain nonce or cached nonce
            next_nonce = max(chain_nonce, cached_nonce)

            # Update cache for next call
            self._nonce_cache[address] = next_nonce + 1

            return next_nonce

    def _reset_nonce_cache(self, address: str):
        """Reset nonce cache for address (call after confirmed tx)."""
        with self._get_lock():
            if address in self._nonce_cache:
                del self._nonce_cache[address]

    def get_private_key(self, index: int = 0) -> bytes:
        """Derive EVM private key from seed phrase."""
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )

        seed = Bip39SeedGenerator(self.seed_phrase).Generate()
        bip44 = Bip44.FromSeed(seed, Bip44Coins.ETHEREUM)
        account = bip44.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
        key = account.AddressIndex(index).PrivateKey().Raw().ToBytes()
        return key

    def get_address(self, index: int = 0) -> str:
        """Get EVM address at index."""
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )

        seed = Bip39SeedGenerator(self.seed_phrase).Generate()
        bip44 = Bip44.FromSeed(seed, Bip44Coins.ETHEREUM)
        account = bip44.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
        address = account.AddressIndex(index).PublicKey().ToAddress()
        return address

    def get_account(self, index: int = 0):
        """Get web3 account object."""
        from eth_account import Account
        private_key = self.get_private_key(index)
        return Account.from_key(private_key)

    async def wait_for_confirmation(
        self,
        tx_hash: str,
        timeout: int = 120,
        confirmations: int = 1,
    ) -> dict:
        """Wait for transaction to be confirmed.

        Args:
            tx_hash: Transaction hash to wait for
            timeout: Maximum seconds to wait
            confirmations: Number of block confirmations required

        Returns:
            Transaction receipt dict

        Raises:
            TimeoutError: If transaction not confirmed within timeout
            Exception: If transaction failed
        """
        import asyncio

        start_time = asyncio.get_event_loop().time()

        while True:
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > timeout:
                raise TimeoutError(f"Transaction {tx_hash} not confirmed after {timeout}s")

            try:
                receipt = self.web3.eth.get_transaction_receipt(tx_hash)
                if receipt is not None:
                    # Check if we have enough confirmations
                    current_block = self.web3.eth.block_number
                    tx_block = receipt['blockNumber']
                    confirms = current_block - tx_block + 1

                    if confirms >= confirmations:
                        # Check transaction status
                        if receipt['status'] == 0:
                            raise Exception(f"Transaction {tx_hash} failed (reverted)")
                        return dict(receipt)

            except Exception as e:
                if "not confirmed" not in str(e).lower() and "timeout" not in str(e).lower():
                    # Re-raise unexpected errors
                    if "failed" in str(e).lower() or "reverted" in str(e).lower():
                        raise

            # Wait before checking again
            await asyncio.sleep(2)

    async def sign_and_send_transaction(
        self,
        tx_params: dict,
        index: int = 0,
        wait_for_confirmation: bool = False,
        confirmation_timeout: int = 120,
    ) -> str:
        """Sign and send EVM transaction.

        Args:
            tx_params: Transaction parameters (to, value, data, gas, etc.)
            index: Derivation index
            wait_for_confirmation: Whether to wait for tx to be mined
            confirmation_timeout: Seconds to wait for confirmation

        Returns:
            Transaction hash
        """
        from eth_account import Account

        account = self.get_account(index)

        # Add from address if not present
        if 'from' not in tx_params:
            tx_params['from'] = account.address

        # Use thread-safe nonce management to prevent race conditions
        if 'nonce' not in tx_params:
            tx_params['nonce'] = self._get_next_nonce(account.address)

        if 'chainId' not in tx_params:
            tx_params['chainId'] = self.web3.eth.chain_id

        # Estimate gas if not provided
        if 'gas' not in tx_params:
            tx_params['gas'] = self.web3.eth.estimate_gas(tx_params)

        # Get gas price if not provided
        if 'gasPrice' not in tx_params and 'maxFeePerGas' not in tx_params:
            tx_params['gasPrice'] = self.web3.eth.gas_price

        # Sign transaction
        signed_tx = account.sign_transaction(tx_params)

        # Send transaction
        try:
            # web3.py 6.x uses raw_transaction, older versions use rawTransaction
            raw_tx = getattr(signed_tx, 'raw_transaction', None) or signed_tx.rawTransaction
            tx_hash = self.web3.eth.send_raw_transaction(raw_tx)
            tx_hash_hex = tx_hash.hex()

            # Optionally wait for confirmation
            if wait_for_confirmation:
                await self.wait_for_confirmation(tx_hash_hex, confirmation_timeout)

            return tx_hash_hex
        except Exception as e:
            # Reset nonce cache on failure so next tx gets fresh nonce
            self._reset_nonce_cache(account.address)
            raise

    def _get_uniswap_fee_tier(self, token_in: str, token_out: str) -> int:
        """Get optimal Uniswap V3 fee tier for token pair.

        Fee tiers:
        - 100 (0.01%): Very stable pairs (USDC/USDT, DAI/USDC)
        - 500 (0.05%): Stable pairs, stablecoin/major token
        - 3000 (0.3%): Standard pairs (most common)
        - 10000 (1%): Exotic/volatile pairs
        """
        # Stablecoin addresses (Ethereum mainnet)
        STABLECOINS = {
            "0xdAC17F958D2ee523a2206206994597C13D831ec7".lower(),  # USDT
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".lower(),  # USDC
            "0x6B175474E89094C44Da98b954EescdeCB5BE3e31f".lower(),  # DAI
        }

        # Major tokens that work well with 0.3%
        MAJOR_TOKENS = {
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".lower(),  # WETH
            "0x514910771AF9Ca656af840dff83E8264EcF986CA".lower(),  # LINK
        }

        token_in_lower = token_in.lower()
        token_out_lower = token_out.lower()

        # Stablecoin to stablecoin: use 0.01% or 0.05%
        if token_in_lower in STABLECOINS and token_out_lower in STABLECOINS:
            return 100  # 0.01%

        # Stablecoin to major token: use 0.05%
        if (token_in_lower in STABLECOINS and token_out_lower in MAJOR_TOKENS) or \
           (token_out_lower in STABLECOINS and token_in_lower in MAJOR_TOKENS):
            return 500  # 0.05%

        # Standard pairs (default)
        return 3000  # 0.3%

    async def swap_on_uniswap(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_amount_out: int,
        recipient: str,
        deadline: int,
        index: int = 0,
        fee_tier: Optional[int] = None,
    ) -> str:
        """Execute swap on Uniswap V3.

        Args:
            token_in: Input token address
            token_out: Output token address
            amount_in: Amount in smallest units
            min_amount_out: Minimum output amount (slippage protection)
            recipient: Address to receive output tokens
            deadline: Unix timestamp deadline
            index: Derivation index for signing
            fee_tier: Optional fee tier (100, 500, 3000, 10000). Auto-detected if None.
        """
        # Uniswap V3 SwapRouter address
        SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"

        # SwapRouter ABI (exactInputSingle)
        SWAP_ABI = [
            {
                "inputs": [
                    {
                        "components": [
                            {"name": "tokenIn", "type": "address"},
                            {"name": "tokenOut", "type": "address"},
                            {"name": "fee", "type": "uint24"},
                            {"name": "recipient", "type": "address"},
                            {"name": "deadline", "type": "uint256"},
                            {"name": "amountIn", "type": "uint256"},
                            {"name": "amountOutMinimum", "type": "uint256"},
                            {"name": "sqrtPriceLimitX96", "type": "uint160"},
                        ],
                        "name": "params",
                        "type": "tuple",
                    }
                ],
                "name": "exactInputSingle",
                "outputs": [{"name": "amountOut", "type": "uint256"}],
                "stateMutability": "payable",
                "type": "function",
            }
        ]

        contract = self.web3.eth.contract(
            address=self.web3.to_checksum_address(SWAP_ROUTER),
            abi=SWAP_ABI
        )

        # Auto-detect fee tier if not provided
        if fee_tier is None:
            fee_tier = self._get_uniswap_fee_tier(token_in, token_out)

        # Build swap params
        params = {
            "tokenIn": self.web3.to_checksum_address(token_in),
            "tokenOut": self.web3.to_checksum_address(token_out),
            "fee": fee_tier,
            "recipient": self.web3.to_checksum_address(recipient),
            "deadline": deadline,
            "amountIn": amount_in,
            "amountOutMinimum": min_amount_out,
            "sqrtPriceLimitX96": 0,
        }

        # Build transaction
        account = self.get_account(index)
        tx = contract.functions.exactInputSingle(params).build_transaction({
            'from': account.address,
            'nonce': self._get_next_nonce(account.address),  # Use thread-safe nonce
            'gas': 300000,
            'gasPrice': self.web3.eth.gas_price,
        })

        # If token_in is WETH, add value
        WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
        if token_in.lower() == WETH.lower():
            tx['value'] = amount_in

        # Wait for confirmation and verify transaction succeeded
        tx_hash = await self.sign_and_send_transaction(
            tx, index, wait_for_confirmation=True, confirmation_timeout=120
        )
        return tx_hash

    async def swap_on_pancakeswap(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_amount_out: int,
        recipient: str,
        deadline: int,
        index: int = 0,
    ) -> str:
        """Execute swap on PancakeSwap V2 (BSC).

        Args:
            token_in: Input token address (use WBNB address for native BNB)
            token_out: Output token address
            amount_in: Amount in smallest units (wei)
            min_amount_out: Minimum output amount (slippage protection)
            recipient: Address to receive output tokens
            deadline: Unix timestamp deadline
            index: Derivation index for signing
        """
        # PancakeSwap V2 Router on BSC
        ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E"
        WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"

        # PancakeSwap V2 Router ABI
        ROUTER_ABI = [
            {
                "inputs": [
                    {"name": "amountOutMin", "type": "uint256"},
                    {"name": "path", "type": "address[]"},
                    {"name": "to", "type": "address"},
                    {"name": "deadline", "type": "uint256"},
                ],
                "name": "swapExactETHForTokens",
                "outputs": [{"name": "amounts", "type": "uint256[]"}],
                "stateMutability": "payable",
                "type": "function",
            },
            {
                "inputs": [
                    {"name": "amountIn", "type": "uint256"},
                    {"name": "amountOutMin", "type": "uint256"},
                    {"name": "path", "type": "address[]"},
                    {"name": "to", "type": "address"},
                    {"name": "deadline", "type": "uint256"},
                ],
                "name": "swapExactTokensForETH",
                "outputs": [{"name": "amounts", "type": "uint256[]"}],
                "stateMutability": "nonpayable",
                "type": "function",
            },
            {
                "inputs": [
                    {"name": "amountIn", "type": "uint256"},
                    {"name": "amountOutMin", "type": "uint256"},
                    {"name": "path", "type": "address[]"},
                    {"name": "to", "type": "address"},
                    {"name": "deadline", "type": "uint256"},
                ],
                "name": "swapExactTokensForTokens",
                "outputs": [{"name": "amounts", "type": "uint256[]"}],
                "stateMutability": "nonpayable",
                "type": "function",
            },
        ]

        contract = self.web3.eth.contract(
            address=self.web3.to_checksum_address(ROUTER),
            abi=ROUTER_ABI
        )

        account = self.get_account(index)
        token_in_checksum = self.web3.to_checksum_address(token_in)
        token_out_checksum = self.web3.to_checksum_address(token_out)
        recipient_checksum = self.web3.to_checksum_address(recipient)

        # Determine swap type based on tokens
        is_native_in = token_in.lower() == WBNB.lower()
        is_native_out = token_out.lower() == WBNB.lower()

        path = [token_in_checksum, token_out_checksum]

        # BSC gas price cap: 5 Gwei max (normal is 3-5 Gwei)
        gas_price = min(self.web3.eth.gas_price, 5_000_000_000)

        if is_native_in:
            # BNB -> Token: swapExactETHForTokens
            tx = contract.functions.swapExactETHForTokens(
                min_amount_out,
                path,
                recipient_checksum,
                deadline,
            ).build_transaction({
                'from': account.address,
                'value': amount_in,
                'nonce': self._get_next_nonce(account.address),
                'gas': 300000,  # Higher gas for complex DEX swaps
                'gasPrice': gas_price,
            })
        elif is_native_out:
            # Token -> BNB: swapExactTokensForETH
            # First approve router
            await self._approve_token_for_router(token_in, amount_in, ROUTER, index)

            tx = contract.functions.swapExactTokensForETH(
                amount_in,
                min_amount_out,
                path,
                recipient_checksum,
                deadline,
            ).build_transaction({
                'from': account.address,
                'nonce': self._get_next_nonce(account.address),
                'gas': 300000,  # Higher gas for complex DEX swaps
                'gasPrice': gas_price,
            })
        else:
            # Token -> Token: swapExactTokensForTokens
            # First approve router
            await self._approve_token_for_router(token_in, amount_in, ROUTER, index)

            tx = contract.functions.swapExactTokensForTokens(
                amount_in,
                min_amount_out,
                path,
                recipient_checksum,
                deadline,
            ).build_transaction({
                'from': account.address,
                'nonce': self._get_next_nonce(account.address),
                'gas': 300000,  # Higher gas for complex DEX swaps
                'gasPrice': gas_price,
            })

        # Wait for confirmation and verify transaction succeeded
        tx_hash = await self.sign_and_send_transaction(
            tx, index, wait_for_confirmation=True, confirmation_timeout=120
        )
        return tx_hash

    async def _approve_token_for_router(
        self,
        token_address: str,
        amount: int,
        router_address: str,
        index: int = 0,
    ) -> Optional[str]:
        """Approve token spending for DEX router if needed."""
        ERC20_ABI = [
            {
                "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}],
                "name": "allowance",
                "outputs": [{"name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function",
            },
            {
                "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
                "name": "approve",
                "outputs": [{"name": "", "type": "bool"}],
                "stateMutability": "nonpayable",
                "type": "function",
            },
        ]

        token = self.web3.eth.contract(
            address=self.web3.to_checksum_address(token_address),
            abi=ERC20_ABI
        )

        account = self.get_account(index)
        router = self.web3.to_checksum_address(router_address)

        # Check current allowance
        current_allowance = token.functions.allowance(account.address, router).call()

        if current_allowance >= amount:
            return None  # Already approved

        # Approve max uint256 for future swaps
        max_uint = 2**256 - 1
        tx = token.functions.approve(router, max_uint).build_transaction({
            'from': account.address,
            'nonce': self._get_next_nonce(account.address),
            'gas': 100000,
            'gasPrice': self.web3.eth.gas_price,
        })

        tx_hash = await self.sign_and_send_transaction(tx, index)
        logger.info(f"Token approval tx: {tx_hash}")

        # Wait a bit for approval to be mined
        import asyncio
        await asyncio.sleep(3)

        return tx_hash


class SolanaSigner(ChainSigner):
    """Signer for Solana transactions."""

    def get_keypair(self, index: int = 0):
        """Derive Solana keypair from seed phrase.

        Uses standard BIP44 path: m/44'/501'/account'/change'
        Trust Wallet uses: m/44'/501'/0'/0' for main account
        Additional addresses: m/44'/501'/index'/0'
        """
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )
        from solders.keypair import Keypair

        seed = Bip39SeedGenerator(self.seed_phrase).Generate()
        bip44 = Bip44.FromSeed(seed, Bip44Coins.SOLANA)
        # Correct path: m/44'/501'/index'/0' (account at index, change=0)
        account = bip44.Purpose().Coin().Account(index).Change(Bip44Changes.CHAIN_EXT)
        private_key = account.PrivateKey().Raw().ToBytes()

        # Solana keypair from 32-byte seed
        return Keypair.from_seed(private_key[:32])

    def get_address(self, index: int = 0) -> str:
        """Get Solana address at index."""
        keypair = self.get_keypair(index)
        return str(keypair.pubkey())

    def get_private_key(self, index: int = 0) -> bytes:
        """Get Solana private key bytes."""
        keypair = self.get_keypair(index)
        return bytes(keypair)

    async def execute_jupiter_swap(
        self,
        quote_response: dict,
        index: int = 0,
    ) -> str:
        """Execute swap using Jupiter API.

        Args:
            quote_response: Quote response from Jupiter API
            index: Derivation index

        Returns:
            Transaction signature
        """
        import httpx
        from solders.transaction import VersionedTransaction
        from solders.keypair import Keypair
        import base64

        keypair = self.get_keypair(index)

        # Get swap transaction from Jupiter
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://quote-api.jup.ag/v6/swap",
                json={
                    "quoteResponse": quote_response,
                    "userPublicKey": str(keypair.pubkey()),
                    "wrapAndUnwrapSol": True,
                },
            )

            if response.status_code != 200:
                raise Exception(f"Jupiter swap API error: {response.text}")

            swap_data = response.json()
            swap_transaction = swap_data.get("swapTransaction")

            if not swap_transaction:
                raise Exception("No swap transaction returned")

            # Decode and sign transaction
            tx_bytes = base64.b64decode(swap_transaction)
            tx = VersionedTransaction.from_bytes(tx_bytes)

            # Sign the transaction
            tx.sign([keypair])

            # Send transaction
            from solana.rpc.async_api import AsyncClient

            async with AsyncClient("https://api.mainnet-beta.solana.com") as rpc:
                result = await rpc.send_transaction(tx)
                return str(result.value)


class CosmosSigner(ChainSigner):
    """Signer for Cosmos/Osmosis transactions."""

    def get_address(self, index: int = 0) -> str:
        """Get Cosmos address at index."""
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )

        seed = Bip39SeedGenerator(self.seed_phrase).Generate()
        bip44 = Bip44.FromSeed(seed, Bip44Coins.COSMOS)
        account = bip44.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
        address = account.AddressIndex(index).PublicKey().ToAddress()
        return address

    def get_private_key(self, index: int = 0) -> bytes:
        """Get Cosmos private key bytes."""
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
        )

        seed = Bip39SeedGenerator(self.seed_phrase).Generate()
        bip44 = Bip44.FromSeed(seed, Bip44Coins.COSMOS)
        account = bip44.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
        key = account.AddressIndex(index).PrivateKey().Raw().ToBytes()
        return key

    async def execute_osmosis_swap(
        self,
        pool_id: int,
        token_in_denom: str,
        token_out_denom: str,
        amount_in: int,
        min_amount_out: int,
        index: int = 0,
    ) -> str:
        """Execute swap on Osmosis.

        Uses cosmpy for transaction building and signing.
        """
        try:
            from cosmpy.aerial.client import LedgerClient, NetworkConfig
            from cosmpy.aerial.wallet import LocalWallet
            from cosmpy.crypto.keypairs import PrivateKey

            # Create wallet from private key
            private_key = self.get_private_key(index)
            wallet = LocalWallet(PrivateKey(private_key), prefix="osmo")

            # Connect to Osmosis
            cfg = NetworkConfig(
                chain_id="osmosis-1",
                url="grpc+https://grpc.osmosis.zone:443",
                fee_minimum_gas_price=0.0025,
                fee_denomination="uosmo",
                staking_denomination="uosmo",
            )
            client = LedgerClient(cfg)

            # Build swap message
            from cosmpy.protos.osmosis.gamm.v1beta1.tx_pb2 import MsgSwapExactAmountIn
            from cosmpy.protos.cosmos.base.v1beta1.coin_pb2 import Coin
            from cosmpy.aerial.tx import Transaction

            msg = MsgSwapExactAmountIn(
                sender=str(wallet.address()),
                routes=[{
                    "pool_id": pool_id,
                    "token_out_denom": token_out_denom,
                }],
                token_in=Coin(denom=token_in_denom, amount=str(amount_in)),
                token_out_min_amount=str(min_amount_out),
            )

            # Submit swap transaction
            tx = Transaction()
            tx.add_message(msg)

            # Sign and broadcast
            tx_response = client.broadcast_tx(tx.sign(wallet))

            if tx_response.tx_hash:
                return tx_response.tx_hash
            else:
                raise Exception("Failed to broadcast Osmosis swap transaction")

        except ImportError:
            logger.error("cosmpy not installed. Run: pip install cosmpy")
            raise Exception("Cosmos signing requires cosmpy package")


class CardanoSigner(ChainSigner):
    """Signer for Cardano transactions."""

    def get_address(self, index: int = 0) -> str:
        """Get Cardano address at index."""
        from bip_utils import (
            Bip39SeedGenerator, Cip1852, Cip1852Coins, Bip44Changes,
            CardanoShelley
        )

        seed = Bip39SeedGenerator(self.seed_phrase).Generate()
        cip1852 = Cip1852.FromSeed(seed, Cip1852Coins.CARDANO_ICARUS)
        account = cip1852.Purpose().Coin().Account(0)
        shelley = CardanoShelley.FromCip1852Object(account)
        addr = shelley.Change(Bip44Changes.CHAIN_EXT).AddressIndex(index)
        address = addr.PublicKeys().ToAddress()
        return address

    def get_signing_key(self, index: int = 0):
        """Get Cardano signing key."""
        from bip_utils import (
            Bip39SeedGenerator, Cip1852, Cip1852Coins, Bip44Changes,
            CardanoShelley
        )

        seed = Bip39SeedGenerator(self.seed_phrase).Generate()
        cip1852 = Cip1852.FromSeed(seed, Cip1852Coins.CARDANO_ICARUS)
        account = cip1852.Purpose().Coin().Account(0)
        shelley = CardanoShelley.FromCip1852Object(account)
        addr = shelley.Change(Bip44Changes.CHAIN_EXT).AddressIndex(index)
        return addr.PrivateKeys()

    async def execute_minswap_swap(
        self,
        asset_in: str,
        asset_out: str,
        amount_in: int,
        min_amount_out: int,
        index: int = 0,
    ) -> str:
        """Execute swap on Minswap.

        Note: This is a simplified implementation. Full Minswap integration
        requires building proper eUTxO transactions with Plutus scripts.
        """
        try:
            from pycardano import (
                TransactionBuilder,
                TransactionOutput,
                PaymentSigningKey,
                Address,
                BlockFrostChainContext,
            )
            from swaperex.config import get_settings

            # Get Blockfrost API key
            settings = get_settings()
            blockfrost_key = settings.blockfrost_api_key
            if not blockfrost_key:
                raise Exception("BLOCKFROST_API_KEY required for Cardano transactions")

            # Connect to Cardano mainnet
            context = BlockFrostChainContext(
                project_id=blockfrost_key,
                base_url="https://cardano-mainnet.blockfrost.io/api"
            )

            # Get signing key
            signing_keys = self.get_signing_key(index)
            address = Address.from_primitive(self.get_address(index))

            # Build transaction (simplified - real Minswap requires DEX contract interaction)
            builder = TransactionBuilder(context)
            builder.add_input_address(address)

            # Note: Full implementation requires:
            # 1. Building proper swap transaction with Minswap Plutus scripts
            # 2. Handling ADA and native tokens
            # 3. Computing correct fees and min UTxO

            raise Exception("Full Minswap integration pending - requires Plutus script interaction")

        except ImportError:
            logger.error("pycardano not installed. Run: pip install pycardano")
            raise Exception("Cardano signing requires pycardano package")


class BitcoinSigner(ChainSigner):
    """Signer for Bitcoin transactions (for THORChain)."""

    def get_address(self, index: int = 0) -> str:
        """Get Bitcoin address at index."""
        from bip_utils import (
            Bip39SeedGenerator, Bip84, Bip84Coins, Bip44Changes
        )

        seed = Bip39SeedGenerator(self.seed_phrase).Generate()
        bip84 = Bip84.FromSeed(seed, Bip84Coins.BITCOIN)
        account = bip84.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
        address = account.AddressIndex(index).PublicKey().ToAddress()
        return address

    def get_private_key_wif(self, index: int = 0) -> str:
        """Get Bitcoin private key in WIF format."""
        from bip_utils import (
            Bip39SeedGenerator, Bip84, Bip84Coins, Bip44Changes,
            WifEncoder, CoinsConf, Bip84Coins
        )

        seed = Bip39SeedGenerator(self.seed_phrase).Generate()
        bip84 = Bip84.FromSeed(seed, Bip84Coins.BITCOIN)
        account = bip84.Purpose().Coin().Account(0).Change(Bip44Changes.CHAIN_EXT)
        private_key = account.AddressIndex(index).PrivateKey()

        # Encode as WIF
        wif = WifEncoder.Encode(
            private_key.Raw().ToBytes(),
            CoinsConf.BitcoinMainNet.ParamByKey("wif_net_ver")
        )
        return wif

    async def send_to_thorchain(
        self,
        inbound_address: str,
        amount_satoshis: int,
        memo: str,
        index: int = 0,
    ) -> str:
        """Send BTC to THORChain inbound address with memo.

        This creates and broadcasts a Bitcoin transaction.
        """
        try:
            from bitcoinlib.wallets import Wallet
            from bitcoinlib.transactions import Transaction

            # Create wallet from WIF
            wif = self.get_private_key_wif(index)
            address = self.get_address(index)

            # Create transaction
            # Note: This is simplified - real implementation needs UTXO management

            raise Exception("BTC transaction building requires full UTXO management")

        except ImportError:
            logger.error("bitcoinlib not installed. Run: pip install bitcoinlib")
            raise Exception("Bitcoin signing requires bitcoinlib package")


class TransactionSignerFactory:
    """Factory for creating chain-specific signers."""

    def __init__(self):
        settings = get_settings()
        self.seed_phrase = settings.wallet_seed_phrase

        if not self.seed_phrase:
            raise ValueError("WALLET_SEED_PHRASE not configured")

    def get_evm_signer(self, chain: str = "ETH") -> EVMSigner:
        """Get EVM signer for specified chain."""
        settings = get_settings()

        rpc_urls = {
            "ETH": settings.eth_rpc_url,
            "BNB": settings.bsc_rpc_url,
            "LINK": settings.eth_rpc_url,  # LINK is on Ethereum
            "HYPE": "https://api.hyperliquid.xyz/evm",
        }

        rpc_url = rpc_urls.get(chain.upper(), settings.eth_rpc_url)
        return EVMSigner(self.seed_phrase, rpc_url)

    def get_solana_signer(self) -> SolanaSigner:
        """Get Solana signer."""
        return SolanaSigner(self.seed_phrase)

    def get_cosmos_signer(self) -> CosmosSigner:
        """Get Cosmos/Osmosis signer."""
        return CosmosSigner(self.seed_phrase)

    def get_cardano_signer(self) -> CardanoSigner:
        """Get Cardano signer."""
        return CardanoSigner(self.seed_phrase)

    def get_bitcoin_signer(self) -> BitcoinSigner:
        """Get Bitcoin signer."""
        return BitcoinSigner(self.seed_phrase)


# Singleton factory
_signer_factory: Optional[TransactionSignerFactory] = None


def get_signer_factory() -> TransactionSignerFactory:
    """Get or create signer factory."""
    global _signer_factory
    if _signer_factory is None:
        _signer_factory = TransactionSignerFactory()
    return _signer_factory
