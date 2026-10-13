/**
 * PRATIKSHYA FASHION — homepage section 08 (Phase 2B).
 *
 * Project B's kids playground: a tilted collage (one main plate, two paper
 * minis on it, a round sticker), and beside it a copy column with category
 * chips, two product cards and a button.
 *
 * The collage's plates are the canonical kids categories' own covers, the
 * chips are those categories with their live counts, and the "twirling"
 * sticker is the approved design's own mark. The rotation is the section's
 * character, so it is kept — and removed entirely under reduced motion.
 */

import { Link } from "react-router-dom";

import { AtelierButton, FadeUp, SectionLabel } from "../../../design-system";
import { buildKidsSection } from "./sectionData";
import { SectionPlate, hasPlate } from "./sectionPlate";
import SectionProducts from "./SectionProducts";
import "./home-sections.css";

export default function SectionKidsEdit({ data = null }) {
  const section = buildKidsSection(data);
  if (!section) return null;

  const minis = (section.minis ?? []).filter((mini) => mini && hasPlate(mini.image));
  const hasCollage = hasPlate(section.main) || minis.length > 0;

  return (
    <section className="pf-sec pf-sec-kids" aria-labelledby="pf-kids-title">
      <div
        className={
          hasCollage
            ? "pf-sec__container pf-sec-kids__grid"
            : "pf-sec__container pf-sec-kids__grid pf-sec-kids__grid--copy-only"
        }
      >
        {hasCollage ? (
        <div className="pf-sec-kids__collage">
          {hasPlate(section.main) ? (
            <FadeUp y={40} className="pf-sec__plate pf-sec-kids__main">
              <SectionPlate image={section.main} alt="" sizes="(min-width: 900px) 34vw, 78vw" />
            </FadeUp>
          ) : null}

          {minis.map((mini, index) =>
            mini ? (
              <FadeUp
                key={mini.key}
                delay={0.12 + index * 0.08}
                className={`pf-sec-kids__mini pf-sec-kids__mini--${index === 0 ? "a" : "b"}`}
              >
                <Link to={mini.to} aria-label={`Shop ${mini.label}`}>
                  <span className="pf-sec__plate" style={{ display: "block" }}>
                    <SectionPlate image={mini.image} alt="" sizes="34vw" />
                  </span>
                  <span>{mini.label}</span>
                </Link>
              </FadeUp>
            ) : null
          )}

          <span className="pf-sec-kids__sticker" aria-hidden="true">
            {section.sticker.split("\n").map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
          </span>
        </div>
        ) : null}

        <div className="pf-sec-kids__body">
          <SectionLabel index={section.index}>{section.label}</SectionLabel>
          <h2 id="pf-kids-title" className="pf-sec__display pf-sec-kids__title">
            {section.title} <em className="pf-sec__display--italic">{section.titleAccent}</em>
          </h2>
          <p className="pf-sec__lead pf-sec-kids__lead">{section.lead}</p>

          <div className="pf-sec-kids__chips">
            {section.chips.map((chip, index) => (
              <FadeUp key={chip.key} delay={0.1 + index * 0.06}>
                <Link to={chip.to} className="pf-sec-kids__chip">
                  <strong>{chip.label}</strong>
                  <span>{chip.note}</span>
                </Link>
              </FadeUp>
            ))}
          </div>

          {section.products.length ? (
            <div className="pf-sec-kids__products">
              <SectionProducts products={section.products} columns={2} />
            </div>
          ) : null}

          <AtelierButton as={Link} to={section.to}>
            Shop kids
          </AtelierButton>
        </div>
      </div>
    </section>
  );
}
