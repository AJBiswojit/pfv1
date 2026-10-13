/**
 * PRATIKSHYA FASHION — storefront mega menu (Phase 2A).
 *
 * Project B's panel, ported: a 1fr / 380px spread with up to three serif link
 * columns on the left and one image-led editorial feature on the right, the
 * columns fading in one after another, the whole panel dropping 8px into
 * place. The plate zooms and the panel letters the feature in italic on hover.
 *
 * DATA
 * The columns are the real information architecture — `primaryNavigation`
 * from `src/config/navigationConfig.js`, which is itself built from the
 * canonical taxonomy (`src/data/catalog/taxonomy.js`) and the taxonomy
 * repository's active collections. This component authors no category list,
 * no label and no destination.
 *
 * The feature's plate is resolved by the existing
 * `resolveNavigationEditorialImage(group)` chain (curated placement →
 * published product media → authored catalogue plate → collection cover →
 * null). A group with nothing eligible keeps its neutral frame rather than
 * borrowing another department's photograph.
 *
 * The caption line the previous shell printed under the feature title is
 * intentionally absent: B's panel carries kicker, title and action, and the
 * department description already heads its own listing page.
 */

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Arrow, MediaFrame } from "../../../design-system";
import { campaign as campaignMotion, duration } from "../../../design-system/motion";
import { resolveNavigationEditorialImage } from "../../../services/media/navigationEditorialMedia";
import { cn } from "../../../utils/cn";
import "./storefront-shell.css";

export default function StorefrontMegaMenu({ id, group, onNavigate, onMouseEnter, onMouseLeave, className = "", ...rest }) {
  const editorial = resolveNavigationEditorialImage(group);
  const feature = group.feature ?? {};
  const featureTo = feature.to ?? group.to;

  return (
    <motion.div
      id={id}
      data-mega={group.id}
      className={cn("pf-shell__mega", className)}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.18 } }}
      transition={{ duration: duration.page, ease: campaignMotion.ease.out }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...rest}
    >
      <div
        className={cn(
          "pf-shell__mega-inner",
          /* A group with no link columns yet (the collections group before the
             catalogue hydrates) shows its feature alone in the right-hand
             slot instead of an empty rail. Nothing is invented to fill it. */
          group.columns.length === 0 && "pf-shell__mega-inner--solo"
        )}
      >
        <div className="pf-shell__mega-cols">
          {group.columns.map((column, index) => (
            <motion.div
              key={column.title}
              className="pf-shell__mega-col"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + index * 0.05, duration: 0.3 }}
            >
              <p className="pf-shell__mega-title">{column.title}</p>
              <ul>
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} onClick={onNavigate}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <Link
          to={featureTo}
          data-mega-feature={group.id}
          onClick={onNavigate}
          className="pf-shell__mega-feature"
        >
          <MediaFrame
            image={editorial ?? feature.image}
            alt={editorial?.alt ?? feature.caption ?? feature.title ?? ""}
            aspect="product"
            className="pf-shell__mega-feature-img"
            imageProps={{
              /* The panel opens on hover — its plate is never the LCP. */
              loading: "lazy",
              decoding: "async",
              objectPosition: editorial?.objectPosition,
            }}
          />
          <span className="pf-shell__mega-feature-txt">
            <span className="pf-shell__mega-kicker">{feature.eyebrow}</span>
            <span className="pf-shell__mega-ftitle">{feature.title}</span>
            <span className="pf-shell__mega-fcta">
              View the edit
              <Arrow />
            </span>
          </span>
        </Link>
      </div>
    </motion.div>
  );
}
