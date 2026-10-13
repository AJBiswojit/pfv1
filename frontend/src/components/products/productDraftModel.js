/**
 * Shared product-draft shape for the full editor and Quick Create.
 * Persistence still goes through the same admin/employee write paths —
 * this file only normalises the in-memory record the forms edit.
 */

import { PRODUCT_STATUSES, REVIEW_STATES } from "../../config/productCatalogConfig";
import { departmentForProduct } from "../../data/products/departments";

export const emptyDraft = () => ({
  id: null,
  exists: false,
  department: "",
  name: "",
  sku: "",
  brand: "Pratikshya Fashion",
  productType: "fashion",
  productCode: "",
  barcode: "",
  internalReference: "",
  category: "",
  subcategory: "",
  gender: "Women",
  shortDescription: "",
  description: "",
  highlights: [],
  specifications: {},
  careInstructions: [],
  deliveryInfo: "",
  returnInfo: "",
  returnPolicy: { eligibility: "", window: "", notes: "" },
  fabric: "",
  material: "",
  primaryColor: "",
  secondaryColor: "",
  colors: [],
  patterns: [],
  work: [],
  occasion: [],
  sizes: [],
  season: "",
  fit: "",
  length: "",
  collection: "",
  collections: [],
  tags: [],
  image: "",
  pricing: {
    mrp: "",
    sellingPrice: "",
    discountType: "none",
    discountValue: "",
    taxMode: "INCLUSIVE",
    taxRate: 0,
    customTaxRate: false,
  },
  variants: [],
  stock: 0,
  availability: "in-stock",
  inventoryTracked: false,
  lowStockThreshold: 5,
  seo: { title: "", description: "" },
  slug: "",
  status: PRODUCT_STATUSES.DRAFT,
  review: { state: REVIEW_STATES.NONE, rejectionReason: "" },
  isFeatured: false,
  isBestseller: false,
  isNew: false,
  isLimitedEdition: false,
  isTrending: false,
});

export const draftFromProduct = (product) => ({
  ...emptyDraft(),
  ...product,
  exists: true,
  id: product.id,
  department: departmentForProduct(product) || "",
  image: product.image?.src || product.image || "",
  pricing: {
    mrp: product.pricing?.mrp ?? product.originalPrice ?? product.price ?? "",
    sellingPrice: product.pricing?.sellingPrice ?? product.price ?? "",
    discountType: product.pricing?.discountType || "none",
    discountValue: product.pricing?.discountValue || "",
    taxMode: product.pricing?.taxMode || "INCLUSIVE",
    taxRate: product.pricing?.taxRate ?? 0,
    customTaxRate: Boolean(product.pricing?.customTaxRate),
  },
  variants: (product.variants || []).map((variant) => ({
    ...variant,
    priceOverride: variant.priceOverride ?? "",
  })),
  highlights: Array.isArray(product.highlights) ? [...product.highlights] : [],
  careInstructions: Array.isArray(product.careInstructions) ? [...product.careInstructions] : [],
  specifications:
    product.specifications && typeof product.specifications === "object"
      ? { ...product.specifications }
      : {},
  returnPolicy:
    product.returnPolicy && typeof product.returnPolicy === "object"
      ? { ...product.returnPolicy }
      : { eligibility: "", window: "", notes: "" },
});
