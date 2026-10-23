/**
 * PRATIKSHYA FASHION — Batch 2 publish planning (F-10, F-09).
 *
 * The control centre publishes a section through FOUR existing writes:
 * configure → create entry → activate entry → activate section. Nothing here
 * invents a fifth. This module only *describes* that sequence and yields the
 * next existing call; the editor executes it with the same API client, the
 * same payload shapes and the same permissions.
 *
 * Pure by construction: no React, no fetch, no storage. It cannot write.
 */

/* F-10: an entry that the backend already flags as not publicly eligible
   (`warning`) is never activated by the publish sequence — the server would
   either reject it or the storefront would silently drop it. It is reported
   instead. */
const activatable = (row) => !row.isActive && !row.warning;

/**
 * What the publish sequence would do, in order, without touching the revision
 * numbers (those are read from each response at execution time).
 */
export function publishPlan(section) {
  if (!section?.configured) return [];
  const steps = [];
  for (const row of section.items ?? []) {
    if (activatable(row)) steps.push({ kind: 'activate-entry', contentType: row.contentType, id: row.id, label: `Activate ${row.contentType.toLowerCase()} entry ${row.slotKey}` });
  }
  if (!section.isActive) steps.push({ kind: 'activate-section', label: 'Activate the section' });
  return steps;
}

/**
 * The next existing call that moves the section toward live, computed against
 * the latest server snapshot. `null` means there is nothing left to do.
 * Bodies keep the exact shapes the endpoints already accept.
 */
export function nextPublishStep(section) {
  if (!section?.configured) return null;
  const revision = section.revision ?? 0;
  const row = (section.items ?? []).find(activatable);
  if (row) {
    return {
      kind: 'activate-entry',
      label: `Activate ${row.contentType.toLowerCase()} entry ${row.slotKey}`,
      suffix: `/items/${encodeURIComponent(row.id)}`,
      method: 'patch',
      body: { expectedRevision: revision, isActive: true },
    };
  }
  if (!section.isActive) {
    return { kind: 'activate-section', label: 'Activate the section', suffix: '', method: 'put', body: { expectedRevision: revision, isActive: true } };
  }
  return null;
}

const entriesLabel = (count) => `${count} ${count === 1 ? 'entry' : 'entries'}`;

/**
 * A one-line, honest statement of where the section stands — the sentence the
 * old panel never printed. Derived only from the section payload.
 */
export function publishSummary(section) {
  const items = section?.items ?? [];
  const total = items.length;
  const active = items.filter((row) => row.isActive).length;
  const ineligible = items.filter((row) => row.warning);
  const configured = Boolean(section?.configured);
  const live = configured && Boolean(section.isActive);
  const checklist = [
    { id: 'configured', done: configured, text: 'Configure the section (stays hidden)' },
    { id: 'entries', done: total > 0, text: 'Save at least one entry' },
    { id: 'active-entries', done: total > 0 && active === total, text: 'Activate every entry' },
    { id: 'active-section', done: live, text: 'Activate the section' },
  ];
  const next = checklist.find((step) => !step.done);
  let text;
  if (!configured) text = 'Not configured · hidden on the storefront. Configure it, then add an entry.';
  else if (live && total === 0) text = 'Section active · no entries yet, so the storefront shows nothing here.';
  else if (live && active === total) text = `Live on the storefront · ${entriesLabel(total)}, all active.`;
  else if (live) text = `Section active · ${active} of ${entriesLabel(total)} active.`;
  else if (total === 0) text = 'Section inactive · no entries yet.';
  else text = `Section inactive · ${entriesLabel(total)} (${active} active).`;
  return { text, checklist, next: next?.text ?? 'Nothing left to publish', total, active, configured, live, ineligible };
}

/**
 * Why the Publish button is disabled, in the operator's words. Each reason is
 * a real precondition — either this client's permission, the payload state, or
 * an unresolved conflict. No reason is inferred from a failure.
 */
export function publishBlockers(section, { write = false, mediaAssign = false, dirty = false, blocked = false } = {}) {
  const reasons = [];
  if (!write) reasons.push('marketing.manage is required to publish.');
  if (blocked) reasons.push('Resolve the conflict or reload before publishing.');
  if (dirty) reasons.push('Save your pending changes first — Publish applies saved state only.');
  if (!section?.configured) reasons.push('Configure the section first.');
  /* F-09: activating a section that already has an active MEDIA entry needs
     media.assign server-side (`check_media_grant` on activate). Publish would
     otherwise be offered and then fail on its last step with a 403 — the same
     rule the Activate button already explains must disable this too. */
  const activation = section ? sectionActivationReason(section, { mediaAssign }) : null;
  if (activation) reasons.push(activation);
  if (!mediaAssign && publishPlan(section).some((step) => step.kind === 'activate-entry' && step.contentType === 'MEDIA')) {
    reasons.push('Publishing this section activates MEDIA entries, which needs media.assign (ask an administrator).');
  }
  return reasons;
}

/**
 * F-09: the section-level activation gate that used to disable the button in
 * silence. Returns the explanation, or null when the control is available.
 */
export function sectionActivationReason(section, { mediaAssign = false } = {}) {
  if (!section || section.isActive) return null;
  const activeMedia = (section.items ?? []).some((row) => row.contentType === 'MEDIA' && row.isActive);
  if (activeMedia && !mediaAssign) {
    return 'This section has an active media entry. Activating the section needs media.assign (ask an administrator).';
  }
  return null;
}

/**
 * F-16: the reorder group the backend supports for this row, or null when the
 * slot is a singleton and cannot be reordered. Mirrors the backend GROUPS map
 * (trust TEXT, sarees lookbook MEDIA) plus per-slot PRODUCT ordering.
 */
export function reorderGroupFor(sectionKey, contentType, row) {
  if (!row) return null;
  if (sectionKey === 'trust' && contentType === 'TEXT') return 'trust-items';
  if (sectionKey === 'sarees' && contentType === 'MEDIA') return 'lookbook';
  if (contentType === 'PRODUCT') return row.slotKey;
  return null;
}
