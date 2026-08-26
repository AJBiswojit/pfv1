/** Deterministic isolation for tests that exercise the canonical product workflow.
 *
 * The runtime product register is now backend-owned: there is no static
 * catalogue seed. Tests that exercise workflow/command logic therefore build
 * a small canonical fixture in the in-memory register (same canonical ID
 * convention, no demo records, no localStorage).
 */

import catalogRepository, { persistCanonicalCatalogueState } from "../../src/services/catalogRepository.js";
import mediaRepository from "../../src/services/media/mediaRepository.js";
import { resetGroups } from "../../src/services/media/productMediaGroups.js";
import { loadActivity, saveActivity } from "../../src/services/employees/activityService.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Small canonical product fixture used by workflow tests. */
const FIXTURE_PRODUCTS = [
  {
    id: "PF-W-SAR-COT-0001",
    name: "Cotton Saree Fixture",
    sku: "PF-W-SAR-COT-0001",
    slug: "cotton-saree-fixture",
    department: "women",
    category: "sarees",
    subcategory: "cotton",
    gender: "Women",
    fabric: "Cotton",
    price: 2499,
    originalPrice: 2999,
    stock: 10,
    availability: "in-stock",
    colors: ["Ivory"],
    sizes: ["Free Size"],
    status: "DRAFT",
    published: false,
    variants: [],
    badges: [],
    media: { primary: "/images/products/.test/cotton-fixture.avif", gallery: [] },
  },
  {
    id: "PF-W-LEH-BRI-0001",
    name: "Bridal Lehenga Fixture",
    sku: "PF-W-LEH-BRI-0001",
    slug: "bridal-lehenga-fixture",
    department: "women",
    category: "lehengas",
    subcategory: "bridal",
    gender: "Women",
    fabric: "Silk",
    price: 45000,
    originalPrice: 50000,
    stock: 3,
    availability: "low-stock",
    colors: ["Red"],
    sizes: ["S", "M", "L"],
    status: "DRAFT",
    published: false,
    variants: [],
    badges: [],
  },
];

// Each Node test worker captures the in-memory fixture state before mutation.
const CANONICAL_PRODUCTS = clone(FIXTURE_PRODUCTS);
const CANONICAL_ACTIVITY = clone(loadActivity());

export const setupCanonicalState = () => {
  persistCanonicalCatalogueState(clone(CANONICAL_PRODUCTS), "test-canonical-state");
  mediaRepository.resetMedia();
  // Advance the media version so dependent indexes cannot retain a prior test's ownership.
  const cacheBuster = mediaRepository.create({
    id: "test-fixture-cache-buster",
    url: "/images/products/.test/cache-buster.avif",
    title: "Test fixture cache buster",
    status: "DRAFT",
  });
  if (cacheBuster) mediaRepository.remove(cacheBuster.id);
  resetGroups();
  saveActivity(clone(CANONICAL_ACTIVITY));

  return {
    state: "CANONICAL",
    products: catalogRepository.all(),
    media: mediaRepository.getAll(),
  };
};

export const getCanonicalFixtureSnapshot = () => ({
  products: clone(CANONICAL_PRODUCTS),
  activity: clone(CANONICAL_ACTIVITY),
});
