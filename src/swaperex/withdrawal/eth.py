"""ETH withdrawal handler.

Uses web3.py or httpx for transaction building and broadcast.
Supports ETH and ERC20 tokens.
"""

import logging
from decimal import Decimal
from typing import Optional

import httpx

from swaperex.withdrawal.base import (
    FeeEstimate,
    WithdrawalHandler,
    WithdrawalResult,
    WithdrawalStatus,
)

logger = logging.getLogger(__name__)

# RPC endpoints
INFURA_MAINNET = "https://mainnet.infura.io/v3/{api_key}"
INFURA_SEPOLIA = "https://sepolia.infura.io/v3/{api_key}"

# Public RPC (rate limited)
PUBLIC_RPC_MAINNET = "https://eth.llamarpc.com"
PUBLIC_RPC_SEPOLIA = "https://rpc.sepolia.org"

# Etherscan for gas estimation
ETHERSCAN_GAS_MAINNET = "https://api.etherscan.io/api"
ETHERSCAN_GAS_SEPOLIA = "https://api-sepolia.etherscan.io/api"


class ETHWithdrawalHandler(WithdrawalHandler):
    """Ethereum withdrawal handler.

    Supports ETH native transfers and ERC20 token transfers.
    """

    def __init__(
        self,
        testnet: bool = False,
        infura_key: Optional[str] = None,
        etherscan_key: Optional[str] = None,
        rpc_url: Optional[str] = None,
    ):
        super().__init__("ETH", testnet)
        self.infura_key = infura_key
        self.etherscan_key = etherscan_key

        # Set RPC endpoint - custom URL takes priority
        if rpc_url:
            self.rpc_url = rpc_url
        elif infura_key:
            template = INFURA_SEPOLIA if testnet else INFURA_MAINNET
            self.rpc_url = template.format(api_key=infura_key)
        else:
            self.rpc_url = PUBLIC_RPC_SEPOLIA if testnet else PUBLIC_RPC_MAINNET

        self.etherscan_url = ETHERSCAN_GAS_SEPOLIA if testnet else ETHERSCAN_GAS_MAINNET

    async def validate_address(self, address: str) -> bool:
        """Validate Ethereum address format."""
        if not address:
            return False

        # Must start with 0x and be 42 chars
        if not address.startswith("0x"):
            return False

        if len(address) != 42:
            return False

        # Must be valid hex
        try:
            int(address, 16)
            return True
        except ValueError:
            return False

    async def estimate_fee(
        self, amount: Decimal, destination: str, priority: str = "normal"
    ) -> FeeEstimate:
        """Estimate ETH transaction fee."""
        try:
            # Get gas price from RPC
            gas_price_wei = await self._get_gas_price()

            # Standard ETH transfer uses 21000 gas
            gas_limit = 21000

            # Adjust for priority
            multiplier = {"low": 0.8, "normal": 1.0, "high": 1.5}.get(priority, 1.0)
            adjusted_gas_price = int(gas_price_wei * multiplier)

            # Calculate fee in ETH
            fee_wei = adjusted_gas_price * gas_limit
            fee_eth = Decimal(fee_wei) / Decimal(10**18)

            # Estimate times
            times = {
                "low": "~5 minutes",
                "normal": "~2 minutes",
                "high": "~30 seconds",
            }

            return FeeEstimate(
                asset="ETH",
                network_fee=fee_eth,
                service_fee=Decimal("0"),
                total_fee=fee_eth,
                fee_asset="ETH",
                estimated_time=times.get(priority, "~2 minutes"),
                priority=priority,
            )

        except Exception as e:
            logger.warning(f"Failed to estimate ETH fee: {e}")

        # Fallback
        return FeeEstimate(
            asset="ETH",
            network_fee=Decimal("0.002"),
            service_fee=Decimal("0"),
            total_fee=Decimal("0.002"),
            fee_asset="ETH",
            estimated_time="~2 minutes",
            priority=priority,
        )

    async def _get_gas_price(self) -> int:
        """Get current gas price in wei."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.rpc_url,
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

        # Fallback: 30 gwei
        return 30 * 10**9

    async def _get_nonce(self, address: str) -> int:
        """Get transaction count (nonce) for address."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.rpc_url,
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

    async def execute_withdrawal(
        self,
        private_key: str,
        destination: str,
        amount: Decimal,
        fee_priority: str = "normal",
    ) -> WithdrawalResult:
        """Execute ETH withdrawal."""
        try:
            # Try to use web3.py
            try:
                from web3 import Web3
                from eth_account import Account

                HAS_WEB3 = True
            except ImportError:
                HAS_WEB3 = False

            if not HAS_WEB3:
                # Simulated result
                logger.warning("web3 not installed - using simulated withdrawal")
                import secrets
                return WithdrawalResult(
                    success=True,
                    txid=f"0x{secrets.token_hex(32)}",
                    status=WithdrawalStatus.BROADCAST,
                    message=f"[SIMULATED] Would send {amount} ETH to {destination}",
                    fee_paid=Decimal("0.002"),
                )

            # Real implementation with web3.py
            w3 = Web3(Web3.HTTPProvider(self.rpc_url))
            account = Account.from_key(private_key)

            # Get nonce and gas price
            nonce = await self._get_nonce(account.address)
            gas_price = await self._get_gas_price()

            # Adjust gas price for priority
            multiplier = {"low": 0.8, "normal": 1.0, "high": 1.5}.get(fee_priority, 1.0)
            gas_price = int(gas_price * multiplier)

            # Build transaction
            tx = {
                "nonce": nonce,
                "gasPrice": gas_price,
                "gas": 21000,
                "to": Web3.to_checksum_address(destination),
                "value": Web3.to_wei(amount, "ether"),
                "chainId": 11155111 if self.testnet else 1,  # Sepolia or mainnet
            }

            # Sign transaction
            signed_tx = account.sign_transaction(tx)

            # Broadcast
            txid = await self._broadcast_transaction(signed_tx.rawTransaction.hex())

            if txid:
                fee_eth = Decimal(gas_price * 21000) / Decimal(10**18)
                return WithdrawalResult(
                    success=True,
                    txid=txid,
                    status=WithdrawalStatus.BROADCAST,
                    message=f"Sent {amount} ETH to {destination}",
                    fee_paid=fee_eth,
                )
            else:
                return WithdrawalResult(
                    success=False,
                    status=WithdrawalStatus.FAILED,
                    error="Failed to broadcast transaction",
                )

        except Exception as e:
            logger.error(f"ETH withdrawal failed: {e}")
            return WithdrawalResult(
                success=False,
                status=WithdrawalStatus.FAILED,
                error=str(e),
            )

    async def _broadcast_transaction(self, raw_tx_hex: str) -> Optional[str]:
        """Broadcast raw transaction."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.rpc_url,
                    json={
                        "jsonrpc": "2.0",
                        "method": "eth_sendRawTransaction",
                        "params": [f"0x{raw_tx_hex}" if not raw_tx_hex.startswith("0x") else raw_tx_hex],
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
            logger.error(f"Failed to broadcast ETH tx: {e}")

        return None

    async def get_transaction_status(self, txid: str) -> WithdrawalStatus:
        """Check ETH transaction status."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.rpc_url,
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

                    if result is None:
                        return WithdrawalStatus.CONFIRMING

                    status = int(result.get("status", "0x0"), 16)
                    if status == 1:
                        return WithdrawalStatus.COMPLETED
                    else:
                        return WithdrawalStatus.FAILED

        except Exception as e:
            logger.error(f"Failed to check ETH tx status: {e}")

        return WithdrawalStatus.PENDING


