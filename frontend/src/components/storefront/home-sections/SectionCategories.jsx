/**
 * PRATIKSHYA FASHION — homepage section 02 (Phase 2B).
 *
 * Project B's category collage: a four-tile spread where one tile is tall and
 * dominant, one is offset, one sits on paper with its caption beneath the
 * plate, and one carries an inset paper card. The asymmetry is the section.
 *
 * The four tiles ARE the canonical departments (women, bridal, men, kids) —
 * their names, notes and routes come from `src/data/catalog/taxonomy.js`, so
 * a department added or renamed there reaches this section with no JSX change.
 * Each count is the number of live products filed under that department, and
 * each plate resolves through the central media resolver.
 */

import { Link } from "react-router-dom";

import { FadeUp, SectionLabel, Arrow } from "../../../design-system";
import { SECTION_COPY, buildCategoryTiles } from "./sectionData";
import { SectionPlate, hasPlate } from "./sectionPlate";
import "./home-sections.css";

export default function SectionCategories({ data = null }) {
  const tiles = buildCategoryTiles(data);
  if (!tiles?.length) return null;

  /* The variant is the department's own position in the canonical taxonomy, so
     a department without a resolvable cover drops out of its designed grid
     area instead of shifting every other tile into the wrong slot. */
  const ordered = tiles
    .map((tile, index) => ({ tile, variant: String(index) }))
    .filter(({ tile }) => hasPlate(tile.image));

  if (!ordered.length) return null;

  return (
    <section className="pf-sec pf-sec-collage" aria-labelledby="pf-categories-title">
      <div className="pf-sec__container pf-sec-collage__grid">
        <div className="pf-sec-collage__head">
          <SectionLabel index={SECTION_COPY.categories.index}>
            {SECTION_COPY.categories.label}
          </SectionLabel>
          <h2 id="pf-categories-title" className="pf-sec__display pf-sec-collage__title">
            {SECTION_COPY.categories.title}{" "}
            <em className="pf-sec__display--italic">{SECTION_COPY.categories.titleAccent}</em>{" "}
            {SECTION_COPY.categories.titleTail}
          </h2>
          <p className="pf-sec-collage__intro">{SECTION_COPY.categories.intro}</p>
        </div>

        {ordered.map(({ tile, variant }, index) => (
          <FadeUp
            key={tile.key}
            delay={index * 0.06}
            className={`pf-sec-collage__tile pf-sec-collage__tile--${variant}`}
          >
            <Link to={tile.to} className="pf-sec-collage__link">
              <div className="pf-sec-collage__img">
                <SectionPlate image={tile.image} alt={tile.alt ?? tile.label} />
              </div>
              <div className="pf-sec-collage__cap">
                <span className="pf-sec-collage__num">{String(index + 1).padStart(2, "0")}</span>
                <span className="pf-sec-collage__name">{tile.label}</span>
                {tile.note ? <span className="pf-sec-collage__note">{tile.note}</span> : null}
                <span className="pf-sec-collage__cta">
                  <span>{tile.countLabel}</span>
                  <span aria-hidden="true">
                    <Arrow />
                  </span>
                </span>
              </div>
            </Link>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}
