/**
 * PRATIKSHYA FASHION — homepage section 09 (Phase 2B).
 *
 * Project B's Bestsellers rail: a hairline head with the title on the left, a
 * filter row in the middle and a "view all" action on the right, an honest
 * note beneath (B prints one too), then a four-up product grid that re-flows
 * as the filter changes.
 *
 * The filters ARE the departments present in the live catalogue, so a filter
 * can only ever be shown when there is merchandise behind it. The ordering is
 * the catalogue's own deterministic selection — see `buildRailSection` and the
 * note line, which states plainly that a verified sales ranking does not exist
 * in the current backend rather than implying one.
 */

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { ArrowLink, SectionLabel } from "../../../design-system";
import { buildRailSection } from "./sectionData";
import SectionProducts from "./SectionProducts";
import "./home-sections.css";

export default function SectionProductRail({ data = null }) {
  const section = buildRailSection({ override: data });
  const [filter, setFilter] = useState("all");
  /* The underline slides between filters; under reduced motion it is drawn in
     place with no travel and no animation at all. */
  const reduceMotion = useReducedMotion();
  const Underline = reduceMotion ? "span" : motion.span;

  const list = useMemo(() => {
    const rows = section?.products ?? [];
    if (filter === "all") return rows;
    return rows.filter((product) => String(product?.department) === filter);
  }, [section, filter]);

  if (!section) return null;

  return (
    <section className="pf-sec pf-sec-best" aria-labelledby="pf-rail-title">
      <div className="pf-sec__container">
        <div className="pf-sec-best__head">
          <div>
            <SectionLabel index={section.index}>{section.label}</SectionLabel>
            <h2 id="pf-rail-title" className="pf-sec-best__title">
              {section.title}
            </h2>
          </div>

          {section.filters.length > 2 ? (
            <div className="pf-sec-best__filters" role="group" aria-label="Filter the rail">
              {section.filters.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  aria-pressed={filter === entry.key}
                  className="pf-sec-best__filter"
                  onClick={() => setFilter(entry.key)}
                >
                  {entry.label}
                  {filter === entry.key ? (
                    <Underline
                      className="pf-sec-best__filter-line"
                      {...(reduceMotion ? null : { layoutId: "pf-rail-line" })}
                    />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <ArrowLink to={section.to}>View all</ArrowLink>
        </div>

        <p className="pf-sec__note pf-sec-best__note">{section.note}</p>

        {list.length ? (
          <SectionProducts products={list} />
        ) : (
          <p className="pf-sec-best__empty">Nothing is filed under this filter yet.</p>
        )}
      </div>
    </section>
  );
}
