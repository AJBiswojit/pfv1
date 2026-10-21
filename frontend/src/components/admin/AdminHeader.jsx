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
    <header className="sticky top-0 z-40 h-[var(--pf-header-h)] border-b border-pf-gold/30 bg-pf-burgundy text-pf-ivory shadow-[0_1px_0_rgb(214_174_112/0.22),0_10px_30px_rgb(42_6_16/0.28)]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/[0.05] to-transparent" />
      <div className="relative flex h-full items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 md:px-6">
        {/* ---- Brand + nav toggle ---- */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            ref={menuButtonRef}
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-pf-ivory/25 text-pf-ivory/85 transition-colors hover:border-pf-gold/60 hover:text-pf-ivory sm:h-10 sm:w-10 lg:hidden"
            onClick={onToggleNav}
            aria-expanded={navOpen}
            aria-controls="admin-navigation"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
          >
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Brand
            to={workspacePrefix}
            variant="lockup"
            theme="dark"
            size="compact"
            wordmark={ADMIN_BRAND.name}
            className="min-w-0"
          />
          <span className="ml-2 hidden border-l border-pf-ivory/15 pl-4 xl:block">
            <span className="block font-ui text-[10px] font-semibold uppercase tracking-[0.22em] text-pf-gold">
              {isSuperAdmin ? "Super Admin" : ADMIN_BRAND.portal}
            </span>
            <span className="mt-1 block font-ui text-[11.5px] leading-none text-pf-ivory/65">
              {ADMIN_BRAND.subtitle}
            </span>
          </span>
        </div>

        {/* ---- Right actions ---- */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className={cn(
              "hidden h-9 items-center gap-2 rounded-md border border-pf-ivory/20 px-3.5 font-ui text-[11px] font-semibold uppercase tracking-[.16em] text-pf-ivory/80 transition-colors hover:border-pf-gold/55 hover:bg-pf-ivory/[0.05] hover:text-pf-ivory sm:inline-flex",
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
              className="flex h-11 items-center gap-2 rounded-md border border-transparent pl-0.5 pr-1 transition-colors hover:border-pf-ivory/20 hover:bg-pf-ivory/[0.04] sm:gap-2.5 sm:pl-1 sm:pr-2"
            >
              {admin?.avatar ? (
                <img src={admin.avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-pf-gold/45" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-pf-gold/40 bg-pf-gold text-[13px] leading-none text-pf-wine [font-family:var(--font-ui)] sm:h-9 sm:w-9 sm:text-[15px]">
                  {adminInitials(admin)}
                </span>
              )}
              <span className="hidden text-left sm:block">
                <span className="block max-w-[180px] truncate font-ui text-[13px] font-semibold leading-tight text-pf-ivory">{displayName}</span>
                <span className="mt-1 block font-ui text-[9.5px] font-semibold uppercase tracking-[.18em] text-pf-gold/90">
                  {admin?.title || getAdminRoleLabel(admin?.role)}
                </span>
              </span>
              <ChevronDown
                size={14}
                className={cn("hidden text-pf-ivory/55 transition-transform duration-200 sm:block", menuOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                aria-label="Account menu"
                className="absolute right-0 top-[calc(100%+12px)] z-50 w-[290px] overflow-hidden rounded-xl border border-pf-border bg-pf-card text-pf-text shadow-[0_24px_60px_rgb(42_6_16/0.28)]"
              >
                <span aria-hidden="true" className="block h-[2px] w-full bg-gradient-to-r from-pf-gold via-pf-gold/60 to-transparent" />
                <div className="border-b border-pf-border px-5 py-4">
                  <p className="font-display text-[21px] leading-tight text-pf-text">{displayName}</p>
                  <p className="mt-1.5 block truncate font-ui text-[10px] font-semibold uppercase tracking-[.16em] text-pf-gold-text">
                    {getAdminRoleLabel(admin?.role)}
                  </p>
                  <p className="mt-1 truncate font-ui text-[11px] normal-case tracking-normal text-pf-muted">
                    {admin?.adminId}
                  </p>
                </div>
                <Link
                  to={`${workspacePrefix}/profile`}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center gap-3 px-5 py-3 font-ui text-[12px] font-semibold uppercase tracking-[.14em] text-pf-text transition-colors hover:bg-pf-card-soft"
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
