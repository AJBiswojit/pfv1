import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, Store, User, X } from "lucide-react";
import { ADMIN_BRAND } from "../../config/adminNavigation";
import { getAdminRoleLabel } from "../../config/adminAccess";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { adminDisplayName, adminInitials } from "../../utils/admin";
import { cn } from "../../utils/cn";
import { Brand, transition } from "../../design-system";

/**
 * The Admin Portal masthead — deep burgundy, canonical homepage logo.
 *
 * Every rendered control works: Store (storefront link) and the account
 * dropdown (Profile + Sign Out). There is deliberately NO global search
 * field (no staff search endpoint exists to wire it to) and NO
 * notification bell/count (no live notification count is available to
 * this header) — honest absence over decorative, inert controls.
 *
 * Height is governed by `--pf-header-h` (index.css), the same variable
 * the portal shell consumes — never hard-code it here.
 */
export default function AdminHeader({ navOpen, onToggleNav, menuButtonRef }) {
  const { admin, signOut, isSuperAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const displayName = adminDisplayName(admin);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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
    <header className="sticky top-0 z-40 h-[var(--pf-header-h)] border-b border-pf-gold/25 bg-gradient-to-r from-pf-wine via-pf-burgundy to-pf-burgundy text-pf-ivory shadow-[0_2px_24px_rgb(42_6_16/0.35)]">
      <div className="flex h-full items-center justify-between gap-4 px-4 md:px-6">
        {/* ---- Brand + nav toggle ---- */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            ref={menuButtonRef}
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-pf-ivory/25 text-pf-ivory/85 transition-colors hover:border-pf-gold/60 hover:text-pf-ivory lg:hidden"
            onClick={onToggleNav}
            aria-expanded={navOpen}
            aria-controls="admin-navigation"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
          >
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Brand
            to={workspacePrefix}
            size="default"
            variant="lockup"
            theme="dark"
            wordmark={ADMIN_BRAND.name}
            className="min-w-0"
          />
          <span className="ml-2 hidden border-l border-pf-ivory/20 pl-4 xl:block">
            <span className="block font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-pf-gold">
              {isSuperAdmin ? "Super Admin" : ADMIN_BRAND.portal}
            </span>
            <span className="mt-0.5 block font-ui text-[12px] text-pf-ivory/70">
              {ADMIN_BRAND.subtitle}
            </span>
          </span>
        </div>

        {/* ---- Right actions ---- */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className={cn(
              "hidden min-h-10 items-center gap-2 rounded-lg border border-pf-ivory/25 px-4 py-2 font-ui text-[12px] font-semibold uppercase tracking-[.14em] text-pf-ivory/85 transition-colors hover:border-pf-gold/60 hover:text-pf-ivory sm:inline-flex",
              transition.colors
            )}
          >
            <Store size={15} aria-hidden="true" />
            Store
          </Link>

          {/* ---- Account dropdown ---- */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex min-h-11 items-center gap-2.5 rounded-lg border border-transparent py-1 pl-1 pr-2 transition-colors hover:border-pf-ivory/25"
            >
              {admin?.avatar ? (
                <img src={admin.avatar} alt="" className="h-10 w-10 rounded-lg object-cover ring-1 ring-pf-gold/50" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-pf-gold font-display text-[18px] font-medium text-pf-wine">
                  {adminInitials(admin)}
                </span>
              )}
              <span className="hidden text-left sm:block">
                <span className="block font-ui text-[13.5px] font-semibold leading-tight text-pf-ivory">{displayName}</span>
                <span className="mt-0.5 block font-ui text-[11px] font-semibold uppercase tracking-[.16em] text-pf-gold">
                  {admin?.title || getAdminRoleLabel(admin?.role)}
                </span>
              </span>
              <ChevronDown size={15} className="hidden text-pf-ivory/60 sm:block" aria-hidden="true" />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                aria-label="Account menu"
                className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-xl border border-pf-border bg-pf-card text-pf-text shadow-[0_24px_60px_rgb(42_6_16/0.28)]"
              >
                <div className="border-b border-pf-border px-5 py-4">
                  <p className="font-display text-[22px] font-medium leading-tight text-pf-text">{displayName}</p>
                  <p className="mt-1 font-ui text-[11px] font-semibold uppercase tracking-[.16em] text-pf-gold-text">
                    {admin?.adminId} · {getAdminRoleLabel(admin?.role)}
                  </p>
                </div>
                <Link
                  to={`${workspacePrefix}/profile`}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center gap-3 px-5 py-3 font-ui text-[12px] font-semibold uppercase tracking-[.14em] text-pf-text transition-colors hover:bg-pf-ivory"
                >
                  <User size={16} className="text-pf-gold-text" aria-hidden="true" /> Profile
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex min-h-11 w-full items-center gap-3 px-5 py-3 text-left font-ui text-[12px] font-semibold uppercase tracking-[.14em] text-pf-error transition-colors hover:bg-pf-error/5"
                >
                  <LogOut size={16} aria-hidden="true" /> Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
