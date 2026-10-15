/**
 * PRATIKSHYA FASHION — homepage section 10 (Phase 2B).
 *
 * Project B's Kurti Lookbook, mapped onto the collection data this application
 * actually owns: a framed portrait on the left with a mood line beneath it, and
 * on the right a serif selector whose entries are the house's FABRIC and
 * editorial collections (the taxonomy desk's own records), each with its cover,
 * its description and its live member count. Selecting a mood swaps the framed
 * plate and shows the pieces filed under that collection.
 *
 * Nothing is authored here: labels, descriptions, covers, counts, routes and
 * products all come from the collection records and the live catalogue. With no
 * active collections the section renders nothing.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";

import { ArrowLink, FadeUp, MaskReveal, SectionLabel } from "../../../design-system";
import { buildLookbookSection } from "./sectionData";
import { SectionPlate, hasPlate } from "./sectionPlate";
import SectionProducts from "./SectionProducts";
import "./home-sections.css";

export default function SectionLookbook({ data = null }) {
  const section = buildLookbookSection(data);
  const moods = section?.moods ?? [];
  /* The plate is what gives the framed column its height — the frame is drawn
     out of flow around it. So the column exists only while some mood can fill
     it, and the section opens on a mood that can: an outline around nothing is
     the blank framed block this section used to leave behind whenever the
     taxonomy desk had filed the collections but not their covers. */
  const showVisual = moods.some((mood) => hasPlate(mood.image));
  const [activeKey, setActiveKey] = useState(
    moods.find((mood) => hasPlate(mood.image))?.key ?? moods[0]?.key ?? null
  );
  const reduceMotion = useReducedMotion();
  const Underline = reduceMotion ? "span" : motion.span;

  /* A cross-fade is a design nicety, never a requirement: with reduced motion
     the plate simply changes. */
  const Plate = reduceMotion ? "div" : motion.div;
  const Mood = reduceMotion ? "p" : motion.p;

  const active = useMemo(
    () => moods.find((mood) => mood.key === activeKey) ?? moods[0] ?? null,
    [moods, activeKey]
  );

  if (!section || !active) return null;
  const activeHasPlate = hasPlate(active.image);

  return (
    <section className="pf-sec pf-sec-look" aria-labelledby="pf-lookbook-title">
      <div
        className={`pf-sec__container pf-sec-look__grid${
          showVisual ? "" : " pf-sec-look__grid--body-only"
        }`}
      >
        {showVisual ? (
        <div className="pf-sec-look__visual">
          <div className="pf-sec-look__imgwrap">
            {activeHasPlate ? (
            <>
            <span className="pf-sec-look__frame" aria-hidden="true" />
            <MaskReveal from="down" duration={1.1} className="pf-sec-look__img">
              <Link
                to={active.to}
                aria-label={`Explore ${active.label}`}
                style={{ position: "absolute", inset: 0, zIndex: 2 }}
              />
              <AnimatePresence initial={false}>
                <Plate
                  key={active.key}
                  className="pf-sec__plate"
                  style={{ position: "absolute", inset: 0 }}
                  {...(reduceMotion
                    ? null
                    : {
                        initial: { opacity: 0, scale: 1.05 },
                        animate: { opacity: 1, scale: 1 },
                        exit: { opacity: 0 },
                        transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
                      })}
                >
                  <SectionPlate image={active.image} alt="" sizes="(min-width: 900px) 36vw, 80vw" />
                </Plate>
              </AnimatePresence>
            </MaskReveal>
            </>
            ) : null}
          </div>

          {active.note ? (
            <AnimatePresence mode="wait" initial={false}>
              <Mood
                key={active.key}
                className="pf-sec-look__mood"
                {...(reduceMotion
                  ? null
                  : {
                      initial: { opacity: 0, y: 8 },
                      animate: { opacity: 1, y: 0 },
                      exit: { opacity: 0, y: -6 },
                      transition: { duration: 0.3 },
                    })}
              >
                {active.note}
              </Mood>
            </AnimatePresence>
          ) : null}
        </div>
        ) : null}

        <div className="pf-sec-look__body">
          <SectionLabel index={section.index}>{section.label}</SectionLabel>
          <h2 id="pf-lookbook-title" className="pf-sec__display pf-sec-look__title">
            {section.title} <em className="pf-sec__display--italic">{section.titleAccent}</em>
          </h2>

          <div className="pf-sec-look__selector" role="group" aria-label="Choose a collection">
            {moods.map((mood) => (
              <button
                key={mood.key}
                type="button"
                aria-pressed={mood.key === active.key}
                className="pf-sec-look__mood-tab"
                onClick={() => setActiveKey(mood.key)}
              >
                {mood.label}
                <sup>{mood.count}</sup>
                {mood.key === active.key ? (
                  <Underline
                    className="pf-sec-look__mood-line"
                    {...(reduceMotion ? null : { layoutId: "pf-look-line" })}
                  />
                ) : null}
              </button>
            ))}
          </div>

          {active.products.length ? (
            <FadeUp delay={0.1} className="pf-sec-look__list">
              <SectionProducts products={active.products} columns={3} />
            </FadeUp>
          ) : (
            <p className="pf-sec__note" style={{ marginTop: 18 }}>
              No pieces are filed under this collection yet.
            </p>
          )}

          <div style={{ marginTop: 22 }}>
            <ArrowLink to={active.to}>Explore the collection</ArrowLink>
          </div>
        </div>
      </div>
    </section>
  );
}