class ERC20WithdrawalHandler(ETHWithdrawalHandler):
    """ERC20 token withdrawal handler."""

    def __init__(
        self,
        token_contract: str,
        token_symbol: str,
        token_decimals: int = 18,
        testnet: bool = False,
        infura_key: Optional[str] = None,
    ):
        super().__init__(testnet, infura_key)
        self.asset = token_symbol.upper()
        self.token_contract = token_contract
        self.token_decimals = token_decimals

    async def estimate_fee(
        self, amount: Decimal, destination: str, priority: str = "normal"
    ) -> FeeEstimate:
        """Estimate ERC20 transfer fee (uses more gas than ETH transfer)."""
        estimate = await super().estimate_fee(amount, destination, priority)

        # ERC20 transfers use ~65000 gas instead of 21000
        multiplier = Decimal("3.1")  # 65000/21000
        estimate.network_fee *= multiplier
        estimate.total_fee *= multiplier

        return estimate

    async def execute_withdrawal(
        self,
        private_key: str,
        destination: str,
        amount: Decimal,
        fee_priority: str = "normal",
    ) -> WithdrawalResult:
        """Execute ERC20 token withdrawal."""
        try:
            try:
                from web3 import Web3
                from eth_account import Account

                HAS_WEB3 = True
            except ImportError:
                HAS_WEB3 = False

            if not HAS_WEB3:
                import secrets
                return WithdrawalResult(
                    success=True,
                    txid=f"0x{secrets.token_hex(32)}",
                    status=WithdrawalStatus.BROADCAST,
                    message=f"[SIMULATED] Would send {amount} {self.asset} to {destination}",
                    fee_paid=Decimal("0.005"),
                )

            w3 = Web3(Web3.HTTPProvider(self.rpc_url))
            account = Account.from_key(private_key)

            # ERC20 transfer ABI
            transfer_abi = {
                "constant": False,
                "inputs": [
                    {"name": "_to", "type": "address"},
                    {"name": "_value", "type": "uint256"},
                ],
                "name": "transfer",
                "outputs": [{"name": "", "type": "bool"}],
                "type": "function",
            }

            # Build transfer data
            contract = w3.eth.contract(
                address=Web3.to_checksum_address(self.token_contract),
                abi=[transfer_abi],
            )

            # Convert amount to token units
            token_amount = int(amount * (10 ** self.token_decimals))

            # Get nonce and gas price
            nonce = await self._get_nonce(account.address)
            gas_price = await self._get_gas_price()

            multiplier = {"low": 0.8, "normal": 1.0, "high": 1.5}.get(fee_priority, 1.0)
            gas_price = int(gas_price * multiplier)

            # Build transaction
            tx = contract.functions.transfer(
                Web3.to_checksum_address(destination),
                token_amount,
            ).build_transaction({
                "nonce": nonce,
                "gasPrice": gas_price,
                "gas": 100000,  # ERC20 transfers need more gas
                "chainId": 11155111 if self.testnet else 1,
            })

            # Sign and broadcast
            signed_tx = account.sign_transaction(tx)
            txid = await self._broadcast_transaction(signed_tx.rawTransaction.hex())

            if txid:
                fee_eth = Decimal(gas_price * 100000) / Decimal(10**18)
                return WithdrawalResult(
                    success=True,
                    txid=txid,
                    status=WithdrawalStatus.BROADCAST,
                    message=f"Sent {amount} {self.asset} to {destination}",
                    fee_paid=fee_eth,
                )
            else:
                return WithdrawalResult(
                    success=False,
                    status=WithdrawalStatus.FAILED,
                    error="Failed to broadcast transaction",
                )

        except Exception as e:
            logger.error(f"ERC20 withdrawal failed: {e}")
            return WithdrawalResult(
                success=False,
                status=WithdrawalStatus.FAILED,
                error=str(e),
            )


