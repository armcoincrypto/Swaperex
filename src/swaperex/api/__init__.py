"""FastAPI backend module.

`create_app` is exported lazily (PEP 562) so importing the isolated admin app
(`swaperex.api.app_admin`) does not transitively pull in the custodial
routers wired by `swaperex.api.app.create_app`. External consumers can still
do `from swaperex.api import create_app` — the import is resolved on first
attribute access.
"""

from typing import Any

__all__ = ["create_app"]


def __getattr__(name: str) -> Any:
    if name == "create_app":
        from swaperex.api.app import create_app

        return create_app
    raise AttributeError(f"module 'swaperex.api' has no attribute {name!r}")
