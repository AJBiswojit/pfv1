/**
 * PRATIKSHYA FASHION — PHASE 7 · the listing's refine surface, in the design's
 * chip-and-drawer vocabulary.
 *
 * The production listing's filters are `components/storefront/FilterPanel` (a
 * thirteen-facet sidebar) and `components/storefront/FilterDrawer` (the same
 * panel on a phone). The design's shop draws none of that — it narrows a
 * listing with a row of chips and nothing else — so this module re-expresses
 * the capability in the design's own language rather than dropping it:
 *
 *   · every option is the design's `.chip` (the control its own option selector
 *     and size picker use), never a checkbox the design does not draw;
 *   · the groups live in the design's `.drawer` chrome (the bag drawer's), at
 *     every width, so the design's single-column shop stays single-column;
 *   · the counts, the labels, the truncation limits (12 for chips and swatches,
 *     6 for lists) and the group order are the production panel's, computed by
 *     the same `buildFacets` the production panel renders.
 *
 * NOTHING HERE FILTERS. Every press is handed to `useCatalogueQuery` by the
 * page, which writes the URL and re-queries the backend — so a filtered listing
 * is shareable, the back button walks the refinements, and a ported listing and
 * a production listing answer one URL with one result set.
 */

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, SlidersHorizontal, X } from "lucide-react";
import { chipLabel } from "../../../../data/products/facets.js";
import useEscape from "../../hooks/useEscape.js";
import useFocusTrap from "../../hooks/useFocusTrap.js";
import useLockBody from "../../hooks/useLockBody.js";
import { cx } from "../../utils/format.js";
import { ease } from "../../utils/motion.js";

/** The production panel's own rule: long lists are folded until asked for. */
const optionLimit = (facet) => (facet.kind === "swatch" || facet.kind === "chip" ? 12 : 6);

/** The production panel opens its first four groups and folds the tail. */
const OPEN_BY_DEFAULT = 4;

const isSelected = (selected, optionId) =>
  Array.isArray(selected) ? selected.includes(optionId) : selected === optionId;

function FacetGroup({ facet, selected, onToggle, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);

  const activeCount = Array.isArray(selected) ? selected.length : selected ? 1 : 0;
  const options = facet.options ?? [];
  const limit = optionLimit(facet);
  const overflowing = options.length > limit;
  const visible = expanded || !overflowing ? options : options.slice(0, limit);

  return (
    <div className="listing-group">
      <button
        type="button"
        className="listing-group__head"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="label">
          {facet.label}
          {activeCount > 0 ? ` (${activeCount})` : ""}
        </span>
        {open ? <Minus size={13} strokeWidth={1.5} /> : <Plus size={13} strokeWidth={1.5} />}
      </button>

      {open ? (
        <div className="listing-group__options">
          {visible.map((option) => {
            const active = isSelected(selected, option.id);
            /* `buildFacets` attaches the swatch to a colour option; the dot
               keeps the recognition affordance the production panel's swatch
               tiles give, inside the design's chip. */
            const swatch = facet.kind === "swatch" ? option.swatch : null;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                title={`${option.label} (${option.count})`}
                className={cx("chip chip--sm", active && "is-active")}
                onClick={() => onToggle(facet.id, option.id)}
              >
                {swatch ? (
                  <span
                    className="listing-group__swatch"
                    style={{ backgroundColor: swatch }}
                    aria-hidden="true"
                  />
                ) : null}
                {option.label}
                <span className="listing-group__count">{option.count}</span>
              </button>
            );
          })}

          {overflowing ? (
            <button
              type="button"
              className="chip chip--sm listing-group__more"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Show less" : `Show all ${options.length}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ListingControls({
  facets = [],
  filters = {},
  activeChips = [],
  activeCount = 0,
  onToggle,
  onRemove,
  onClear,
  resultCount = 0,
  unit = "pieces",
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  useLockBody(open);
  useEscape(open, () => setOpen(false));
  useFocusTrap(panelRef, open);

  /* A facet with nothing in it cannot narrow anything; `buildFacets` already
     drops those, and this makes the guarantee explicit at the render site. */
  const groups = useMemo(
    () => facets.filter((facet) => (facet.options ?? []).length > 0),
    [facets],
  );

  return (
    <>
      <div className="listing-controls">
        <button
          type="button"
          className="chip"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <SlidersHorizontal size={13} strokeWidth={1.5} aria-hidden="true" />
          Refine
          {activeCount > 0 ? ` (${activeCount})` : ""}
        </button>

        {activeChips.length > 0 ? (
          <div className="listing-chips">
            {activeChips.map((chip) => (
              <button
                key={`${chip.facet}-${chip.value}`}
                type="button"
                className="chip chip--sm is-active"
                aria-label={`Remove filter ${chip.facetLabel}: ${chipLabel(chip.facet, chip.value)}`}
                onClick={() => onRemove(chip.facet, chip.value)}
              >
                {chipLabel(chip.facet, chip.value)}
                <X size={11} strokeWidth={1.5} aria-hidden="true" />
              </button>
            ))}
            <button type="button" className="listing-chips__clear" onClick={onClear}>
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              ref={panelRef}
              className="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Refine this edit"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.4, ease: ease.out }}
            >
              <div className="drawer__head">
                <h2>
                  Refine <span>{`${resultCount} ${unit}`}</span>
                </h2>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setOpen(false)}
                  aria-label="Close filters"
                  data-autofocus
                >
                  <X size={18} strokeWidth={1.4} />
                </button>
              </div>

              <div className="drawer__lines listing-groups">
                {groups.length === 0 ? (
                  <p className="drawer__empty-title">Nothing to narrow here yet.</p>
                ) : (
                  groups.map((facet, index) => (
                    <FacetGroup
                      key={facet.id}
                      facet={facet}
                      selected={filters[facet.id]}
                      onToggle={onToggle}
                      defaultOpen={index < OPEN_BY_DEFAULT}
                    />
                  ))
                )}
              </div>

              <div className="drawer__foot">
                <button
                  type="button"
                  className="btn btn--solid btn--block"
                  onClick={() => setOpen(false)}
                >
                  <span>{`Show ${resultCount} ${unit}`}</span>
                </button>
                {activeCount > 0 ? (
                  <button type="button" className="drawer__continue" onClick={onClear}>
                    Clear all filters
                  </button>
                ) : null}
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
