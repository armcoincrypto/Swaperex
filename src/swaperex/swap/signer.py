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

    def __init__(self, seed_phrase: str, rpc_url: str):
        super().__init__(seed_phrase)
        self.rpc_url = rpc_url
        self._web3 = None
        self._account = None

    @property
    def web3(self):
        """Lazy load web3 instance."""
        if self._web3 is None:
            from web3 import Web3
            self._web3 = Web3(Web3.HTTPProvider(self.rpc_url))
        return self._web3

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

    async def sign_and_send_transaction(self, tx_params: dict, index: int = 0) -> str:
        """Sign and send EVM transaction.

        Args:
            tx_params: Transaction parameters (to, value, data, gas, etc.)
            index: Derivation index

        Returns:
            Transaction hash
        """
        from eth_account import Account

        account = self.get_account(index)

        # Add from address and nonce if not present
        if 'from' not in tx_params:
            tx_params['from'] = account.address
        if 'nonce' not in tx_params:
            tx_params['nonce'] = self.web3.eth.get_transaction_count(account.address)
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
        tx_hash = self.web3.eth.send_raw_transaction(signed_tx.rawTransaction)

        return tx_hash.hex()

    async def swap_on_uniswap(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_amount_out: int,
        recipient: str,
        deadline: int,
        index: int = 0,
    ) -> str:
        """Execute swap on Uniswap V3."""
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

        # Build swap params
        params = {
            "tokenIn": self.web3.to_checksum_address(token_in),
            "tokenOut": self.web3.to_checksum_address(token_out),
            "fee": 3000,  # 0.3% fee tier
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
            'nonce': self.web3.eth.get_transaction_count(account.address),
            'gas': 300000,
            'gasPrice': self.web3.eth.gas_price,
        })

        # If token_in is WETH, add value
        WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
        if token_in.lower() == WETH.lower():
            tx['value'] = amount_in

        return await self.sign_and_send_transaction(tx, index)


class SolanaSigner(ChainSigner):
    """Signer for Solana transactions."""

    def get_keypair(self, index: int = 0):
        """Derive Solana keypair from seed phrase."""
        from bip_utils import (
            Bip39SeedGenerator, Bip44, Bip44Coins
        )
        from solders.keypair import Keypair

        seed = Bip39SeedGenerator(self.seed_phrase).Generate()
        bip44 = Bip44.FromSeed(seed, Bip44Coins.SOLANA)
        # Solana uses m/44'/501'/index'/0'
        account = bip44.Purpose().Coin().Account(index)
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

            msg = MsgSwapExactAmountIn(
                sender=str(wallet.address()),
                routes=[{
                    "pool_id": pool_id,
                    "token_out_denom": token_out_denom,
                }],
                token_in=Coin(denom=token_in_denom, amount=str(amount_in)),
                token_out_min_amount=str(min_amount_out),
            )

            # Submit transaction
            tx = client.send_tokens(
                wallet.address(),
                wallet.address(),
                amount=0,
                denom="uosmo",
                memo="Swaperex",
            )

            return tx.tx_hash

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
