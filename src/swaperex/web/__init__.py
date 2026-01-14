"""Web boundary layer for non-custodial operations.

This module provides a clean separation between the Telegram bot's custodial
operations and web-based non-custodial operations.

SECURITY PRINCIPLES:
1. This layer MUST NOT import from:
   - hdwallet/ (private key derivation)
   - signing/ (transaction signing)
   - withdrawal/ (transaction broadcasting)
   - services/swap_executor (on-chain execution)
   - services/deposit_sweeper (private key access)

2. This layer CAN import from:
   - routing/ (quote generation only, no execution)
   - ledger/ (read-only queries)
   - config (settings)
   - providers/ (read-only data)

3. All operations in this layer are read-only or prepare data for
   client-side signing (non-custodial).
"""

__all__ = [
    "contracts",
    "services",
    "controllers",
]
