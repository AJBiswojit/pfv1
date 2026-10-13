/**
 * One write path for Quick Create and the full editor.
 *
 * Admin drafts: POST /admin/products/draft + PATCH (unchanged).
 * Employee drafts: POST /employee/products/draft + PATCH /employee/products/{id}
 * on the existing whitelist — same catalogue, assigned to the caller.
 */

import catalogRepository, { upsertServerProducts } from "../../services/catalogRepository";
import {
  fetchAdminProduct,
  persistAdminProduct,
} from "../../services/admin/productAdminService";
import { formatAdminError } from "../../services/admin/adminError";
import {
  apiAdminGetNextId,
  apiEmployeeCreateDraft,
  apiEmployeeGetProduct,
  apiEmployeeUpdateProduct,
} from "../../services/api/productsApi";
import { draftFromProduct } from "./productDraftModel";

const COMMAND_OWNED_FIELDS = new Set([
  "id",
  "productId",
  "exists",
  "status",
  "review",
  "workflow",
  "published",
  "publishedAt",
  "publishedBy",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
  "history",
  "priceHistory",
  "collection",
  "collections",
  "collectionIds",
]);

export function buildProductDraftPayload(draft) {
  const pricing = {
    ...draft.pricing,
    mrp: Number(draft.pricing.mrp) || 0,
    sellingPrice: Number(draft.pricing.sellingPrice) || 0,
    discountValue: Number(draft.pricing.discountValue) || 0,
    taxRate: Number(draft.pricing.taxRate) || 0,
  };
  const editableDraft = Object.fromEntries(
    Object.entries(draft).filter(([field]) => !COMMAND_OWNED_FIELDS.has(field))
  );
  const cover =
    typeof draft.image === "string" && draft.image.startsWith("data:") ? "" : draft.image;

  return {
    ...editableDraft,
    pricing,
    sku: String(draft.sku || "").trim() || undefined,
    image: cover,
    stock: Number(draft.stock) || 0,
    lowStockThreshold: Number(draft.lowStockThreshold) || 0,
    variants: (draft.variants || []).map((variant) => ({
      ...variant,
      stock: Number(variant.stock) || 0,
      priceOverride:
        variant.priceOverride === "" || variant.priceOverride == null
          ? null
          : Number(variant.priceOverride) || null,
    })),
    ...(draft.slug ? { slug: draft.slug } : {}),
  };
}

/** Employee PATCH/create whitelist — extra keys are a 422. */
export function buildEmployeeProductPayload(draft) {
  const selling = Number(draft.pricing?.sellingPrice ?? draft.price);
  const mrp = Number(draft.pricing?.mrp ?? draft.compareAtPrice ?? draft.originalPrice);
  const payload = {
    name: draft.name,
    price: Number.isFinite(selling) && selling > 0 ? Math.round(selling) : undefined,
    compareAtPrice: Number.isFinite(mrp) && mrp > 0 ? Math.round(mrp) : undefined,
    description: draft.description,
    shortDescription: draft.shortDescription,
    category: draft.category,
    subcategory: draft.subcategory,
    gender: draft.gender,
    fabric: draft.fabric,
    material: draft.material,
    primaryColor: draft.primaryColor,
    secondaryColor: draft.secondaryColor,
    colors: Array.isArray(draft.colors) ? draft.colors : undefined,
    patterns: Array.isArray(draft.patterns) ? draft.patterns : undefined,
    work: Array.isArray(draft.work) ? draft.work : undefined,
    occasion: Array.isArray(draft.occasion) ? draft.occasion : undefined,
    sizes: Array.isArray(draft.sizes) ? draft.sizes : undefined,
    season: draft.season,
    fit: draft.fit,
    length: draft.length,
    highlights: Array.isArray(draft.highlights) ? draft.highlights : undefined,
    careInstructions: Array.isArray(draft.careInstructions) ? draft.careInstructions : undefined,
    tags: Array.isArray(draft.tags) ? draft.tags : undefined,
    stock: Number.isFinite(Number(draft.stock)) ? Math.round(Number(draft.stock)) : undefined,
    availability: draft.availability,
  };
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined || payload[key] === "") delete payload[key];
  }
  return payload;
}

export function adminCreatedThisProduct(draft, actor) {
  const creator = String(draft?.createdBy || "").trim();
  if (!creator) return false;
  const mine = [actor?.id, actor?.adminId, actor?._uuid]
    .filter(Boolean)
    .map((value) => String(value));
  return mine.includes(creator);
}

/** Returns true for any admin-tier portal value ("admin" or "super-admin"). */
const isAdminPortal = (p) => p === "admin" || p === "super-admin";

export async function loadProductDraft(productId, portal = "admin") {
  if (isAdminPortal(portal)) {
    return fetchAdminProduct(productId);
  }
  const result = await apiEmployeeGetProduct(productId);
  if (result.ok && result.product) {
    upsertServerProducts([result.product]);
    return result;
  }
  const local = catalogRepository.find(productId);
  if (local) return { ok: true, product: local };
  return result;
}

/**
 * @returns {Promise<{ ok: true, product: object } | { ok: false, error: string }>}
 */
export async function persistProductDraft({ draft, portal, actor }) {
  if (isAdminPortal(portal)) {
    const payload = buildProductDraftPayload(draft);
    let id = draft.id;
    if (!draft.exists && !id) {
      const nextId = await apiAdminGetNextId(draft.category);
      if (!nextId.ok) {
        return {
          ok: false,
          error:
            formatAdminError(nextId, { entity: "product", action: "allocated an ID for" }) ||
            nextId.error ||
            "The server could not allocate a Product ID.",
        };
      }
      id = nextId.nextId;
    }
    const result = await persistAdminProduct({ ...payload, id: id ?? undefined }, { isNew: !draft.exists });
    if (!result.ok) {
      return {
        ok: false,
        error:
          formatAdminError(result, { entity: "product", action: "saved" }) ||
          "The product could not be saved.",
      };
    }
    const serverProduct = (await fetchAdminProduct(result.product?.id ?? id)).product ?? result.product;
    const nextDraft = draftFromProduct({ ...(result.product ?? {}), ...(serverProduct ?? {}) });
    return { ok: true, product: nextDraft };
  }

  void actor;
  const body = buildEmployeeProductPayload(draft);
  const result = draft.exists
    ? await apiEmployeeUpdateProduct(draft.id, body)
    : await apiEmployeeCreateDraft(body);
  if (!result.ok) {
    return {
      ok: false,
      error: formatAdminError(result, { entity: "product", action: "saved" }) || result.error || "The product could not be saved.",
    };
  }
  const id = result.product?.id ?? draft.id;
  const fresh = id ? await apiEmployeeGetProduct(id) : result;
  const productRecord = fresh.product ?? result.product;
  if (productRecord) upsertServerProducts([productRecord]);
  return { ok: true, product: draftFromProduct(productRecord) };
}
