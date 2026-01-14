"""HTTP controllers for web API endpoints.

SECURITY: These controllers MUST NOT:
- Execute custodial operations
- Access private keys
- Sign or broadcast transactions

All operations are read-only or prepare data for client-side signing.
"""

from swaperex.web.controllers.quotes import router as quotes_router
from swaperex.web.controllers.chains import router as chains_router
from swaperex.web.controllers.transactions import router as transactions_router
from swaperex.web.controllers.swaps import router as swaps_router
from swaperex.web.controllers.withdrawals import router as withdrawals_router
from swaperex.web.controllers.balances import router as balances_router
from swaperex.web.controllers.wallet import router as wallet_router

__all__ = [
    "quotes_router",
    "chains_router",
    "transactions_router",
    "swaps_router",
    "withdrawals_router",
    "balances_router",
    "wallet_router",
]
