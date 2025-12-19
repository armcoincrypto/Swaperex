"""Withdrawal service for non-custodial web mode.

This service provides withdrawal transaction TEMPLATES only.
Actual withdrawals are executed client-side - the backend NEVER broadcasts.

SECURITY: This service does NOT:
- Access private keys
- Sign transactions
- Broadcast transactions

It ONLY:
- Validates withdrawal parameters
- Estimates fees
- Builds unsigned transaction templates
"""

import logging
from decimal import Decimal
from typing import Optional

from swaperex.config import get_settings, ExecutionMode
from swaperex.web.contracts.withdrawals import (
    WithdrawalRequest,
    WithdrawalResponse,
    WithdrawalFeeEstimate,
    UnsignedWithdrawalTransaction,
)

logger = logging.getLogger(__name__)

# Chain configurations
CHAIN_CONFIG = {
    "ethereum": {
        "chain_id": 1,
        "native": "ETH",
        "decimals": 18,
        "gas_limit_native": 21000,
        "gas_limit_token": 65000,
        "gas_price_gwei": Decimal("30"),
    },
    "bsc": {
        "chain_id": 56,
        "native": "BNB",
        "decimals": 18,
        "gas_limit_native": 21000,
        "gas_limit_token": 65000,
        "gas_price_gwei": Decimal("3"),
    },
    "polygon": {
        "chain_id": 137,
        "native": "MATIC",
        "decimals": 18,
        "gas_limit_native": 21000,
        "gas_limit_token": 65000,
        "gas_price_gwei": Decimal("50"),
    },
    "tron": {
        "chain_id": 0,  # Non-EVM
        "native": "TRX",
        "decimals": 6,
        "energy_cost": Decimal("0.21"),  # TRX per energy
    },
    "bitcoin": {
        "chain_id": 0,  # Non-EVM
        "native": "BTC",
        "decimals": 8,
        "sat_per_vbyte": 20,
    },
}

