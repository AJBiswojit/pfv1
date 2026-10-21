import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, Store, User, X } from "lucide-react";
import { EMPLOYEE_BRAND } from "../../config/employeeNavigation";
import { getDepartmentLabel } from "../../config/employeeDepartments";
import { getRole } from "../../config/employeeRoles";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import {
  employeeFullName,
  employeeInitials,
  formatTodayLong,
} from "../../utils/employee";
import { cn } from "../../utils/cn";
import { Brand, transition } from "../../design-system";

/**
 * The Employee Portal masthead — deep burgundy, canonical homepage logo.
 *
 * Same honesty rules as the Admin masthead: every rendered control
 * works. No inert search field and no fabricated notification count.
 * Profile + Sign Out live in the account dropdown (never the sidebar).
 * Height follows `--pf-header-h` (index.css).
 */
export default function EmployeeHeader({ navOpen, onToggleNav, menuButtonRef }) {
  const { employee, signOut } = useEmployeeAuth();
  const navigate = useNavigate();
  const role = getRole(employee?.role);
  const name = employeeFullName(employee);
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

  // Signing out always returns to the ONE canonical staff sign-in page —
  // never to a retired per-portal login URL.
  const handleSignOut = () => {
    setMenuOpen(false);
    signOut();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 h-[var(--pf-header-h)] border-b border-pf-gold/25 bg-gradient-to-r from-pf-wine via-pf-burgundy to-pf-burgundy text-pf-ivory shadow-[0_2px_24px_rgb(42_6_16/0.35)]">
      <div className="flex h-full items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 md:px-6">
        {/* ---- Brand + nav toggle ---- */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            ref={menuButtonRef}
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-pf-ivory/25 text-pf-ivory/85 transition-colors hover:border-pf-gold/60 hover:text-pf-ivory sm:h-10 sm:w-10 lg:hidden"
            onClick={onToggleNav}
            aria-expanded={navOpen}
            aria-controls="employee-navigation"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
          >
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Brand
            to={EMPLOYEE_BRAND.home}
            variant="lockup"
            theme="dark"
            size="compact"
            wordmark={EMPLOYEE_BRAND.name}
            className="min-w-0"
          />
          <span className="ml-2 hidden border-l border-pf-ivory/20 pl-4 xl:block">
            <span className="block font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-pf-gold">
              {EMPLOYEE_BRAND.portal}
            </span>
            <span className="mt-0.5 block font-ui text-[12px] text-pf-ivory/70">
              {EMPLOYEE_BRAND.subtitle}
            </span>
          </span>
        </div>

        {/* The page heading owns the greeting; the masthead carries the
            portal identity so the same sentence is not printed twice. */}
        <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 px-6 lg:flex">
          <span className="font-ui text-[10.5px] font-semibold uppercase tracking-[.16em] text-pf-gold/90">
            {formatTodayLong()}
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-pf-ivory/20" />
          <span className="max-w-[240px] truncate font-ui text-[11.5px] text-pf-ivory/65">
            {employee?.designation || role.label} · {getDepartmentLabel(employee?.department)}
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
              {employee?.avatar ? (
                <img src={employee.avatar} alt="" className="h-9 w-9 rounded-md object-cover ring-1 ring-pf-gold/50" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-pf-gold font-display text-[16px] font-semibold tabular-nums text-pf-wine">
                  {employeeInitials(employee)}
                </span>
              )}
              <span className="hidden text-left sm:block">
                <span className="block font-ui text-[13.5px] font-semibold leading-tight text-pf-ivory">{name}</span>
                <span className="mt-0.5 block font-ui text-[11px] font-semibold uppercase tracking-[.16em] text-pf-gold">
                  {employee?.employeeId}
                </span>
              </span>
              <ChevronDown size={15} className="hidden text-pf-ivory/60 sm:block" aria-hidden="true" />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                aria-label="Employee account menu"
                className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-xl border border-pf-border bg-pf-card text-pf-text shadow-[0_24px_60px_rgb(42_6_16/0.28)]"
              >
                <div className="border-b border-pf-border px-5 py-4">
                  <p className="font-display text-[22px] font-medium leading-tight text-pf-text">{name}</p>
                  <p className="mt-1 font-ui text-[11px] font-semibold uppercase tracking-[.16em] text-pf-gold-text">
                    {employee?.employeeId}
                  </p>
                </div>
                <Link
                  to="/employee/profile"
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
