import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Search, Store, User, X } from "lucide-react";
import { ADMIN_BRAND } from "../../config/adminNavigation";
import { getAdminRoleLabel } from "../../config/adminAccess";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { adminDisplayName, adminInitials } from "../../utils/admin";
import { cn } from "../../utils/cn";
import { Brand, transition } from "../../design-system";

/**
 * The Admin Portal header — deep burgundy surface with warm ivory text.
 *
 * Matches the approved reference:
 *   - Official PRATIKSHYA FASHION logo and wordmark (left)
 *   - Global search field (centre)
 *   - Store shortcut, notification control, user identity + account dropdown (right)
 *
 * Profile and Sign Out remain accessible here via the account dropdown,
 * while the sidebar no longer carries those items per the design lock.
 */
export default function AdminHeader({ navOpen, onToggleNav, menuButtonRef }) {
  const { admin, signOut, isSuperAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const displayName = adminDisplayName(admin);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const handleSignOut = () => {
    setMenuOpen(false);
    signOut();
    navigate("/login", { replace: true });
  };

  const workspacePrefix = isSuperAdmin ? "/super-admin" : "/admin";

  return (
    <header className="sticky top-0 z-40 border-b border-pf-gold/10 bg-pf-burgundy text-pf-ivory">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 md:px-6">
        {/* ---- Brand + nav toggle ---- */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            ref={menuButtonRef}
            type="button"
            className="border border-pf-ivory/20 p-2 text-pf-ivory/70 transition-colors hover:border-pf-gold/40 hover:text-pf-ivory lg:hidden"
            onClick={onToggleNav}
            aria-expanded={navOpen}
            aria-controls="admin-navigation"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
          >
            {navOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <Brand
            to={ADMIN_BRAND.home}
            size="default"
            variant="lockup"
            theme="dark"
            wordmark={ADMIN_BRAND.name}
            subtitle={isSuperAdmin ? undefined : `${ADMIN_BRAND.portal} · ${ADMIN_BRAND.subtitle}`}
            className="min-w-0"
          />
        </div>

        {/* ---- Global search ---- */}
        <div className="hidden min-w-0 flex-1 max-w-xl px-6 md:block">
          <div
            className={cn(
              "flex items-center gap-2 border bg-pf-wine/50 px-3 py-2 transition-colors duration-200",
              searchFocused
                ? "border-pf-gold/40 bg-pf-wine/70"
                : "border-pf-ivory/10 hover:border-pf-ivory/20"
            )}
          >
            <Search size={14} className="shrink-0 text-pf-ivory/40" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search products, orders, customers or employees…"
              className="min-w-0 flex-1 bg-transparent font-ui text-xs text-pf-ivory placeholder-pf-ivory/30 outline-none"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            <kbd className="hidden shrink-0 border border-pf-ivory/15 px-1.5 py-0.5 font-ui text-[9px] text-pf-ivory/40 sm:block">
              Ctrl K
            </kbd>
          </div>
        </div>

        {/* ---- Right actions ---- */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className={cn(
              "hidden items-center gap-2 border border-pf-ivory/15 px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-pf-ivory/70 transition-colors hover:border-pf-gold/40 hover:text-pf-ivory sm:inline-flex",
              transition.colors
            )}
          >
            <Store size={13} aria-hidden="true" />
            Store
          </Link>

          <button
            type="button"
            className="relative hidden items-center border border-pf-ivory/15 p-2 text-pf-ivory/60 transition-colors hover:border-pf-gold/40 hover:text-pf-ivory sm:inline-flex"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={14} aria-hidden="true" />
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-pf-gold text-[8px] font-bold text-pf-burgundy">
              3
            </span>
          </button>

          {/* ---- Account dropdown ---- */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 border border-transparent p-1 pr-2 transition-colors hover:border-pf-ivory/20"
            >
              {admin?.avatar ? (
                <img src={admin.avatar} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-pf-gold/30" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pf-gold/15 font-display text-sm font-light text-pf-gold ring-1 ring-pf-gold/25">
                  {adminInitials(admin)}
                </span>
              )}
              <span className="hidden text-left sm:block">
                <span className="block font-ui text-xs font-medium text-pf-ivory">{displayName}</span>
                <span className="block font-ui text-[10px] uppercase tracking-[.14em] text-pf-gold/60">
                  {admin?.title || getAdminRoleLabel(admin?.role)}
                </span>
              </span>
            </button>

            {menuOpen ? (
              <div
                role="menu"
                aria-label="Account menu"
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 border border-pf-border bg-pf-card text-pf-text shadow-xl"
              >
                <div className="border-b border-pf-border px-4 py-3">
                  <p className="font-display text-lg font-light text-pf-text">{displayName}</p>
                  <p className="font-ui text-[10px] uppercase tracking-[.16em] text-pf-muted">
                    {admin?.adminId} · {getAdminRoleLabel(admin?.role)}
                  </p>
                </div>
                <Link
                  to={`${workspacePrefix}/profile`}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-3 font-ui text-[11px] uppercase tracking-[.14em] text-pf-text transition-colors hover:bg-pf-burgundy/5"
                >
                  <User size={13} className="text-pf-gold-deep" aria-hidden="true" /> Profile
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left font-ui text-[11px] uppercase tracking-[.14em] text-pf-error transition-colors hover:bg-pf-error/5"
                >
                  <LogOut size={13} aria-hidden="true" /> Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