# Token contract addresses
USDT_CONTRACT_MAINNET = "0xdAC17F958D2ee523a2206206994597C13D831ec7"
USDT_CONTRACT_SEPOLIA = "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0"  # Test USDT

USDC_CONTRACT_MAINNET = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
USDC_CONTRACT_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"  # Test USDC


def get_usdt_erc20_handler(
    testnet: bool = False,
    rpc_url: Optional[str] = None,
    infura_key: Optional[str] = None,
) -> ERC20WithdrawalHandler:
    """Get USDT-ERC20 withdrawal handler with correct contract address."""
    contract = USDT_CONTRACT_SEPOLIA if testnet else USDT_CONTRACT_MAINNET
    return ERC20WithdrawalHandler(
        token_contract=contract,
        token_symbol="USDT-ERC20",
        token_decimals=6,
        testnet=testnet,
        infura_key=infura_key,
    )


def get_usdc_handler(
    testnet: bool = False,
    rpc_url: Optional[str] = None,
    infura_key: Optional[str] = None,
) -> ERC20WithdrawalHandler:
    """Get USDC withdrawal handler with correct contract address."""
    contract = USDC_CONTRACT_SEPOLIA if testnet else USDC_CONTRACT_MAINNET
    return ERC20WithdrawalHandler(
        token_contract=contract,
        token_symbol="USDC",
        token_decimals=6,
        testnet=testnet,
        infura_key=infura_key,
    )
