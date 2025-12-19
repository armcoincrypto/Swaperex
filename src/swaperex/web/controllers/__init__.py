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

__all__ = [
    "quotes_router",
    "chains_router",
    "transactions_router",
]
