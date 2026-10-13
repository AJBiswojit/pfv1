/**
 * PRATIKSHYA FASHION — storefront mobile menu (Phase 2A).
 *
 * Project B's panel: a 420px drawer entering from the left, a plum scrim, the
 * compact lockup and a close control in the head, a search affordance, then
 * the primary groups as serif accordions that open over the group's editorial
 * plate and its sub-links, and a three-up utility foot.
 *
 * The interaction primitives are the design system's — `useLockBody`,
 * `useEscape`, `useFocusTrap` — so background scrolling stops while the panel
 * is open, ESCAPE dismisses it, TAB cycles inside it, and focus returns to
 * whatever opened it when it closes. Nothing is re-implemented here.
 *
 * FUNCTIONALITY CARRIED OVER FROM THE PREVIOUS DRAWER
 * The drawer it replaces also offered sign-out and the four account shortcuts.
 * Sign-out returns as a compact authenticated row, and the account shortcuts
 * are reached through the foot's Account column (which routes to `/account`,
 * the page that owns them) — so no destination or action is lost, and the
 * panel keeps B's restraint.
 *
 * DATA
 * `primaryNavigation` again — the taxonomy, not a hand-written list. The
 * group's plate comes from `resolveNavigationEditorialImage`, the same
 * resolver the desktop panel uses.
 */

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Heart, LogOut, Search, ShoppingBag, User, X } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Brand,
  MediaFrame,
  useEscape,
  useFocusTrap,
  useLockBody,
} from "../../../design-system";
import { campaign as campaignMotion, duration } from "../../../design-system/motion";
import {
  brand,
  legalNavigation,
  primaryNavigation,
} from "../../../config/navigationConfig";
import { useAuth } from "../../../context/AuthContext";
import { resolveNavigationEditorialImage } from "../../../services/media/navigationEditorialMedia";
import { cn } from "../../../utils/cn";
import "./storefront-shell.css";

/** B opens the first group on mount. */
const firstGroupId = () => primaryNavigation[0]?.id ?? null;

/** The ceremony department, treated with the italic accent (B's `mmenu__bridal`). */
const accentGroupId = primaryNavigation.find((group) => group.to === "/bridal")?.id ?? null;

export default function StorefrontMobileNav({ onClose, onSearch, counts = {}, className = "" }) {
  const [expanded, setExpanded] = useState(firstGroupId);
  const panelRef = useRef(null);
  const { user, isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();

  useLockBody(true);
  useEscape(true, onClose);
  useFocusTrap(panelRef, true);

  const toggle = (id) => setExpanded((current) => (current === id ? null : id));

  const handleSignOut = () => {
    signOut();
    onClose?.();
    navigate("/", { replace: true });
  };

  const openSearch = () => {
    onClose?.();
    onSearch?.();
  };

  const utilities = [
    {
      id: "account",
      label: isAuthenticated ? "Account" : "Sign In",
      to: isAuthenticated ? "/account" : "/signin",
      Icon: User,
      count: 0,
    },
    { id: "wishlist", label: "Wishlist", to: "/account/wishlist", Icon: Heart, count: counts.wishlist || 0 },
    { id: "cart", label: "Bag", to: "/cart", Icon: ShoppingBag, count: counts.cart || 0 },
  ];

  return (
    <div className={cn("pf-shell__mobile", className)}>
      <motion.div
        aria-hidden="true"
        className="pf-shell__scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: duration.page }}
        onClick={onClose}
      />

      <motion.aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        data-mobile-nav=""
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ duration: 0.45, ease: campaignMotion.ease.out }}
        className="pf-shell__mmenu"
      >
        <div className="pf-shell__mmenu-head">
          <Brand
            to={brand.home}
            onClick={onClose}
            size="compact"
            variant="lockup"
            theme="light"
            wordmark={brand.name}
          />
          <button
            type="button"
            className="pf-shell__icon"
            onClick={onClose}
            aria-label="Close menu"
            data-autofocus
          >
            <X size={20} strokeWidth={1.4} aria-hidden="true" />
          </button>
        </div>

        <button type="button" className="pf-shell__mmenu-search" onClick={openSearch}>
          <Search size={16} strokeWidth={1.5} aria-hidden="true" />
          Search sarees, jewellery, sherwanis…
        </button>

        {isAuthenticated && user ? (
          <div className="pf-shell__mmenu-auth">
            <span className="pf-shell__mmenu-auth-name">
              {user.firstName} {user.lastName || ""}
            </span>
            <button type="button" onClick={handleSignOut}>
              <LogOut size={12} aria-hidden="true" />
              Sign Out
            </button>
          </div>
        ) : null}

        <nav className="pf-shell__mmenu-nav" aria-label="Categories">
          {primaryNavigation.map((group) => {
            const isOpen = expanded === group.id;
            const editorial = isOpen ? resolveNavigationEditorialImage(group) : null;
            const feature = group.feature ?? {};

            return (
              <div key={group.id} className="pf-shell__mmenu-group" data-mobile-group={group.id}>
                <button
                  type="button"
                  className={cn(
                    "pf-shell__mmenu-toggle",
                    group.id === accentGroupId && "pf-shell__mmenu-toggle--accent"
                  )}
                  aria-expanded={isOpen}
                  aria-controls={`${group.id}-mobile-panel`}
                  onClick={() => toggle(group.id)}
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    size={18}
                    strokeWidth={1.3}
                    aria-hidden="true"
                    style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .3s" }}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`${group.id}-mobile-panel`}
                      className="pf-shell__mmenu-panel"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: campaignMotion.ease.out }}
                    >
                      <Link
                        to={group.to}
                        className="pf-shell__mmenu-feature"
                        onClick={onClose}
                      >
                        {/* The plate is decorative here — the group's own name
                            sits beside it — and the shared frame keeps the
                            neutral empty plate when nothing is eligible. */}
                        <MediaFrame
                          image={editorial}
                          alt=""
                          aspect="product"
                          className="pf-shell__mmenu-feature-img"
                          imageProps={{ loading: "lazy", decoding: "async", objectPosition: editorial?.objectPosition }}
                        />
                        <span className="pf-shell__mmenu-feature-txt">
                          <em>{feature.eyebrow ?? group.eyebrow}</em>
                          {feature.title ?? group.label}
                        </span>
                      </Link>

                      {group.columns.map((column) => (
                        <div key={column.title} className="pf-shell__mmenu-col">
                          <p>{column.title}</p>
                          {column.links.map((link) => (
                            <Link key={link.to} to={link.to} onClick={onClose}>
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <ul className="pf-shell__mmenu-legal">
          {legalNavigation.map((item) => (
            <li key={item.to}>
              <Link to={item.to} onClick={onClose}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="pf-shell__mmenu-foot">
          {utilities.map(({ id, label, to, Icon, count }) => (
            <Link
              key={id}
              to={to}
              onClick={onClose}
              aria-label={count ? `${label}, ${count} ${count === 1 ? "item" : "items"}` : label}
            >
              <Icon size={16} strokeWidth={1.4} aria-hidden="true" />
              {label}
              {count > 0 ? <span className="pf-shell__mmenu-count">{count}</span> : null}
            </Link>
          ))}
        </div>
      </motion.aside>
    </div>
  );
}
