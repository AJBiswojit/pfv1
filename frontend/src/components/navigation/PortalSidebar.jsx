import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "../../utils/cn";
import RailTooltip from "./RailTooltip";

/**
 * PRATIKSHYA FASHION — Shared Portal sidebar rendering.
 *
 * Used by BOTH the Admin and Employee portals. Renders:
 *   - an identity header (real authenticated identity)
 *   - collapsible, role/scope-aware navigation groups
 *   - a desktop rail collapse control (labels hide; icons remain)
 *
 * Visual theme: deep burgundy background, warm ivory text, champagne-gold
 * accents. Profile and Sign Out are intentionally NOT rendered here — they
 * live in the top-right header account menu per the approved design lock.
 *
 * All authorization filtering happens upstream (navigationForRole /
 * the admin config). This component is purely presentational, so it never
 * invents visibility or weakens a route guard.
 *
 * Icon resolution, active-route resolution, badge source and persistence
 * key are injected so each portal keeps its own identity.
 *
 * `collapsed` is a desktop-only rail. Below `lg` the drawer always shows
 * full labels regardless of the persisted preference.
 *
 * SCROLLING (Phase 3): the `<nav>` is the ONE scroll owner in the rail and
 * carries `.pf-scroll .pf-scroll--dark` (slim champagne thumb on a
 * transparent track, strengthened on hover/focus). The identity block and
 * the brand footer are flex children that never scroll, so they cannot
 * overlap the navigation; the active destination is scrolled into view
 * whenever the route changes.
 */