# Token mappings (subset for demo)
TOKEN_CONTRACTS = {
    "ethereum": {
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDC": "0xA0b86a33E6F0c8FF4E94aF1E4Cfe7AE2e9C1e5b4",
        "DAI": "0x6B175474E89094C44Da98b954EesADAC5F3Ce2b7",
    },
    "bsc": {
        "USDT": "0x55d398326f99059fF775485246999027B3197955",
        "BUSD": "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    },
}

# ERC-20 transfer function selector
ERC20_TRANSFER = "0xa9059cbb"


class WithdrawalService:
    """Non-custodial withdrawal service that returns transaction templates.

    This service:
    1. Validates withdrawal parameters
    2. Estimates network fees
    3. Builds unsigned transaction templates

    NO execution happens server-side in WEB_NON_CUSTODIAL mode.
    """

    def _check_mode(self) -> None:
        """Verify we're in web mode and log warning if execution is attempted."""
        settings = get_settings()
        if settings.mode == ExecutionMode.TELEGRAM_CUSTODIAL:
            logger.warning(
                "WithdrawalService (web) called in TELEGRAM_CUSTODIAL mode. "
                "Use the custodial withdrawal handlers instead."
            )

    def _log_execution_block(self, asset: str, amount: Decimal) -> None:
        """Log that execution was blocked in web mode."""
        logger.warning(
            "SECURITY: Backend withdrawal execution BLOCKED in WEB_NON_CUSTODIAL mode. "
            "Asset: %s, Amount: %s. Transaction template returned for client-side execution.",
            asset,
            amount,
        )

    async def get_withdrawal_template(
        self,
        request: WithdrawalRequest,
    ) -> WithdrawalResponse:
        """Get a withdrawal transaction template.

        Args:
            request: Withdrawal request parameters

        Returns:
            WithdrawalResponse with unsigned transaction template

        Note: This NEVER executes a withdrawal. It only returns a template
        for the client to sign and broadcast.
        """
        self._check_mode()
        self._log_execution_block(request.asset, request.amount)

        try:
            # Determine chain
            chain = self._detect_chain(request.asset, request.chain)
            if not chain:
                return self._error_response(
                    request, f"Cannot determine chain for {request.asset}"
                )

            chain_config = CHAIN_CONFIG.get(chain)
            if not chain_config:
                return self._error_response(request, f"Unsupported chain: {chain}")

            # Check if native or token transfer
            is_token = self._is_token(request.asset, chain)

            # Build transaction template
            if chain in ("ethereum", "bsc", "polygon"):
                return await self._build_evm_withdrawal(request, chain, is_token)
            elif chain == "tron":
                return self._build_tron_withdrawal(request)
            elif chain == "bitcoin":
                return self._build_btc_withdrawal(request)
            else:
                return self._error_response(
                    request, f"Chain {chain} not yet supported for web withdrawals"
                )

        except Exception as e:
            logger.error(f"Withdrawal template failed: {e}")
            return self._error_response(request, str(e))

    async def _build_evm_withdrawal(
        self,
        request: WithdrawalRequest,
        chain: str,
        is_token: bool,
    ) -> WithdrawalResponse:
        """Build EVM withdrawal transaction template."""
        config = CHAIN_CONFIG[chain]

        if is_token:
            # Token transfer
            token_address = TOKEN_CONTRACTS.get(chain, {}).get(request.asset)
            if not token_address:
                return self._error_response(
                    request, f"Token {request.asset} not supported on {chain}"
                )

            gas_limit = config["gas_limit_token"]
            gas_price_wei = int(config["gas_price_gwei"] * Decimal(10**9))

            # Build ERC-20 transfer calldata
            # transfer(address to, uint256 amount)
            to_padded = request.destination_address.lower().replace("0x", "").zfill(64)
            amount_wei = int(request.amount * Decimal(10**config["decimals"]))
            amount_hex = hex(amount_wei)[2:].zfill(64)
            data = f"{ERC20_TRANSFER}{to_padded}{amount_hex}"

            tx = UnsignedWithdrawalTransaction(
                chain=chain,
                chain_id=config["chain_id"],
                to=token_address,
                value="0x0",
                data=data,
                gas_limit=hex(gas_limit),
                gas_price=hex(gas_price_wei),
                description=f"Transfer {request.amount} {request.asset} to {request.destination_address[:10]}...",
            )

            fee_native = Decimal(gas_limit * gas_price_wei) / Decimal(10**18)

            return WithdrawalResponse(
                success=True,
                asset=request.asset,
                amount=request.amount,
                destination=request.destination_address,
                net_amount=request.amount,  # No protocol fee for simple transfers
                fee_estimate=WithdrawalFeeEstimate(
                    network_fee=fee_native,
                    network_fee_asset=config["native"],
                    total_fee=fee_native,
                ),
                transaction=tx,
                is_token_transfer=True,
                token_contract=token_address,
            )

        else:
            # Native transfer
            gas_limit = config["gas_limit_native"]
            gas_price_wei = int(config["gas_price_gwei"] * Decimal(10**9))
            amount_wei = int(request.amount * Decimal(10**config["decimals"]))

            tx = UnsignedWithdrawalTransaction(
                chain=chain,
                chain_id=config["chain_id"],
                to=request.destination_address,
                value=hex(amount_wei),
                data="0x",
                gas_limit=hex(gas_limit),
                gas_price=hex(gas_price_wei),
                description=f"Transfer {request.amount} {request.asset} to {request.destination_address[:10]}...",
            )

            fee_native = Decimal(gas_limit * gas_price_wei) / Decimal(10**18)
            net_amount = request.amount - fee_native

            return WithdrawalResponse(
                success=True,
                asset=request.asset,
                amount=request.amount,
                destination=request.destination_address,
                net_amount=net_amount,
                fee_estimate=WithdrawalFeeEstimate(
                    network_fee=fee_native,
                    network_fee_asset=config["native"],
                    total_fee=fee_native,
                ),
                transaction=tx,
                is_token_transfer=False,
            )

    def _build_tron_withdrawal(
        self,
        request: WithdrawalRequest,
    ) -> WithdrawalResponse:
        """Build TRON withdrawal template (simplified)."""
        # For TRON, would need to use TronGrid API to build transaction
        # Here we return a placeholder showing the structure
        return WithdrawalResponse(
            success=True,
            asset=request.asset,
            amount=request.amount,
            destination=request.destination_address,
            net_amount=request.amount,
            fee_estimate=WithdrawalFeeEstimate(
                network_fee=Decimal("1.0"),  # ~1 TRX for simple transfer
                network_fee_asset="TRX",
                total_fee=Decimal("1.0"),
            ),
            transaction=UnsignedWithdrawalTransaction(
                chain="tron",
                chain_id=0,
                to=request.destination_address,
                value=str(int(request.amount * Decimal(10**6))),  # Sun units
                description=f"TRON transfer to {request.destination_address[:10]}...",
                warnings=[
                    "TRON transactions require TronLink or similar wallet.",
                    "Use TronGrid API to build complete transaction.",
                ],
            ),
            is_token_transfer=request.asset != "TRX",
        )

    def _build_btc_withdrawal(
        self,
        request: WithdrawalRequest,
    ) -> WithdrawalResponse:
        """Build Bitcoin withdrawal template (simplified)."""
        # For BTC, would need UTXO selection
        # Here we return a placeholder showing the structure
        config = CHAIN_CONFIG["bitcoin"]

        # Estimate fee (assume ~250 bytes for simple tx)
        tx_size = 250
        fee_sats = tx_size * config["sat_per_vbyte"]
        fee_btc = Decimal(fee_sats) / Decimal(10**8)
        net_amount = request.amount - fee_btc

        return WithdrawalResponse(
            success=True,
            asset=request.asset,
            amount=request.amount,
            destination=request.destination_address,
            net_amount=net_amount,
            fee_estimate=WithdrawalFeeEstimate(
                network_fee=fee_btc,
                network_fee_asset="BTC",
                total_fee=fee_btc,
            ),
            transaction=UnsignedWithdrawalTransaction(
                chain="bitcoin",
                chain_id=0,
                to=request.destination_address,
                value=str(int(net_amount * Decimal(10**8))),  # Satoshis
                description=f"BTC transfer to {request.destination_address[:10]}...",
                warnings=[
                    "Bitcoin requires UTXO selection.",
                    "Use a BTC wallet library to build complete transaction.",
                ],
            ),
            is_token_transfer=False,
        )

    def _detect_chain(
        self,
        asset: str,
        preferred: Optional[str],
    ) -> Optional[str]:
        """Detect chain for asset."""
        if preferred:
            return preferred.lower()

        asset_upper = asset.upper()

        # Native tokens
        if asset_upper in ("ETH", "USDT", "USDC", "DAI"):
            return "ethereum"
        if asset_upper in ("BNB", "BUSD"):
            return "bsc"
        if asset_upper == "MATIC":
            return "polygon"
        if asset_upper in ("TRX", "USDT-TRC20"):
            return "tron"
        if asset_upper in ("BTC", "LTC"):
            return "bitcoin"

        return "ethereum"  # Default

    def _is_token(self, asset: str, chain: str) -> bool:
        """Check if asset is a token (not native)."""
        native_assets = {
            "ethereum": "ETH",
            "bsc": "BNB",
            "polygon": "MATIC",
            "tron": "TRX",
            "bitcoin": "BTC",
        }
        return asset.upper() != native_assets.get(chain, "")

    def _error_response(
        self,
        request: WithdrawalRequest,
        error: str,
    ) -> WithdrawalResponse:
        """Build error response."""
        return WithdrawalResponse(
            success=False,
            asset=request.asset,
            amount=request.amount,
            destination=request.destination_address,
            error=error,
        )
