import { useMemo } from "react";
import { ADMIN_NAV_GROUPS, filterAdminNav, resolveActiveNavId } from "../../config/adminNavigation";
import { getAdminRoleLabel } from "../../config/adminAccess";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { adminInitials } from "../../utils/admin";
import PortalSidebar from "../navigation/PortalSidebar";
import { adminNavIcon } from "./adminNavIcons";

const STORAGE_KEY = "pf_admin_nav_groups";

/**
 * The Admin Portal navigation — a management control centre.
 *
 * Renders the shared PortalSidebar with the ONE Admin navigation
 * configuration, capability-filtered for the signed-in Admin (SUPER_ADMIN
 * sees the complete tree). Backend authorization stays authoritative; this
 * filtering only decides what's worth showing.
 */
export default function AdminSidebar({ onNavigate, collapsed = false, onToggleCollapsed }) {
  const { admin, hasPermission, signOut } = useAdminAuth();
  const groups = useMemo(() => filterAdminNav(ADMIN_NAV_GROUPS, hasPermission), [hasPermission]);

  return (
    <PortalSidebar
      navId="admin-navigation"
      ariaLabel="Admin portal"
      groups={groups}
      resolveActiveId={resolveActiveNavId}
      iconResolver={adminNavIcon}
      storageKey={STORAGE_KEY}
      identity={{
        name: admin?.name || "Administrator",
        roleLabel: getAdminRoleLabel(admin?.role),
        avatar: admin?.avatar,
        initials: adminInitials(admin),
      }}
      footerLinks={[{ id: "profile", label: "Profile", to: "/admin/profile", icon: "user" }]}
      signOut={signOut}
      onNavigate={onNavigate}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
    />
  );
}
