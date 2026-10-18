import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { LoadingState, PageTransition } from "../design-system";
import AdminHeader from "../components/admin/AdminHeader";
import AdminSidebar from "../components/admin/AdminSidebar";
import PortalShell from "../components/navigation/PortalShell";
import StaffDeskErrorBoundary from "../components/navigation/StaffDeskErrorBoundary";
import usePortalDrawer from "../components/navigation/usePortalDrawer";
import usePortalSidebarCollapse from "../components/navigation/usePortalSidebarCollapse";
import { useAdminAuth } from "../context/AdminAuthContext";

/**
 * The Admin shell.
 *
 * Desktop keeps a persistent sidebar that can collapse to an icon rail;
 * tablet and mobile use a drawer over a scrim. Content sits on the warm
 * ivory staff canvas (`.pf-staff` scope) under the burgundy masthead.
 * Each desk renders inside StaffDeskErrorBoundary so one failing view
 * can never white-screen the whole portal.
 */
export default function AdminLayout() {
  const { pathname } = useLocation();
  const { isSuperAdmin } = useAdminAuth();
  const { navOpen, toggleNav, closeNav, triggerRef, drawerRef } = usePortalDrawer();
  const { collapsed, toggleCollapsed } = usePortalSidebarCollapse("admin");

  useEffect(() => {
    const previous = document.title;
    document.title = isSuperAdmin
      ? "Super Admin — PRATIKSHYA FASHION"
      : "Admin Portal — PRATIKSHYA FASHION";
    return () => {
      document.title = previous;
    };
  }, [isSuperAdmin]);

  return (
    <div className="pf-staff min-h-screen bg-pf-ivory font-ui text-pf-text selection:bg-pf-gold/30">
      <AdminHeader navOpen={navOpen} onToggleNav={toggleNav} menuButtonRef={triggerRef} />

      <PortalShell
        collapsed={collapsed}
        navOpen={navOpen}
        onCloseNav={closeNav}
        drawerRef={drawerRef}
        expandedWidthClass="lg:w-[248px]"
        collapsedWidthClass="lg:w-[72px]"
        overlayClassName="fixed inset-0 z-30 bg-ink/40 backdrop-blur-[1px] lg:hidden"
        asideZClass="z-40"
        sidebar={
          <AdminSidebar
            onNavigate={closeNav}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={pathname} className="min-w-0 w-full max-w-full">
            <Suspense fallback={<LoadingState label="Opening this desk" />}>
              <StaffDeskErrorBoundary key={pathname}>
                <Outlet />
              </StaffDeskErrorBoundary>
            </Suspense>
          </PageTransition>
        </AnimatePresence>
      </PortalShell>
    </div>
  );
}
