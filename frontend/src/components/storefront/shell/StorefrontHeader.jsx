/**
 * PRATIKSHYA FASHION — storefront header (Phase 2A).
 *
 * Project B's header, ported: sticky, blush, blurred, a hairline that only
 * appears once the page has scrolled, the brand lockup held in the centre
 * column, the primary rail on the left and the utility cluster on the right.
 *
 * WHAT IS PROJECT B'S
 *   · geometry and palette (see `storefront-shell.css`);
 *   · the scrolled state (`useScrolled`) and the `has-mega` state;
 *   · the hover-intent model: a group opens on hover/focus and closes 160 ms
 *     after the pointer leaves, and the panel's own hover cancels that;
 *   · the italic serif accent on the ceremony group (B's `nav__link--accent`);
 *   · the pill bag button with its animated count;
 *   · the panel slide-in from the left.
 *
 * WHAT IS THE APPLICATION'S, KEPT INTACT
 *   · `primaryNavigation` — the canonical taxonomy and collections, never a
 *     hand-written category list;
 *   · `<Brand variant="lockup" wordmark={brand.name}>` — the single brand seam
 *     every portal shares (the mark asset is the real
 *     `/design/pratikshya-logo.webp`, resolved by `Brand` itself);
 *   · the existing `SearchPanel`, `AccountDropdown`, `CartDrawer` trigger and
 *     wishlist destination — the new header *drives* them, it does not
 *     re-implement them;
 *   · `/explore`, which the previous header offered as a standalone link;
 *   · the accessible names (`Bag, 2 items`, `Wishlist, 3 items`, `Account`);
 *   · `useEscape` for dismissal and the design system's motion tokens.
 */

import { AnimatePresence, motion } from "framer-motion";
import { Menu, Search } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Brand, useEscape, useScrolled } from "../../../design-system";
import { brand, primaryNavigation } from "../../../config/navigationConfig";
import { useAuth } from "../../../context/AuthContext";
import { cn } from "../../../utils/cn";
import AccountDropdown from "../../shell/AccountDropdown";
import SearchPanel from "../../shell/SearchPanel";
import { utilityIcons } from "../../shell/utilityIcons";
import StorefrontMegaMenu from "./StorefrontMegaMenu";
import StorefrontMobileNav from "./StorefrontMobileNav";
import "./storefront-shell.css";

/** B closes a group this long after the pointer leaves it. */
const CLOSE_DELAY_MS = 160;
/** B's scrolled threshold. */
const SCROLLED_AT = 24;
/** The ceremony department, italicised (B's accent link). */
const ACCENT_GROUP_ROUTE = "/bridal";

