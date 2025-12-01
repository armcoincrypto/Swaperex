"""Deposit provider adapters."""

from swaperex.providers.base import Address, ProviderAdapter
from swaperex.providers.factory import get_provider

__all__ = ["Address", "ProviderAdapter", "get_provider"]