export default function PortalSidebar({
  navId,
  ariaLabel,
  groups,
  resolveActiveId,
  badges = {},
  identity = {},
  onNavigate,
  storageKey,
  iconResolver,
  collapsed = false,
  onToggleCollapsed,
}) {
  const location = useLocation();
  const pathname = location?.pathname ?? "";
  const navRef = useRef(null);

  /* The navigation data contract: an array of groups, each with an items
     array. Both portals satisfy it, but a portal may hand over an empty or
     still-loading configuration, so it is normalised once, here. */
  const navGroups = useMemo(() => normalizeGroups(groups), [groups]);

  const resolveIcon = useMemo(() => makeIconResolver(iconResolver), [iconResolver]);

  const activeId = useMemo(() => {
    if (typeof resolveActiveId !== "function") return null;
    try {
      return resolveActiveId(pathname, navGroups) ?? null;
    } catch {
      /* An unmatched or unexpected pathname must never break the portal. */
      return null;
    }
  }, [pathname, navGroups, resolveActiveId]);

  const activeGroupId = useMemo(() => {
    for (const group of navGroups) {
      const hasActive = group.items.some(
        (item) =>
          item.id === activeId ||
          (Array.isArray(item.children) &&
            item.children.some((child) => child.id === activeId))
      );
      if (hasActive) return group.id;
    }
    return null;
  }, [navGroups, activeId]);

  const [expanded, setExpanded] = useState(() => {
    const persisted = readPersistedGroups(storageKey);
    /* Fresh visitors (no stored preference) see the Overview group open;
       everything else stays compact so the sidebar does not create
       excessive height. */
    const seed = persisted ?? new Set(defaultOpenGroupIds(normalizeGroups(groups)));
    if (activeGroupId) seed.add(activeGroupId);
    return seed;
  });

  useEffect(() => {
    writePersistedGroups(storageKey, expanded);
  }, [storageKey, expanded]);

  /* Auto-expand the group of the current route and keep it open while
     navigating inside it. */
  useEffect(() => {
    if (!activeGroupId) return;
    setExpanded((current) => {
      if (current.has(activeGroupId)) return current;
      const next = new Set(current);
      next.add(activeGroupId);
      return next;
    });
  }, [activeGroupId, pathname]);

  /* Keep the active destination visible in the rail — deep links and lower
     groups must never leave the current page hidden below the fold. */
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof nav.querySelector !== "function") return undefined;
    const reveal = () => {
      try {
        const active = nav.querySelector('[aria-current="page"]');
        if (!active || typeof active.getBoundingClientRect !== "function") return;
        const navBox = nav.getBoundingClientRect();
        const itemBox = active.getBoundingClientRect();
        /* Scroll ONLY the rail — never the page behind it. */
        if (itemBox.top < navBox.top) {
          nav.scrollTop -= navBox.top - itemBox.top + 8;
        } else if (itemBox.bottom > navBox.bottom) {
          nav.scrollTop += itemBox.bottom - navBox.bottom + 8;
        }
      } catch {
        /* measurement unavailable in non-visual renderers */
      }
    };
    const frame =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(reveal)
        : null;
    return () => {
      if (frame && typeof window !== "undefined") window.cancelAnimationFrame(frame);
    };
  }, [pathname, activeId, expanded, collapsed]);

  const toggleGroup = (groupId) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const isOpen = (groupId) => expanded.has(groupId);

  /* Identity may still be hydrating on the first paint, so every field has a
     rendering-only fallback. No real person is ever hardcoded. */
  const displayName = identity?.name || "Team member";
  const displayRole = identity?.roleLabel || "Team member";
  const displayInitials = identity?.initials || "PF";

  const collapseLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <div className="flex h-full min-h-0 flex-col bg-pf-burgundy">
      {/* ------------------------------------------------ identity */}
      <div className={cn("relative px-4 pb-3.5 pt-4", collapsed && "lg:px-2")}>
        <div className={cn("flex items-center gap-3", collapsed && "lg:flex-col lg:gap-0")}>
          <RailTooltip label={`${displayName} · ${displayRole}`} enabled={collapsed} className="inline-flex shrink-0">
            {identity?.avatar ? (
              <img
                src={identity.avatar}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-pf-gold/40"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-pf-gold/30 bg-pf-gold/12 font-display text-[15px] leading-none text-pf-gold"
              >
                {displayInitials}
              </span>
            )}
          </RailTooltip>
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <p className="truncate font-display text-[17px] leading-tight text-pf-ivory">
              {displayName}
            </p>
            <p className="mt-1 truncate font-ui text-[10px] font-semibold uppercase tracking-[.2em] text-pf-gold/90">
              {displayRole}
            </p>
          </div>
          {typeof onToggleCollapsed === "function" ? (
            <RailTooltip label={collapseLabel} enabled={!collapsed}>
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={collapseLabel}
                aria-expanded={!collapsed}
                className={cn(
                  "hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-pf-ivory/12 text-pf-ivory/55 transition-colors duration-200 hover:border-pf-gold/45 hover:text-pf-ivory focus-visible:outline-pf-gold lg:flex",
                  collapsed && "lg:mt-3"
                )}
              >
                {collapsed ? (
                  <PanelLeftOpen size={15} strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <PanelLeftClose size={15} strokeWidth={1.5} aria-hidden="true" />
                )}
              </button>
            </RailTooltip>
          ) : null}
        </div>
      </div>

      <span aria-hidden="true" className="mx-4 h-px shrink-0 bg-pf-ivory/10" />

      {/* ------------------------------------------------ navigation */}
      <nav
        id={navId}
        ref={navRef}
        aria-label={ariaLabel}
        tabIndex={0}
        className={cn(
          "pf-scroll pf-sidebar-scroll min-h-0 flex-1 px-2.5 pb-5 pt-3",
          collapsed && "lg:px-1.5"
        )}
      >
        {navGroups.map((group, groupIndex) => {
          const GroupIcon = resolveIcon(group.icon);
          const open = isOpen(group.id);
          const showItems = open || collapsed;
          return (
            <section
              key={group.id}
              className={cn(
                "pb-2.5",
                groupIndex > 0 && "mt-1 border-t border-pf-ivory/[0.07] pt-2.5 last:pb-0"
              )}
            >
              <h2 className={cn("px-1.5", collapsed && "lg:px-0")}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={open}
                  aria-controls={`navgroup-${group.id}`}
                  className={cn(
                    "group/heading flex w-full items-center justify-between gap-2 rounded-sm py-1.5 text-left focus-visible:outline-pf-gold",
                    collapsed && "lg:hidden"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <GroupIcon
                      size={12}
                      strokeWidth={1.6}
                      aria-hidden="true"
                      className="shrink-0 text-pf-gold/70"
                    />
                    <span className="truncate font-ui text-[10px] font-semibold uppercase tracking-[.14em] text-pf-ivory/60 transition-colors group-hover/heading:text-pf-ivory/85">
                      {group.label}
                    </span>
                  </span>
                  <Chevron iconResolver={resolveIcon} open={open} />
                </button>
                <RailTooltip label={group.label} enabled={collapsed}>
                  <span
                    className={cn(
                      "hidden items-center justify-center py-2",
                      collapsed && "lg:flex"
                    )}
                    aria-hidden="true"
                  >
                    <GroupIcon size={13} strokeWidth={1.6} className="shrink-0 text-pf-gold/70" />
                  </span>
                </RailTooltip>
              </h2>

              {showItems ? (
                <ul
                  id={`navgroup-${group.id}`}
                  className={cn("mt-1 space-y-0.5", !open && collapsed && "hidden lg:block")}
                >
                  {group.items.map((item) => (
                    <GroupItems
                      key={item.id}
                      item={item}
                      activeId={activeId}
                      badge={badges?.[item.id]}
                      onNavigate={onNavigate}
                      iconResolver={resolveIcon}
                      collapsed={collapsed}
                    />
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </nav>

      {/* ------------------------------------------------ footer
          Brand signature only. Profile and Sign Out are intentionally
          ABSENT from the sidebar (approved design lock) — both live in
          the header account menu. */}
      <div
        className={cn(
          "relative shrink-0 bg-pf-wine px-4 py-3.5",
          "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-pf-gold/45 before:via-pf-gold/20 before:to-transparent",
          collapsed && "lg:hidden"
        )}
      >
        <p className="font-display text-[12px] uppercase leading-tight tracking-[0.22em] text-pf-ivory/75">
          Pratikshya Fashion
        </p>
        <p className="mt-1 font-ui text-[10px] uppercase tracking-[0.16em] text-pf-gold/80">
          The house of timeless fashion
        </p>
      </div>
    </div>
  );
}

function Chevron({ open, iconResolver }) {
  const ChevronDown = iconResolver("chevronDown");
  return (
    <ChevronDown
      aria-hidden="true"
      size={13}
      strokeWidth={1.6}
      className={cn(
        "shrink-0 text-pf-ivory/35 transition-transform duration-200",
        open ? "rotate-180" : "rotate-0"
      )}
    />
  );
}

function GroupItems({ item, activeId, badge, onNavigate, iconResolver, collapsed }) {
  const Icon = iconResolver(item.icon);
  const isActive = item.id === activeId;
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;

  return (
    <li>
      <RailTooltip label={item.label} enabled={collapsed}>
        <Link
          to={item.to}
          onClick={onNavigate}
          title={collapsed ? undefined : item.label}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "group/item relative flex min-w-0 items-center gap-2.5 rounded-md py-2 pl-2.5 pr-2 font-ui text-[13px] font-medium leading-snug transition-colors duration-150",
            collapsed && "lg:justify-center lg:gap-0 lg:px-0 lg:py-2",
            isActive
              ? "bg-pf-wine-soft text-pf-ivory shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]"
              : "text-pf-ivory/70 hover:bg-pf-ivory/[0.06] hover:text-pf-ivory"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-y-1.5 left-0 w-[2px] rounded-full transition-opacity",
              isActive ? "bg-pf-gold opacity-100" : "opacity-0"
            )}
          />
          <Icon
            size={16}
            strokeWidth={1.6}
            aria-hidden="true"
            className={cn(
              "shrink-0 transition-colors",
              isActive ? "text-pf-gold" : "text-pf-gold/65 group-hover/item:text-pf-gold/90"
            )}
          />
          <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:sr-only")}>{item.label}</span>
          {badge > 0 ? (
            <>
              <span
                className={cn(
                  "shrink-0 rounded-full bg-pf-gold/18 px-1.5 py-[3px] font-ui text-[10px] font-semibold leading-none tabular-nums text-pf-gold",
                  collapsed && "lg:hidden"
                )}
              >
                {badge}
              </span>
              {collapsed ? (
                <span
                  className="absolute right-1.5 top-1.5 hidden h-1.5 w-1.5 rounded-full bg-pf-gold lg:block"
                  aria-hidden="true"
                />
              ) : null}
            </>
          ) : null}
        </Link>
      </RailTooltip>

      {hasChildren ? (
        <ul
          className={cn(
            "relative mt-0.5 space-y-0.5 pl-[22px]",
            collapsed && "lg:pl-0"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute bottom-1 left-[13px] top-1 w-px bg-pf-ivory/10",
              collapsed && "lg:hidden"
            )}
          />
          {item.children.map((child) => (
            <li key={child.id}>
              <ChildLink
                child={child}
                activeId={activeId}
                onNavigate={onNavigate}
                iconResolver={iconResolver}
                collapsed={collapsed}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ChildLink({ child, activeId, onNavigate, iconResolver, collapsed }) {
  const Icon = iconResolver(child.icon);
  const isActive = child.id === activeId;
  return (
    <RailTooltip label={child.label} enabled={collapsed}>
      <Link
        to={child.to}
        onClick={onNavigate}
        title={collapsed ? undefined : child.label}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group/child relative flex min-w-0 items-center gap-2 rounded-md py-[7px] pl-2.5 pr-2 font-ui text-[12.5px] leading-snug transition-colors duration-150",
          collapsed && "lg:justify-center lg:gap-0 lg:px-0 lg:py-2",
          isActive
            ? "bg-pf-wine-soft font-medium text-pf-ivory"
            : "text-pf-ivory/60 hover:bg-pf-ivory/[0.05] hover:text-pf-ivory/90"
        )}
      >
        <Icon
          size={14}
          strokeWidth={1.6}
          aria-hidden="true"
          className={cn(
            "shrink-0",
            isActive ? "text-pf-gold" : "text-pf-gold/55 group-hover/child:text-pf-gold/85"
          )}
        />
        <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:sr-only")}>{child.label}</span>
      </Link>
    </RailTooltip>
  );
}

/**
 * THE NAVIGATION DATA CONTRACT.
 *
 * PortalSidebar renders `groups`: an array of
 *   { id, label, icon, items: [{ id, label, to, icon, children? }] }
 *
 * Admin passes ADMIN_NAV_GROUPS and Employee passes the permission-filtered
 * result of navigationForRole — both already satisfy this shape. Normalising
 * once here means the render tree below can iterate without null checks, and
 * a portal whose configuration is momentarily empty renders an empty nav
 * instead of crashing the whole layout.
 */
function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .filter((group) => group && group.id)
    .map((group) => ({
      ...group,
      items: Array.isArray(group.items)
        ? group.items
            .filter((item) => item && item.id && item.to)
            .map((item) => ({
              ...item,
              children: Array.isArray(item.children)
                ? item.children.filter((child) => child && child.id && child.to)
                : undefined,
            }))
        : [],
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Every icon is resolved through the portal's own lucide-react map. A missing
 * or unknown key must never render `undefined` as a component — that alone
 * would crash the sidebar — so an inert placeholder is the last resort.
 */
function makeIconResolver(iconResolver) {
  return (name) => {
    if (typeof iconResolver !== "function") return FallbackIcon;
    try {
      return iconResolver(name) || FallbackIcon;
    } catch {
      return FallbackIcon;
    }
  };
}

function FallbackIcon(props) {
  return <span aria-hidden="true" {...props} />;
}

/** Fresh visitors open Overview only; fall back to the first group. */
function defaultOpenGroupIds(groups) {
  if (!groups.length) return [];
  const overview = groups.find((group) => group.id === "overview");
  return [overview ? overview.id : groups[0].id];
}

/**
 * Returns the stored preference, or null when there is nothing usable stored
 * (first visit, corrupted value, or storage unavailable) so the caller can
 * apply its own default.
 */
function readPersistedGroups(key) {
  if (!key || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((id) => typeof id === "string" && id));
  } catch {
    return null;
  }
}

function writePersistedGroups(key, groups) {
  if (!key || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify([...groups]));
  } catch {
    /* storage unavailable — preference simply is not remembered */
  }
}
