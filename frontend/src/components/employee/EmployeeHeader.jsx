import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Search, Store, User, X } from "lucide-react";
import { EMPLOYEE_BRAND } from "../../config/employeeNavigation";
import { getDepartmentLabel } from "../../config/employeeDepartments";
import { getRole } from "../../config/employeeRoles";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import {
  employeeFullName,
  employeeInitials,
  formatTodayLong,
  greetingForNow,
} from "../../utils/employee";
import { cn } from "../../utils/cn";
import { Brand, transition } from "../../design-system";

/**
 * The Employee Portal header — deep burgundy surface with warm ivory text.
 *
 * Matches the approved reference with brand, search, store shortcut,
 * notification control, and an account dropdown for Profile and Sign Out.
 */
export default function EmployeeHeader({ navOpen, onToggleNav, menuButtonRef }) {
  const { employee, signOut } = useEmployeeAuth();
  const navigate = useNavigate();
  const role = getRole(employee?.role);
  const name = employeeFullName(employee);
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

  // Signing out always returns to the ONE canonical staff sign-in page —
  // never to a retired per-portal login URL.
  const handleSignOut = () => {
    setMenuOpen(false);
    signOut();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-pf-gold/10 bg-pf-burgundy text-pf-ivory">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 md:px-6">
        {/* ---- Brand + nav toggle ---- */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            ref={menuButtonRef}
            type="button"
            className="border border-pf-ivory/20 p-2 text-pf-ivory/70 transition-colors hover:border-pf-gold/40 hover:text-pf-ivory lg:hidden"
            onClick={onToggleNav}
            aria-expanded={navOpen}
            aria-controls="employee-navigation"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
          >
            {navOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <Brand
            to={EMPLOYEE_BRAND.home}
            size="default"
            variant="lockup"
            theme="dark"
            wordmark={EMPLOYEE_BRAND.name}
            subtitle={`${EMPLOYEE_BRAND.portal} · ${EMPLOYEE_BRAND.subtitle}`}
            className="min-w-0"
          />
        </div>

        {/* ---- Search ---- */}
        <div className="hidden min-w-0 flex-1 max-w-lg px-4 md:block">
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
              placeholder="Search orders, products, customers…"
              className="min-w-0 flex-1 bg-transparent font-ui text-xs text-pf-ivory placeholder-pf-ivory/30 outline-none"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
          </div>
        </div>

        {/* ---- Greeting (center, large screens) ---- */}
        <div className="hidden min-w-0 flex-1 px-6 xl:block">
          <p className="truncate font-display text-xl font-light text-pf-ivory">
            {greetingForNow()}, <span className="italic text-pf-gold">{employee?.firstName}</span>
          </p>
          <p className="mt-0.5 font-ui text-[10px] text-pf-ivory/50">
            {employee?.designation || role.label} · {getDepartmentLabel(employee?.department)} · {employee?.employeeId} ·{" "}
            {formatTodayLong()}
          </p>
        </div>

        {/* ---- Right actions ---- */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/store"
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
              {employee?.avatar ? (
                <img src={employee.avatar} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-pf-gold/30" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pf-gold/15 font-display text-sm font-light text-pf-gold ring-1 ring-pf-gold/25">
                  {employeeInitials(employee)}
                </span>
              )}
              <span className="hidden text-left sm:block">
                <span className="block font-ui text-xs font-medium text-pf-ivory">{name}</span>
                <span className="block font-ui text-[10px] uppercase tracking-[.14em] text-pf-gold/60">
                  {employee?.employeeId}
                </span>
              </span>
            </button>

            {menuOpen ? (
              <div
                role="menu"
                aria-label="Employee account menu"
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 border border-pf-border bg-pf-card text-pf-text shadow-xl"
              >
                <div className="border-b border-pf-border px-4 py-3">
                  <p className="font-display text-lg font-light text-pf-text">{name}</p>
                  <p className="font-ui text-[10px] uppercase tracking-[.16em] text-pf-muted">
                    {employee?.employeeId}
                  </p>
                </div>
                <Link
                  to="/employee/profile"
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
