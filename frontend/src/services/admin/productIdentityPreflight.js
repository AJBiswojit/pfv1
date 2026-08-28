/**
 * PRATIKSHYA FASHON — product identity pre-flight (Phase 3 Block 4).
 *
 * Closes PF3-N16: `GET /admin/products/availability` existed with zero call
 * sites while the editor decided SKU/slug uniqueness from
 * `catalogRepository` — an in-memory session cache that holds only the records
 * this browser session happened to fetch. That cache is wrong in BOTH
 * directions:
 *
 *   * false negative — a deep link straight to the editor, or a catalogue
 *     larger than the fetched page, leaves the cache empty/partial, so a real
 *     duplicate looks free right up until the server answers 409;
 *   * false positive — its slug comparison is case-SENSITIVE while the server
 *     is case-insensitive, and a record removed or renamed elsewhere lingers,
 *     so a legitimate save can be blocked by a collision that does not exist.
 *
 * This module holds the pure decision logic so it is testable without a DOM;
 * `ProductEditor` owns only the effect that calls it. The server verdict is
 * AUTHORITATIVE for the product's own sku/slug — there is no local fallback,
 * because a fallback is precisely what produced the false verdicts above.
 *
 * Pre-flight never replaces enforcement. A create/update can still lose a race
 * to a concurrent write, so Phase 3 Block 3's 409 on the write path remains
 * the only guarantee (`API_CONTRACT.md` §9.4-9.5).
 */

/** Identity values are compared trimmed, exactly as the server does. */
export const normaliseIdentity = (value) => String(value ?? "").trim();

/**
 * The query for the availability probe, or `null` when there is nothing worth
 * asking about (no sku and no slug).
 *
 * `excludeId` is sent ONLY for a product that already exists on the server, so
 * a new product never fabricates one. Sending an id the server does not know
 * would simply exclude nothing, but claiming to edit a product that does not
 * exist is a lie we do not need to tell.
 */
export function buildAvailabilityQuery(draft = {}) {
  const sku = normaliseIdentity(draft.sku);
  const slug = normaliseIdentity(draft.slug);
  if (!sku && !slug) return null;

  const query = {};
  if (sku) query.sku = sku;
  if (slug) query.slug = slug;
  if (draft.exists && normaliseIdentity(draft.id)) {
    query.excludeId = normaliseIdentity(draft.id);
  }
  return query;
}

/**
 * Should the cached verdict still be trusted for the values on screen?
 *
 * The probe is asynchronous, so a verdict must be pinned to the exact
 * sku/slug/excludeId it was requested for; otherwise a stale answer could
 * condemn a value the operator has since corrected.
 */
export function verdictMatchesQuery(verdict, query) {
  if (!verdict || !query) return false;
  return (
    normaliseIdentity(verdict.sku) === normaliseIdentity(query.sku) &&
    normaliseIdentity(verdict.slug) === normaliseIdentity(query.slug) &&
    normaliseIdentity(verdict.excludeId) === normaliseIdentity(query.excludeId)
  );
}

/**
 * Turn a server availability verdict into the editor's field errors.
 *
 * Returns `{}` when nothing is known yet or the probe failed: an unanswered
 * pre-flight must never block a save. The write path's 409 is what actually
 * protects the catalogue, and it names the same value with the same message.
 */
export function identityErrors(verdict, query) {
  if (!verdictMatchesQuery(verdict, query)) return {};
  const errors = {};
  if (query.sku && verdict.skuTaken) {
    errors.sku = `SKU “${query.sku}” is already used by another product.`;
  }
  if (query.slug && verdict.slugTaken) {
    errors.slug = verdict.suggestedSlug
      ? `URL slug “${query.slug}” is already in use. Try “${verdict.suggestedSlug}”.`
      : `URL slug “${query.slug}” is already in use.`;
  }
  return errors;
}

/**
 * Normalise one `checkAvailability` result into a verdict pinned to its query.
 * A failed probe yields `null` — unknown, never "free" and never "taken".
 */
export function toVerdict(result, query) {
  if (!result || !result.ok || !query) return null;
  return {
    sku: normaliseIdentity(query.sku),
    slug: normaliseIdentity(query.slug),
    excludeId: normaliseIdentity(query.excludeId),
    skuTaken: Boolean(result.skuTaken),
    slugTaken: Boolean(result.slugTaken),
    suggestedSlug: result.suggestedSlug ?? null,
  };
}
