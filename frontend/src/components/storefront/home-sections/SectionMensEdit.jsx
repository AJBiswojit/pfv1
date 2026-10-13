/**
 * PRATIKSHYA FASHION — homepage section 07 (Phase 2B).
 *
 * Project B's menswear editorial: a copy column beside a wide 16:7 plate, a row
 * of category chips, a product strip and a "shop all" foot. Where B pinned a
 * floating price tag to one hard-coded product, this port derives the tag from
 * the catalogue: when the live catalogue carries a menswear piece it tags that
 * piece (linking to its real product route); with no catalogue it draws no tag
 * rather than inventing one.
 */

import { Link } from "react-router-dom";

import { ArrowLink, FadeUp, SectionLabel } from "../../../design-system";
import { formatPrice } from "../../../design-system/components/ProductCard";
import { buildMensSection } from "./sectionData";
import { SectionPlate, hasPlate } from "./sectionPlate";
import SectionProducts from "./SectionProducts";
import "./home-sections.css";

export default function SectionMensEdit({ data = null }) {
  const section = buildMensSection(data);
  if (!section) return null;

  const hasImage = hasPlate(section.image);

  return (
    <section className="pf-sec pf-sec-men" aria-labelledby="pf-men-title">
      <div
        className={
          hasImage ? "pf-sec__container pf-sec-men__top" : "pf-sec__container pf-sec-men__top pf-sec-men__top--copy-only"
        }
      >
        <FadeUp className="pf-sec-men__head">
          <SectionLabel index={section.index}>{section.label}</SectionLabel>
          <h2 id="pf-men-title" className="pf-sec__display pf-sec-men__title">
            {section.title} <em className="pf-sec__display--italic">{section.titleAccent}</em>
          </h2>
          <p className="pf-sec__lead pf-sec-men__lead">{section.lead}</p>
          {section.types.length ? (
            <ul className="pf-sec-men__types">
              {section.types.map((type) => (
                <li key={type.id}>
                  <Link to={type.path}>{type.name}</Link>
                </li>
              ))}
            </ul>
          ) : null}
        </FadeUp>

        {hasImage ? (
        <div className="pf-sec-men__img">
          <div className="pf-sec__plate" style={{ height: "100%" }}>
            <SectionPlate image={section.image} alt="" sizes="(min-width: 900px) 62vw, 100vw" />
          </div>
          {section.hero ? (
            <Link to={section.hero.to} className="pf-sec-men__tag">
              <span className="pf-sec-men__tag-dot" aria-hidden="true" />
              <span>
                {section.hero.name}
                <small>{formatPrice(section.hero.price)}</small>
              </span>
            </Link>
          ) : null}
        </div>
        ) : null}
      </div>

      {section.products.length ? (
        <div className="pf-sec__container">
          <SectionProducts products={section.products} />
          <div className="pf-sec__foot">
            <ArrowLink to={section.to}>Shop all men</ArrowLink>
          </div>
        </div>
      ) : null}
    </section>
  );
}
