/**
 * PRATIKSHYA FASHION — PHASE 7 · which listing a path stands for.
 *
 * The design's shop page took one thing from the URL — a `:category` key — and
 * answered it from its own table (`getProductsFor`). This application's listing
 * space is larger, and every path in it is already defined somewhere else, so
 * the active customer listing uses this shared scope resolver
 * asked in the same order, against the same registers, with the same answer for
 * a path the application does not serve (`null` → the design's 404, which is
 * the same normalized scope the routed page renders).
 *
 *   /category/:slug      the registered category route, else the taxonomy
 *                        repository — ACTIVE only;
 *   /collections/:slug   the registered collection route, else the repository
 *                        — ACTIVE only;
 *   a navigation path    `resolveNavigationScope(pathname)` (the scope
 *                        register) plus the manifest's own metadata
 *                        (`getRouteMeta`), and for `/collections/<slug>` the
 *                        collection record and its authored plate;
 *   /shop, /explore      unscoped — the whole published catalogue, titled from
 *                        the design's own name table (`getTitleFor`);
 *   /search              unscoped, with the term read from `?q=`.
 *
 * COVERAGE, stated rather than implied: `navigationScopes` carries 69 keys, 39
 * of which the router actually registers. The rest (`/jewellery`,
 * `/women/cotton-sarees`, …) are not routes in this application — `App.jsx`
 * builds its routes from `routeManifest` — so they are unreachable in production
 * today, and the port does not invent them either. The Phase 7 report records
 * that as an audit finding.
 */

import {
  categoryRoutes,
  collectionRoutes,
  resolveNavigationScope,
} from "../../../../data/products/taxonomy.js";
import { collectionPlates } from "../../../../data/catalog/collections.js";
import { getRouteMeta } from "../../../../config/navigationConfig.js";
import taxonomyRepository from "../../../../services/taxonomyRepository.js";
import { getTitleFor } from "../../services/catalog.js";

/** A collection is browsable only while the register says it is live. */
const isLiveCollection = (collection) =>
  Boolean(collection) &&
  (collection.displayStatus === "ACTIVE" || collection.status === "ACTIVE");

/**
 * The scope a path stands for, or `null` when this application serves no
 * listing there.
 *
 * `mode` comes from the port's own route table (`CustomerStorefront.jsx`); the slug
 * and pathname come from the URL, so a page kept open across a back-button
 * navigation resolves with the same shared register used by the routed listing.
 */
export function resolveListingScope({ mode = "shop", slug = "", pathname = "/" } = {}) {
  if (mode === "shop" || mode === "explore") {
    return {
      id: null,
      /* The design's own table names the unscoped listing; nothing new is
         written for it. */
      title: getTitleFor(mode === "explore" ? "explore" : "all"),
      eyebrow: mode === "explore" ? "Explore PRATIKSHYA" : "Shop",
      description: "",
      filters: {},
      breadcrumb: [{ label: mode === "explore" ? "Explore" : "Shop" }],
    };
  }

  if (mode === "search") {
    return {
      id: null,
      title: "Search",
      eyebrow: "Search",
      description: "",
      filters: {},
      breadcrumb: [{ label: "Search" }],
    };
  }

  if (mode === "category") {
    /* The registered route first, from the shared navigation register: it
       carries the managed title, eyebrow and description. */
    let scope = categoryRoutes[slug] ?? null;
    if (!scope) {
      const category = taxonomyRepository.findCategory(slug);
      if (category?.status === "ACTIVE") {
        scope = {
          id: category.id,
          title: category.name,
          eyebrow: category.eyebrow || "Category",
          description: category.description,
          filters: { category: category.id },
        };
      }
    }
    /* …and the record still has to be live, which is the same second gate. */
    if (scope) {
      const current =
        taxonomyRepository.findCategory(slug) ?? taxonomyRepository.findCategory(scope.id);
      if (current?.status !== "ACTIVE") scope = null;
    }
    return scope ? { ...scope, breadcrumb: [{ label: "Shop", to: "/shop" }, { label: scope.title }] } : null;
  }

  if (mode === "collection") {
    let scope = collectionRoutes[slug] ?? null;
    if (!scope) {
      const collection = taxonomyRepository.findCollection(slug);
      if (isLiveCollection(collection)) {
        scope = {
          id: collection.id,
          title: collection.name,
          eyebrow: collection.eyebrow || "Collection",
          description: collection.description,
          filters: { collectionId: collection.id },
        };
      }
    }
    if (scope) {
      const current =
        taxonomyRepository.findCollection(slug) ?? taxonomyRepository.findCollection(scope.id);
      if (current?.displayStatus !== "ACTIVE") scope = null;
    }
    return scope
      ? {
          ...scope,
          breadcrumb: [{ label: "Collections", to: "/collections" }, { label: scope.title }],
        }
      : null;
  }

  /* A navigation path: the scope register, read the way the customer listing page
     reads it, plus the manifest's own metadata for the title. */
  const nav = resolveNavigationScope(pathname);
  const meta = getRouteMeta(pathname);
  const collectionSlug = pathname.startsWith("/collections/")
    ? pathname.slice("/collections/".length)
    : "";
  const collectionRecord = collectionSlug
    ? taxonomyRepository.findCollection(collectionSlug)
    : null;
  const plate = collectionSlug
    ? collectionPlates[collectionSlug] ?? collectionPlates[collectionRecord?.id]
    : null;

  let scope = null;
  if (collectionRecord && !isLiveCollection(collectionRecord)) {
    scope = null;
  } else if (nav || collectionRecord) {
    const filters =
      nav?.filters ?? (collectionRecord ? { collectionId: collectionRecord.id } : null);
    if (filters) {
      const title =
        collectionRecord?.name ?? plate?.name ?? nav?.title ?? meta?.label ?? collectionSlug;
      scope = {
        id: collectionRecord?.id ?? plate?.id ?? null,
        title,
        eyebrow: collectionRecord?.eyebrow || plate?.eyebrow || meta?.eyebrow || "Collection",
        description:
          collectionRecord?.description ?? plate?.description ?? meta?.description ?? "",
        filters,
        breadcrumb: collectionSlug
          ? [{ label: "Collections", to: "/collections" }, { label: title }]
          : meta?.breadcrumb,
      };
    }
  }
  return scope;
}

/**
 * The trail under the design's `.crumbs`, from the scope's own breadcrumb — the
 * fallback is the production header's own (Shop, or Collections for a
 * collection), so a scope without a trail still prints a true one.
 */
export function listingBreadcrumb(scope, mode = "shop") {
  const trail = scope?.breadcrumb;
  if (Array.isArray(trail) && trail.length > 0) return trail;
  const root =
    mode === "collection" ? { label: "Collections", to: "/collections" } : { label: "Shop", to: "/shop" };
  return [root, { label: scope?.title ?? "Shop" }];
}

export default resolveListingScope;
