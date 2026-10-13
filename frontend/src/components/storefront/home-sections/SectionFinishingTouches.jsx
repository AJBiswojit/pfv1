/**
 * PRATIKSHYA FASHION — homepage section 05 (Phase 2B).
 *
 * Project B's jewellery theatre: a dark stage on the left that shows the
 * editorial plate until a piece is brought into focus, a filter row, and a
 * tile grid that hands the focused piece back to the stage.
 *
 * DATA — the canonical `finishing-touches` category (bridal bangles and bridal
 * jewellery today) with its own subcategories as the filters, counted from the
 * live catalogue. Focusing a tile is a real, supported interaction: the stage
 * paints that product's own canonical photograph and links to its product
 * route, so nothing on this section is decorative.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";

import { FadeUp, MaskReveal, SectionLabel } from "../../../design-system";
import { useProductCovers } from "../../../hooks/useMedia";
import { productHref } from "../../../data/products";
import { buildFinishingSection } from "./sectionData";
import { SectionPlate, hasPlate } from "./sectionPlate";
import "./home-sections.css";

export default function SectionFinishingTouches({ data = null }) {
  const section = buildFinishingSection(data);
  const [type, setType] = useState("all");
  const [spot, setSpot] = useState(null);

  const products = section?.products ?? [];
  const rows = useProductCovers(products);
  const list = useMemo(
    () => (type === "all" ? rows : rows.filter((product) => String(product?.subcategory) === type)),
    [rows, type]
  );

  if (!section) return null;

  const stage = spot ?? null;
  /* The stage keeps B's dark theatre even with no editorial plate: the piece in
     focus supplies the picture, and without either the caption stands alone. */
  const stagePlate = stage ? stage.image : hasPlate(section.stage) ? section.stage : null;

  return (
    <section className="pf-sec pf-sec-jewel" aria-labelledby="pf-finishing-title">
      <div className="pf-sec__container pf-sec-jewel__grid">
        <div className="pf-sec-jewel__stage" onMouseLeave={() => setSpot(null)}>
          <MaskReveal from="up" duration={1.2} className="pf-sec-jewel__stage-frame">
            <AnimatePresence mode="sync" initial={false}>
              <motion.div
                key={stage ? stage.id : "editorial"}
                className="pf-sec-jewel__stage-img"
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                {stagePlate ? (
                  <SectionPlate image={stagePlate} alt="" eager sizes="(min-width: 900px) 36vw, 100vw" />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </MaskReveal>

          <div className="pf-sec-jewel__stage-cap" aria-live="polite">
            {stage ? (
              <>
                <span className="pf-sec-jewel__stage-kicker">
                  {stage.categoryLabel ?? stage.category ?? "The Edit"}
                </span>
                <Link to={productHref(stage)} className="pf-sec-jewel__stage-name">
                  {stage.name}
                </Link>
              </>
            ) : (
              <>
                <span className="pf-sec-jewel__stage-kicker">{section.stageKicker}</span>
                <span className="pf-sec-jewel__stage-name">
                  {list.length ? "Focus a piece to bring it to the light." : "Arriving soon."}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="pf-sec-jewel__side">
          <div>
            <SectionLabel index={section.index}>{section.label}</SectionLabel>
            <h2 id="pf-finishing-title" className="pf-sec__display pf-sec-jewel__title">
              {section.title} <em className="pf-sec__display--italic">{section.titleAccent}</em>
            </h2>
            <FadeUp delay={0.15}>
              <p className="pf-sec__lead pf-sec-jewel__lead">{section.lead}</p>
            </FadeUp>
          </div>

          {section.types.length > 1 ? (
            <div className="pf-sec-jewel__tabs" role="group" aria-label="Filter the edit">
              {section.types.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  aria-pressed={type === entry.key}
                  className="pf-sec-jewel__tab"
                  onClick={() => setType(entry.key)}
                >
                  {entry.label}
                  <sup>{entry.count}</sup>
                </button>
              ))}
            </div>
          ) : null}

          <div className="pf-sec-jewel__tiles">
            {list.map((product) => (
              <Link
                key={product.id}
                to={productHref(product)}
                className="pf-sec__plate"
                style={{ aspectRatio: "1 / 1", display: "block" }}
                onMouseEnter={() => setSpot(product)}
                onFocus={() => setSpot(product)}
                aria-label={product.name}
              >
                <SectionPlate image={product.image} alt="" sizes="(min-width: 900px) 18vw, 45vw" />
              </Link>
            ))}

            <div className="pf-sec-jewel__more">
              <Link to={section.to}>
                <span className="pf-sec-jewel__more-n">{section.types[0]?.count ?? 0}</span>
                <span className="pf-sec-jewel__more-t">Explore the edit</span>
              </Link>
            </div>
          </div>

          {!list.length ? (
            <p className="pf-sec-jewel__empty">
              Nothing is filed under this filter yet — the desk publishes pieces here as they are
              catalogued.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
