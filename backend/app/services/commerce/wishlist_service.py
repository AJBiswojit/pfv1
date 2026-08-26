"""
WishlistService — server-side wishlist for authenticated customers.

Contract (API_CONTRACT.md § WISHLIST):
  GET    /wishlist              → get or create wishlist, return product ids + resolved products
  POST   /wishlist/{productId}  → add product id to wishlist (idempotent)
  DELETE /wishlist/{productId}  → remove product id from wishlist
  POST   /wishlist/{productId}/toggle → add if absent, remove if present
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.models.commerce.wishlist import WishlistModel
from app.models.commerce.wishlist_item import WishlistItemModel


class WishlistService:
    """Business logic for the customer wishlist."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_or_create_wishlist(self, customer_id: str) -> WishlistModel:
        """Return existing wishlist or create one for the customer."""
        stmt = select(WishlistModel).where(WishlistModel.customer_id == customer_id)
        result = await self.db.execute(stmt)
        wishlist = result.scalars().first()
        if not wishlist:
            wishlist = WishlistModel(customer_id=customer_id)
            self.db.add(wishlist)
            await self.db.flush()
        return wishlist

    def _to_response(self, wishlist: WishlistModel) -> dict:
        """Convert wishlist to the API response shape."""
        items = [item.product_id for item in (wishlist.items or [])]
        return {
            "ok": True,
            "items": items,
            "count": len(items),
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_wishlist(self, customer_id: str) -> dict:
        """GET /wishlist — fetch current wishlist."""
        wishlist = await self._get_or_create_wishlist(customer_id)
        return self._to_response(wishlist)

    async def add_product(self, customer_id: str, product_id: str) -> dict:
        """POST /wishlist/{productId} — add a product (idempotent)."""
        wishlist = await self._get_or_create_wishlist(customer_id)

        # Check if already present
        already = any(item.product_id == product_id for item in (wishlist.items or []))
        if not already:
            new_item = WishlistItemModel(wishlist_id=wishlist.id, product_id=product_id)
            self.db.add(new_item)
            await self.db.flush()
            # Reload
            wishlist = await self._get_or_create_wishlist(customer_id)

        return self._to_response(wishlist)

    async def remove_product(self, customer_id: str, product_id: str) -> dict:
        """DELETE /wishlist/{productId} — remove a product."""
        wishlist = await self._get_or_create_wishlist(customer_id)

        stmt = select(WishlistItemModel).where(
            WishlistItemModel.wishlist_id == wishlist.id,
            WishlistItemModel.product_id == product_id,
        )
        result = await self.db.execute(stmt)
        item = result.scalars().first()
        if item:
            await self.db.delete(item)
            await self.db.flush()
            # Reload
            wishlist = await self._get_or_create_wishlist(customer_id)

        return self._to_response(wishlist)

    async def toggle_product(self, customer_id: str, product_id: str) -> dict:
        """POST /wishlist/{productId}/toggle — add if absent, remove if present."""
        wishlist = await self._get_or_create_wishlist(customer_id)
        present = any(item.product_id == product_id for item in (wishlist.items or []))

        if present:
            return await self.remove_product(customer_id, product_id)
        return await self.add_product(customer_id, product_id)
