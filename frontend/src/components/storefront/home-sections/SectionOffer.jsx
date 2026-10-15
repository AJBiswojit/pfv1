/**
 * PRATIKSHYA FASHION — homepage section 06 (Phase 2B).
 *
 * Project B's promo spread: an espresso band that wipes in from the left edge
 * while a tall portrait breaks out above and below it, a ledger of the offer's
 * own figures, and an outlined discount numeral set into the frame.
 *
 * DATA — the storefront's live offer register (`offerRepository`, hydrated from
 * the public GET /offers). Every figure printed — the discount, the code, the
 * expiry, the scope line — is a field of that record; with no active offer the
 * section renders nothing at all, and there is no invented campaign.
 *
 * INTERACTION — one deliberate difference from B: B "applies" the code to its
 * mock bag, whereas this application validates a coupon at CHECKOUT through
 * the server gate (`apiValidateOfferCode`) and keeps no client-side coupon
 * state. Duplicating that here would be a second commerce path, so the control
 * copies the code instead — a real, supported action — and the terms line
 * states plainly that the code is applied at checkout.
 */

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Check, Tag } from "lucide-react";
import { Link } from "react-router-dom";

import { AtelierButton, InView } from "../../../design-system";
import { buildOfferSection } from "./sectionData";
import { SectionPlate, hasPlate } from "./sectionPlate";
import "./home-sections.css";

export default function SectionOffer({ data = null }) {
  const section = buildOfferSection(data);
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(async () => {
    if (!section?.code) return;
    try {
      await navigator.clipboard?.writeText(section.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      /* Clipboard blocked (insecure context, denied permission): the code is
         already printed in full beside the control, so nothing is lost. */
      setCopied(false);
    }
  }, [section?.code]);

  if (!section) return null;

  const hasMedia = hasPlate(section.image);

  const ledger = [
    { key: "Offer", value: section.discount },
    { key: "Code", value: section.code },
    ...(section.expires ? [{ key: "Valid until", value: section.expires }] : []),
  ];

  return (
    <section className="pf-sec pf-sec-offer" aria-labelledby="pf-offer-title">
      <InView.div
        className="pf-sec-offer__band"
        aria-hidden="true"
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        whileInView={{ clipPath: "inset(0 0% 0 0)" }}
        viewport={{ once: false, amount: 0.3 }}
        transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
      />

      <div
        className={
          hasMedia
            ? "pf-sec__container pf-sec-offer__wrap"
            : "pf-sec__container pf-sec-offer__wrap pf-sec-offer__wrap--copy-only"
        }
      >
        <div className="pf-sec-offer__content">
          <p className="pf-sec-offer__label">
            <span>{section.index}</span>
            {section.label}
            {section.isSample ? <em>Sample offer</em> : null}
          </p>

          <h2 id="pf-offer-title" className="pf-sec-offer__title">
            {section.headline}
          </h2>

          <div className="pf-sec-offer__body">
            {section.copy ? <p className="pf-sec-offer__copy">{section.copy}</p> : null}

            <dl className="pf-sec-offer__ledger">
              {ledger.map((row) => (
                <div key={row.key}>
                  <dt>{row.key}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>

            <div className="pf-sec-offer__ctas">
              <AtelierButton as={Link} to={section.cta.to} variant="inverse">
                {section.cta.label}
              </AtelierButton>
              <button
                type="button"
                className="pf-sec-offer__code"
                onClick={copyCode}
                aria-live="polite"
              >
                {copied ? <Check size={14} aria-hidden="true" /> : <Tag size={14} strokeWidth={1.4} aria-hidden="true" />}
                {copied ? (
                  <>
                    Code <strong>{section.code}</strong> copied
                  </>
                ) : (
                  <>
                    Copy code <strong>{section.code}</strong>
                  </>
                )}
              </button>
            </div>

            {section.terms ? <p className="pf-sec-offer__terms">{section.terms}</p> : null}
          </div>
        </div>

        {hasMedia ? (
        <figure className="pf-sec-offer__media">
          <motion.div
            className="pf-sec-offer__frame"
            initial={{ clipPath: "inset(100% 0 0 0)" }}
            whileInView={{ clipPath: "inset(0% 0 0 0)" }}
            viewport={{ once: false, amount: 0.25 }}
            transition={{ duration: 1.15, ease: [0.65, 0, 0.35, 1] }}
          >
            <SectionPlate image={section.image} alt={section.imageAlt} sizes="(min-width: 900px) 40vw, 100vw" />
          </motion.div>
          <span className="pf-sec-offer__num" aria-hidden="true">
            {section.discount.replace(/[^0-9]/g, "")}
            <small>{section.discount.includes("%") ? "%" : ""}</small>
          </span>
          <figcaption className="pf-sec-offer__cap">{section.caption}</figcaption>
        </figure>
        ) : null}
      </div>
    </section>
  );
}
