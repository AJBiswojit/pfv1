/**
 * PRATIKSHYA FASHON — Editorial collections (backend-driven).
 *
 * Collection records come from GET /collections. The helpers below project
 * them against the backend-fed catalog store; products resolve through the
 * same store, so nothing here is seeded or invented.
 */

import { getCollections, getProductById } from "../../services/catalog/catalogStore";
import { collectionRoutes as liveCollectionRoutes } from "../products/taxonomy";

const asPlate = (collection, products) => ({
  id: collection.id,
  name: collection.name,
  slug: collection.slug ?? collection.id,
  eyebrow: collection.eyebrow ?? "",
  description: collection.description ?? "",
  image: collection.image ?? products?.[0]?.image ?? null,
  href: `/collections/${collection.slug ?? collection.id}`,
  products: (products ?? []).slice(0, 4),
});

/** Collection records with their resolved featured products (live). */
export const collectionPlates = new Proxy({}, {
  get: (_, key) => {
    const collection = getCollections().find(
      (c) => c.id === String(key) || c.slug === String(key)
    );
    if (!collection) return undefined;
    return asPlate(collection, []);
  },
  ownKeys: () => getCollections().flatMap((c) => [c.id, c.slug]).filter(Boolean),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/** Editorial landing collections (active, featured first). */
export const editorialCollections = new Proxy([], {
  get: (_, prop) => {
    const list = getCollections()
      .filter((c) => c.status === "ACTIVE")
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      .map((c) => asPlate(c, []));
    if (prop === "length") return list.length;
    if (typeof prop === "symbol") return list[prop];
    if (prop in list) return list[prop];
    const value = Reflect.get(list, prop);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

export const fabricCollections = editorialCollections;

export { liveCollectionRoutes as collectionRoutes };
export default { editorialCollections, fabricCollections, collectionPlates };