export default function StorefrontHeader({ counts = {}, onOpenCart, className = "" }) {
  const scrolled = useScrolled(SCROLLED_AT);
  const { pathname } = useLocation();
  const { user, isAuthenticated } = useAuth();

  const [openGroup, setOpenGroup] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeTimer = useRef(null);
  const menuId = useId();

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  /* Navigating always dismisses every surface. */
  useEffect(() => {
    clearCloseTimer();
    setOpenGroup(null);
    setSearchOpen(false);
    setAccountOpen(false);
    setDrawerOpen(false);
  }, [pathname, clearCloseTimer]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const closeAll = useCallback(() => {
    clearCloseTimer();
    setOpenGroup(null);
    setSearchOpen(false);
    setAccountOpen(false);
    setDrawerOpen(false);
  }, [clearCloseTimer]);

  /* ESCAPE dismisses whatever is open (the mobile panel owns its own too). */
  useEscape(
    Boolean(openGroup || searchOpen || accountOpen || drawerOpen),
    closeAll
  );

  const openMenu = (id) => {
    clearCloseTimer();
    setSearchOpen(false);
    setAccountOpen(false);
    setOpenGroup(id);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpenGroup(null), CLOSE_DELAY_MS);
  };

  const toggleSearch = () => {
    clearCloseTimer();
    setOpenGroup(null);
    setAccountOpen(false);
    setSearchOpen((open) => !open);
  };

  const activeGroup = primaryNavigation.find((group) => group.id === openGroup) ?? null;

  return (
    <>
    <header
      data-storefront-header=""
      className={cn(
        "pf-shell__header",
        scrolled && "is-scrolled",
        activeGroup && "has-mega",
        className
      )}
      onBlur={(event) => {
        /* Keyboard focus leaving the header dismisses the panel (B). */
        if (!event.currentTarget.contains(event.relatedTarget)) {
          clearCloseTimer();
          setOpenGroup(null);
        }
      }}
    >
      <div className="pf-shell__inner">
        <div className="pf-shell__left">
          <button
            type="button"
            className="pf-shell__icon pf-shell__burger"
            onClick={() => {
              closeAll();
              setDrawerOpen(true);
            }}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <Menu size={20} strokeWidth={1.4} aria-hidden="true" />
          </button>

          <nav className="pf-shell__nav" aria-label="Primary">
            {primaryNavigation.map((group) => {
              const isActive = pathname === group.to || pathname.startsWith(`${group.to}/`);
              const isOpen = openGroup === group.id;
              const isAccent = group.to === ACCENT_GROUP_ROUTE;

              return (
                <div
                  key={group.id}
                  className="pf-shell__nav-item"
                  data-nav-group={group.id}
                  onMouseEnter={() => openMenu(group.id)}
                  onMouseLeave={scheduleClose}
                >
                  <Link
                    to={group.to}
                    onClick={closeAll}
                    onFocus={() => openMenu(group.id)}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? `${menuId}-${group.id}` : undefined}
                    className={cn(
                      "pf-shell__nav-link",
                      isAccent && "pf-shell__nav-link--accent",
                      (isActive || isOpen) && "is-active"
                    )}
                  >
                    {group.label}
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>

        <Brand
          to={brand.home}
          size="default"
          variant="lockup"
          theme="light"
          wordmark={brand.name}
          className="pf-shell__brand"
        />

        <div className="pf-shell__right">
          <Link
            to="/explore"
            onClick={closeAll}
            className={cn("pf-shell__explore", pathname === "/explore" && "is-active")}
          >
            Explore
          </Link>

          <button
            type="button"
            className="pf-shell__icon pf-shell__hide-sm"
            onClick={toggleSearch}
            aria-label="Search"
            aria-expanded={searchOpen}
          >
            <Search size={18} strokeWidth={1.4} aria-hidden="true" />
          </button>

          {/* Account — the trigger is the existing link, the panel is the
              existing dropdown. */}
          <div
            className="pf-shell__account"
            onMouseEnter={() => {
              clearCloseTimer();
              setOpenGroup(null);
              setAccountOpen(true);
            }}
            onMouseLeave={() => setAccountOpen(false)}
          >
            <Link
              to={isAuthenticated && user ? "/account" : "/signin"}
              aria-label={isAuthenticated && user ? `Account (${user.firstName})` : "Account"}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              className="pf-shell__icon"
            >
              <utilityIcons.account size={18} strokeWidth={1.4} aria-hidden="true" />
            </Link>
            <AnimatePresence>
              {accountOpen && (
                <AccountDropdown
                  isOpen={accountOpen}
                  onMouseEnter={() => setAccountOpen(true)}
                  onMouseLeave={() => setAccountOpen(false)}
                  onClose={() => setAccountOpen(false)}
                  wishlistCount={counts.wishlist || 0}
                />
              )}
            </AnimatePresence>
          </div>

          <Link
            to="/account/wishlist"
            onClick={closeAll}
            aria-label={
              counts.wishlist > 0 ? `Wishlist, ${counts.wishlist} items` : "Wishlist"
            }
            className="pf-shell__icon pf-shell__hide-sm"
          >
            <utilityIcons.wishlist size={18} strokeWidth={1.4} aria-hidden="true" />
            {counts.wishlist > 0 ? <span className="pf-shell__dot">{counts.wishlist}</span> : null}
          </Link>

          <button
            type="button"
            className="pf-shell__icon pf-shell__bag"
            onClick={() => {
              closeAll();
              onOpenCart?.();
            }}
            aria-label={counts.cart > 0 ? `Bag, ${counts.cart} items` : "Bag"}
            aria-haspopup="dialog"
          >
            <utilityIcons.cart size={18} strokeWidth={1.4} aria-hidden="true" />
            <span className="pf-shell__bag-label">Bag</span>
            <AnimatePresence mode="popLayout" initial={false}>
              {counts.cart > 0 ? (
                <motion.span
                  key={counts.cart}
                  className="pf-shell__bag-count"
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 10, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {counts.cart}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* The panel drops from the header rail — never clipped, because the
          header itself is the only positioned ancestor and it does not clip
          (see the layout note in `storefront-shell.css`). */}
      <AnimatePresence>
        {activeGroup && (
          <StorefrontMegaMenu
            id={`${menuId}-${activeGroup.id}`}
            group={activeGroup}
            onNavigate={closeAll}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
      </AnimatePresence>

    </header>

    {/* Only the search panel dims the page: B's mega menu has no scrim — the
        header simply becomes opaque while a group is open, and the panel is
        dismissed by the pointer leaving it, by ESCAPE, or by navigating. The
        dim sits behind the header (`z-index: 50`, under the header's 60) so it
        can never cover the rail — and like the mobile drawer it is the header's
        sibling, because a fixed box inside a `backdrop-filter` ancestor is
        clipped to that ancestor's height. */}
    <AnimatePresence>
      {searchOpen && (
        <motion.div
          aria-hidden="true"
          className="pf-shell__header-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          onClick={closeAll}
        />
      )}
    </AnimatePresence>

    {/* The mobile panel is an overlay, so it must NOT be a child of the header:
        the header's `backdrop-filter` makes it the containing block for fixed
        descendants, which sized this drawer (and its scrim) to the header's own
        56–64px instead of the viewport — the menu opened, took focus and
        rendered, but could not be seen. As a sibling it resolves against the
        viewport, as in B's own layout, where the drawer is outside the header. */}
    <AnimatePresence>
      {drawerOpen && (
        <StorefrontMobileNav
          onClose={() => setDrawerOpen(false)}
          onSearch={() => setSearchOpen(true)}
          counts={counts}
        />
      )}
    </AnimatePresence>
    </>
  );
}
