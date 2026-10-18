import { Suspense, useEffect } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { LoadingState, PageTransition } from "../design-system";
import EmployeeHeader from "../components/employee/EmployeeHeader";
import EmployeeSidebar from "../components/employee/EmployeeSidebar";
import PortalShell from "../components/navigation/PortalShell";
import usePortalDrawer from "../components/navigation/usePortalDrawer";
import usePortalSidebarCollapse from "../components/navigation/usePortalSidebarCollapse";
import { useEmployeeAuth } from "../context/EmployeeAuthContext";
import { requiredPermissionForPath } from "../config/employeeNavigation";
import EmployeeDeskErrorBoundary from "../components/employee/EmployeeDeskErrorBoundary";

export default function EmployeeLayout() {
  const { pathname } = useLocation();
  const { employee, hasPermission } = useEmployeeAuth();
  const { navOpen, toggleNav, closeNav, triggerRef, drawerRef } = usePortalDrawer();
  const { collapsed, toggleCollapsed } = usePortalSidebarCollapse("employee");

  useEffect(() => {
    const previous = document.title;
    document.title = "Employee Portal — PRATIKSHYA FASHION";
    return () => {
      document.title = previous;
    };
  }, []);

  const required = requiredPermissionForPath(pathname);
  const denied =
    Boolean(required) &&
    Boolean(employee) &&
    !(Array.isArray(required) ? required.some(hasPermission) : hasPermission(required)) &&
    pathname !== "/employee/access-denied";

  return (
    <div className="pf-staff min-h-screen bg-pf-ivory text-pf-text font-ui selection:bg-pf-gold/30">
      <EmployeeHeader navOpen={navOpen} onToggleNav={toggleNav} menuButtonRef={triggerRef} />

      <PortalShell
        collapsed={collapsed}
        navOpen={navOpen}
        onCloseNav={closeNav}
        drawerRef={drawerRef}
        expandedWidthClass="lg:w-[240px]"
        collapsedWidthClass="lg:w-[72px]"
        overlayClassName="fixed inset-0 z-20 bg-ink/30 lg:hidden"
        asideZClass="z-30"
        sidebar={
          <EmployeeSidebar
            onNavigate={closeNav}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />
        }
        beforeMain={
          <p className="mb-6 font-ui text-[11px] text-pf-muted xl:hidden">
            {employee?.employeeId} · {employee?.shift}
          </p>
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={pathname} className="min-w-0 w-full max-w-full">
            <Suspense fallback={<LoadingState label="Preparing this desk" />}>
              <EmployeeDeskErrorBoundary key={pathname}>
                {denied ? <Navigate to="/employee/access-denied" replace /> : <Outlet />}
              </EmployeeDeskErrorBoundary>
            </Suspense>
          </PageTransition>
        </AnimatePresence>
      </PortalShell>
    </div>
  );
}
