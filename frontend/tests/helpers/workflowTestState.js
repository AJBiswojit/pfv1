/** Deterministic isolation for tests that exercise the canonical product workflow.
 *
 * The runtime product register is backend-owned: there is no static
 * catalogue seed. Tests/audits therefore build a small canonical fixture in
 * the in-memory register (same ID convention, no demo customers, no
 * localStorage authority).
 *
 * Storefront projections (`getLiveStorefrontProducts`) read catalogStore.
 * This helper keeps that snapshot in sync with PUBLISHED rows only.
 */

import catalogRepository, {
  persistCanonicalCatalogueState,
  subscribeCatalogRegister,
} from "../../src/services/catalogRepository.js";
import mediaRepository from "../../src/services/media/mediaRepository.js";
import { resetGroups } from "../../src/services/media/productMediaGroups.js";
import { loadActivity, saveActivity } from "../../src/services/employees/activityService.js";
import { applyCatalogSnapshot } from "../../src/services/catalog/catalogStore.js";
import { departments } from "../../src/data/catalog/taxonomy.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

const COTTON_PRIMARY = "/images/products/women/sarees/cotton/PF-W-SAR-COT-0001/primary.avif";
const LEHENGA_PRIMARY = "/images/products/women/lehengas/bridal/PF-W-LEH-BRI-0002/primary.avif";
const KIDS_PRIMARY = "/images/products/kids/girls/dresses/PF-K-GRL-DRS-0001/primary.avif";

const productFixture = ({
  id,
  name,
  department,
  category,
  subcategory,
  gender,
  fabric,
  price,
  originalPrice,
  stock,
  availability,
  colors,
  sizes,
  image,
}) => ({
  id,
  name,
  sku: id,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  department,
  category,
  subcategory,
  gender,
  fabric,
  price,
  originalPrice,
  stock,
  availability,
  colors,
  sizes,
  status: "DRAFT",
  published: false,
  variants: [],
  badges: [],
  description: `${name} — canonical workflow fixture.`,
  shortDescription: name,
  image,
  media: { primary: image, gallery: [] },
});

/** Canonical workflow fixture Product IDs — test/audit/QA only, never a catalogue seed. */
export const FIXTURE_IDS = Object.freeze({
  COTTON: "PF-W-SAR-COT-0001",
  LEHENGA: "PF-W-LEH-BRI-0002",
  KIDS: "PF-K-GRL-DRS-0001",
});

/** Small canonical product fixture used by workflow tests and audits. */
const FIXTURE_PRODUCTS = [
  productFixture({
    id: "PF-W-SAR-COT-0001",
    name: "Cotton Saree Fixture",
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
    image: COTTON_PRIMARY,
  }),
  productFixture({
    id: "PF-W-LEH-BRI-0002",
    name: "Bridal Lehenga Fixture",
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
    image: LEHENGA_PRIMARY,
  }),
  productFixture({
    id: "PF-K-GRL-DRS-0001",
    name: "Kids Dress Fixture",
    department: "kids",
    category: "girls",
    subcategory: "dresses",
    gender: "Girls",
    fabric: "Cotton",
    price: 1899,
    originalPrice: 2199,
    stock: 8,
    availability: "in-stock",
    colors: ["Pink"],
    sizes: ["3-4Y", "5-6Y"],
    image: KIDS_PRIMARY,
  }),
];

const CANONICAL_PRODUCTS = clone(FIXTURE_PRODUCTS);
const CANONICAL_ACTIVITY = clone(loadActivity());

const taxonomyCategories = () =>
  departments.flatMap((department) =>
    department.categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug || category.id,
      status: "ACTIVE",
      departmentId: department.id,
      subcategories: (category.subcategories || []).map((sub) => ({
        id: sub.id,
        name: sub.name,
        slug: sub.slug || sub.id,
        status: "ACTIVE",
        categoryId: category.id,
      })),
    }))
  );

export const syncStorefrontFromRegister = () => {
  const published = catalogRepository
    .all()
    .filter((product) => product.status === "PUBLISHED" || product.published === true);
  const categories = taxonomyCategories();
  const subcategories = Object.fromEntries(
    categories.map((category) => [category.id, category.subcategories || []])
  );
  applyCatalogSnapshot({
    products: published,
    categories,
    collections: [],
    subcategories,
  });
};

let unsubscribeRegister = null;

export const setupCanonicalState = () => {
  if (!unsubscribeRegister) {
    unsubscribeRegister = subscribeCatalogRegister(syncStorefrontFromRegister);
  }
  persistCanonicalCatalogueState(clone(CANONICAL_PRODUCTS), "test-canonical-state");
  mediaRepository.resetMedia();
  const cacheBuster = mediaRepository.create({
    id: "test-fixture-cache-buster",
    url: COTTON_PRIMARY,
    title: "Test fixture cache buster",
    status: "DRAFT",
  });
  if (cacheBuster) mediaRepository.remove(cacheBuster.id);
  resetGroups();
  saveActivity(clone(CANONICAL_ACTIVITY));
  syncStorefrontFromRegister();

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
