import { cn } from "../../utils/cn";

/**
 * Shared Admin / Employee chrome below the portal header.
 *
 * Desktop: a persistent sidebar whose width follows the collapse preference.
 * The main column is flex-1 + min-w-0 so it consumes remaining width and
 * never keeps the expanded-sidebar measure after collapse.
 *
 * Mobile / tablet below `lg`: the sidebar is an off-canvas drawer. Collapse
 * is not applied — the drawer always shows full labels.
 *
 * SCROLL OWNERSHIP (Phase 3): exactly ONE element scrolls inside the rail —
 * the `<nav>` rendered by PortalSidebar (`.pf-sidebar-scroll`). The `<aside>`
 * itself is never a scroll container on desktop (`lg:overflow-visible`), and
 * on the mobile drawer it clips the translated drawer (`overflow-hidden`)
 * without producing a second scrollbar. The sticky inner frame is height-
 * bounded to the viewport minus the masthead, so the identity block, the
 * navigation and the brand footer always share one column and the footer can
 * never overlap the last navigation item.
 */
export default function PortalShell({
  collapsed = false,
  navOpen = false,
  onCloseNav,
  drawerRef,
  sidebar,
  children,
  expandedWidthClass = "lg:w-[248px]",
  collapsedWidthClass = "lg:w-[72px]",
  overlayClassName = "fixed inset-0 z-30 bg-ink/40 backdrop-blur-[1px] lg:hidden",
  asideZClass = "z-40",
  beforeMain = null,
  mainClassName = "",
}) {
  return (
    <div className="lg:flex lg:min-w-0">
      {navOpen ? (
        <button
          type="button"
          className={overlayClassName}
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={onCloseNav}
        />
      ) : null}

      <aside
        ref={drawerRef}
        className={cn(
          /* The drawer starts BELOW the masthead on purpose: the header is a
             real navigation surface and must stay whole and usable while the
             rail is open. It previously began at the viewport top and padded
             its content down by the header height, which buried the brand
             behind an opaque panel and left only the account chip visible. */
          "fixed bottom-0 left-0 top-[var(--pf-header-h)] w-72 max-w-[88vw] overflow-hidden border-r border-pf-gold/15 bg-pf-burgundy",
          "transition-[width,transform] duration-200 ease-out motion-reduce:transition-none",
          "lg:static lg:z-0 lg:translate-x-0 lg:overflow-visible lg:shrink-0",
          asideZClass,
          navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed ? collapsedWidthClass : expandedWidthClass
        )}
      >
        <div className="h-full min-h-0 lg:sticky lg:top-[var(--pf-header-h)] lg:h-[calc(100vh-var(--pf-header-h))]">
          {sidebar}
        </div>
      </aside>

      <main
        className={cn(
          "relative min-h-[calc(100vh-var(--pf-header-h))] min-w-0 w-full max-w-full flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8 xl:px-10 xl:py-9",
          mainClassName
        )}
      >
        {beforeMain}
        {children}
      </main>
    </div>
  );
}
