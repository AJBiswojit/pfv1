/**
 * Shared taxonomy lifecycle — one map for category and subcategory.
 *
 * Create always starts as DRAFT. Status is never a form field; the only
 * legal hops are the dedicated activate / archive / restore endpoints
 * already owned by `taxonomyRepository`.
 */

import taxonomyRepository, { TAXONOMY_STATUS } from "./taxonomyRepository";

export const TAXONOMY_KIND = {
  CATEGORY: "category",
  SUBCATEGORY: "subcategory",
};

const TRANSITIONS = {
  [TAXONOMY_KIND.CATEGORY]: {
    activate: taxonomyRepository.activateCategory,
    archive: taxonomyRepository.archiveCategory,
    restore: taxonomyRepository.restoreCategory,
  },
  [TAXONOMY_KIND.SUBCATEGORY]: {
    activate: taxonomyRepository.activateSubcategory,
    archive: taxonomyRepository.archiveSubcategory,
    restore: taxonomyRepository.restoreSubcategory,
  },
};

/**
 * Buttons for one taxonomy row. DRAFT can still be archived without
 * going live; ACTIVE archives; ARCHIVED restores.
 */
export function taxonomyLifecycleActions(status) {
  if (status === TAXONOMY_STATUS.ARCHIVED) {
    return [{ key: "restore", label: "Restore", verb: "restored" }];
  }
  const actions = [];
  if (status === TAXONOMY_STATUS.DRAFT) {
    actions.push({ key: "activate", label: "Activate", verb: "activated" });
  }
  actions.push({ key: "archive", label: "Archive", verb: "archived" });
  return actions;
}

export function runTaxonomyTransition(kind, actionKey, id, actor) {
  const run = TRANSITIONS[kind]?.[actionKey];
  if (!run) {
    return Promise.resolve({
      ok: false,
      error: `Unknown taxonomy transition: ${kind}.${actionKey}`,
    });
  }
  return run(id, actor);
}

export function taxonomyTransitionNotice(kind, actionKey, { productCount = 0 } = {}) {
  const label = kind === TAXONOMY_KIND.CATEGORY ? "Category" : "Subcategory";
  if (actionKey === "activate") {
    return `${label} activated on the server. It can now be assigned to products.`;
  }
  if (actionKey === "restore") {
    return `${label} restored on the server.`;
  }
  if (actionKey === "archive" && kind === TAXONOMY_KIND.CATEGORY && productCount) {
    return "Category archived on the server. It contains products, and the taxonomy API exposes no permanent-delete route — products were left untouched.";
  }
  if (actionKey === "archive" && kind === TAXONOMY_KIND.SUBCATEGORY) {
    return "Subcategory archived on the server. Products remain intact — the backend keeps product references.";
  }
  return `${label} archived on the server.`;
}

/** Keep a select selected when the stored value is an id, slug or name. */
export function resolveTaxonomySelectValue(items, current) {
  if (!current) return "";
  const match = items.find(
    (entry) => entry.id === current || entry.slug === current || entry.name === current
  );
  return match?.id ?? current;
}
