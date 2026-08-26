"""
Category & Subcategory — Pydantic schemas.

Response shapes follow API_CONTRACT.md § CATEGORIES verbatim.
"""

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


# ─────────────────────────────────────────────────────────────────────────────
# Subcategory schemas
# ─────────────────────────────────────────────────────────────────────────────

class SubcategoryResponse(BaseModel):
    """Public subcategory shape — verbatim from API_CONTRACT.md."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    categoryId: str = Field(alias="category_id")
    name: str
    slug: str
    description: Optional[str] = ""
    image: Optional[str] = ""
    status: str
    sortOrder: int = Field(alias="sort_order")
    productCount: int = 0


class SubcategoryCreateRequest(BaseModel):
    """Body for POST /admin/categories/{categoryId}/subcategories."""

    name: str
    slug: Optional[str] = None          # auto-derived from name if omitted
    description: Optional[str] = ""
    image: Optional[str] = ""
    sort_order: int = 0


class SubcategoryUpdateRequest(BaseModel):
    """Body for PATCH /admin/subcategories/{id}."""

    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    sort_order: Optional[int] = None


# ─────────────────────────────────────────────────────────────────────────────
# Category schemas
# ─────────────────────────────────────────────────────────────────────────────

class CategoryResponse(BaseModel):
    """Public category shape — verbatim from API_CONTRACT.md."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    slug: str
    eyebrow: Optional[str] = ""
    description: Optional[str] = ""
    image: Optional[str] = ""
    bannerMediaId: Optional[str] = Field(None, alias="banner_media_id")
    status: str
    sortOrder: int = Field(alias="sort_order")
    featured: bool
    seoTitle: Optional[str] = Field("", alias="seo_title")
    seoDescription: Optional[str] = Field("", alias="seo_description")
    productCount: int = 0


class CategoryCreateRequest(BaseModel):
    """Body for POST /admin/categories."""

    name: str
    slug: Optional[str] = None          # auto-derived from name if omitted
    eyebrow: Optional[str] = ""
    description: Optional[str] = ""
    image: Optional[str] = ""
    banner_media_id: Optional[str] = None
    sort_order: int = 0
    featured: bool = False
    seo_title: Optional[str] = ""
    seo_description: Optional[str] = ""


class CategoryUpdateRequest(BaseModel):
    """Body for PATCH /admin/categories/{id}."""

    name: Optional[str] = None
    slug: Optional[str] = None
    eyebrow: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    banner_media_id: Optional[str] = None
    sort_order: Optional[int] = None
    featured: Optional[bool] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Response wrappers (keep envelope: ok + payload)
# ─────────────────────────────────────────────────────────────────────────────

class CategoryListResponse(BaseModel):
    ok: bool = True
    items: List[CategoryResponse]


class SingleCategoryResponse(BaseModel):
    ok: bool = True
    category: CategoryResponse


class SubcategoryListResponse(BaseModel):
    ok: bool = True
    items: List[SubcategoryResponse]


class SingleSubcategoryResponse(BaseModel):
    ok: bool = True
    subcategory: SubcategoryResponse


class OkResponse(BaseModel):
    ok: bool = True
    message: Optional[str] = None
