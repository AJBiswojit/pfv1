/**
 * PRATIKSHYA FASHION — homepage section 03 (Phase 2B).
 *
 * Project B's Saree Lookbook: one large plate with a vertical serif word
 * beside it, a strip of three captioned frames, an ordered list of the edits
 * and a product rail beneath ("Complete the drape").
 *
 * DATA — the sarees category of the canonical taxonomy. Its subcategories are
 * the edits (Banarasi / Cotton / Silk today, whatever the taxonomy desk makes
 * them tomorrow), each routed by its own path and counted from the live
 * catalogue. The plates resolve through the central media resolver; the rail
 * is the live saree products.
 */

import { Link } from "react-router-dom";

import { Arrow, ArrowLink, FadeUp, SectionLabel } from "../../../design-system";
import { buildSareeSection } from "./sectionData";
import { SectionPlate, hasPlate } from "./sectionPlate";
import SectionProducts from "./SectionProducts";
import "./home-sections.css";

export default function SectionSareeEdits({ data = null }) {
  const section = buildSareeSection(data);
  if (!section) return null;

  const hasRail = section.products?.length > 0;
  const frames = (section.strip ?? []).filter((frame) => hasPlate(frame.image));

  return (
    <section className="pf-sec pf-sec-saree" aria-labelledby="pf-saree-title">
      <div className="pf-sec__container pf-sec-saree__grid">
        <div className="pf-sec-saree__visual">
          {hasPlate(section.visual) ? (
            <div className="pf-sec__plate pf-sec-saree__main">
              <SectionPlate image={section.visual} alt="" sizes="(min-width: 900px) 45vw, 88vw" />
            </div>
          ) : null}
          <span className="pf-sec-saree__word" aria-hidden="true">
            {section.word}
          </span>
          {frames.length ? (
            <div className="pf-sec-saree__strip">
              {frames.map((frame) => (
                <figure className="pf-sec-saree__frame" key={frame.key}>
                  <div className="pf-sec__plate">
                    <SectionPlate image={frame.image} alt="" sizes="160px" />
                  </div>
                  <figcaption>{frame.caption}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pf-sec-saree__copy">
          <SectionLabel index={section.index}>{section.label}</SectionLabel>
          <h2 id="pf-saree-title" className="pf-sec__display pf-sec-saree__title">
            {section.title} <em className="pf-sec__display--italic">{section.titleAccent}</em>
          </h2>
          <FadeUp delay={0.15}>
            <p className="pf-sec__lead pf-sec-saree__lead">{section.lead}</p>
          </FadeUp>

          {section.edits.length ? (
            <ol className="pf-sec-saree__list">
              {section.edits.map((edit, index) => (
                <li key={edit.key}>
                  <Link to={edit.to} className="pf-sec-saree__row">
                    <span className="pf-sec-saree__idx">{String(index + 1).padStart(2, "0")}</span>
                    <span className="pf-sec-saree__name">{edit.label}</span>
                    {edit.note ? <span className="pf-sec-saree__note">{edit.note}</span> : null}
                    <span className="pf-sec-saree__count">{edit.countLabel}</span>
                    <span className="pf-sec-saree__arrow" aria-hidden="true">
                      <Arrow />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>

      {hasRail ? (
        <div className="pf-sec__container pf-sec-saree__products">
          <div className="pf-sec__rail-head">
            <h3>{section.railTitle}</h3>
            <p>{section.railNote}</p>
            <ArrowLink to={section.to}>All sarees</ArrowLink>
          </div>
          <SectionProducts products={section.products} />
        </div>
      ) : null}
    </section>
  );
}
