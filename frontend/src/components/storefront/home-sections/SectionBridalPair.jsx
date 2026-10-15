/**
 * PRATIKSHYA FASHION — homepage section 04 (Phase 2B).
 *
 * Project B's bridal campaign: a deep burgundy-to-night spread where the bride
 * is the dominant image-led panel, the groom is a lighter inset offset far
 * below it, and an arch-shaped "the wedding pair" inset bridges the two.
 *
 * DATA — the bride panel routes to the canonical `the-bride` category and the
 * groom inset to the canon `groom` category (both from the taxonomy), each
 * plate from the central media resolver. The "From ₹…" line appears only when
 * the live catalogue actually carries priced pieces in that bucket; with no
 * back catalogue the line is simply absent rather than invented.
 */

import { Link } from "react-router-dom";

import { ArrowLink, FadeUp, MaskReveal, SectionLabel } from "../../../design-system";
import { buildBridalSection } from "./sectionData";
import { SectionPlate, hasPlate } from "./sectionPlate";
import "./home-sections.css";

export default function SectionBridalPair({ data = null }) {
  const section = buildBridalSection(data);
  if (!section) return null;

  const { bride, groom, pair = null } = section;

  /* The two panels are image-led spreads whose copy is set INSIDE the plate, so
     a panel without a resolvable photograph would be an empty box with
     floating text. Such a panel is omitted instead; if neither panel can be
     shown, the section renders nothing. */
  const showBride = hasPlate(bride?.image);
  const showGroom = hasPlate(groom?.image);
  if (!showBride && !showGroom) return null;

  return (
    <section className="pf-sec pf-sec-bridal" aria-labelledby="pf-bridal-title">
      <div className="pf-sec__container pf-sec-bridal__head">
        <SectionLabel index={section.index} light>
          {section.label}
        </SectionLabel>
        <h2 id="pf-bridal-title" className="pf-sec__display pf-sec-bridal__title">
          {section.title} <em className="pf-sec__display--italic">{section.titleAccent}</em>
        </h2>
        <FadeUp delay={0.2} className="pf-sec-bridal__intro">
          <p className="pf-sec__lead" style={{ color: "inherit" }}>
            {section.intro}
          </p>
        </FadeUp>
      </div>

      <div className="pf-sec__container pf-sec-bridal__grid">
        {showBride ? (
        <article className="pf-sec-bridal__bride">
          <MaskReveal from="left" duration={1.3} className="pf-sec__plate pf-sec-bridal__bride-plate">
            <SectionPlate image={bride.image} alt="" sizes="(min-width: 900px) 58vw, 100vw" />
          </MaskReveal>
          <div className="pf-sec-bridal__bride-txt">
            <p className="pf-sec-bridal__kicker">{bride.kicker}</p>
            <h3 className="pf-sec-bridal__name">
              {bride.title} <em className="pf-sec__display--italic">{bride.accent}</em>
            </h3>
            <FadeUp delay={0.2}>
              <p className="pf-sec-bridal__copy">
                {bride.fromPrice ? (
                  <>
                    Pieces from <strong>{bride.fromPrice}</strong>.
                  </>
                ) : (
                  <>Composed in the house workshop.</>
                )}
              </p>
              <ArrowLink to={bride.to} light>
                Shop the bride
              </ArrowLink>
            </FadeUp>
          </div>
        </article>
        ) : null}

        {hasPlate(pair?.image) ? (
          <figure className="pf-sec-bridal__pair">
            <Link to={pair.to} aria-label="Shop the full Bridal Edit">
              <span className="pf-sec__plate" style={{ display: "block" }}>
                <SectionPlate image={pair.image} alt="" sizes="132px" />
              </span>
            </Link>
            <figcaption>{pair.caption}</figcaption>
          </figure>
        ) : null}

        {showGroom ? (
        <article className="pf-sec-bridal__groom">
          <div className="pf-sec-bridal__groom-txt">
            <p className="pf-sec-bridal__kicker">{groom.kicker}</p>
            <h3 className="pf-sec-bridal__name">
              {groom.title} <em className="pf-sec__display--italic">{groom.accent}</em>
            </h3>
            <FadeUp delay={0.15}>
              <p className="pf-sec-bridal__copy">
                {groom.fromPrice ? (
                  <>
                    Pieces from <strong>{groom.fromPrice}</strong>.
                  </>
                ) : (
                  <>Tailored to the ceremony.</>
                )}
              </p>
              <ArrowLink to={groom.to}>Shop the groom</ArrowLink>
            </FadeUp>
          </div>
          <MaskReveal from="right" duration={1.3} delay={0.2} className="pf-sec__plate pf-sec-bridal__groom-plate">
            <SectionPlate image={groom.image} alt="" sizes="(min-width: 900px) 34vw, 100vw" />
          </MaskReveal>
        </article>
        ) : null}
      </div>
    </section>
  );
}
