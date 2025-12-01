"""Bot handlers module."""

from aiogram import Router

from swaperex.bot.handlers import admin, start, swap, wallet


def setup_routers() -> Router:
    """Create and configure all routers."""
    main_router = Router()

    # Register all routers
    main_router.include_router(start.router)
    main_router.include_router(wallet.router)
    main_router.include_router(swap.router)
    main_router.include_router(admin.router)

    return main_router
