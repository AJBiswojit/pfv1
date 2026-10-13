import { useCallback, useMemo } from "react";
import { ADMIN_NAV_GROUPS, filterAdminNav, resolveActiveNavId } from "../../config/adminNavigation";
import { getAdminRoleLabel } from "../../config/adminAccess";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { adminDisplayName, adminInitials } from "../../utils/admin";
import PortalSidebar from "../navigation/PortalSidebar";
import { adminNavIcon } from "./adminNavIcons";

const STORAGE_KEY = "pf_admin_nav_groups";

/** Rewrite every `to` in a nav item (and its children) by swapping the path prefix. */
function rewriteItemPrefix(item, from, to) {
  const rewritten = {
    ...item,
    to: item.to ? item.to.replace(new RegExp(`^${from}`), to) : item.to,
  };
  if (Array.isArray(item.children)) {
    rewritten.children = item.children.map((child) => rewriteItemPrefix(child, from, to));
  }
  return rewritten;
}

/** Return nav groups with all `to` values rewritten to the given workspace prefix. */
function rewriteGroupsPrefix(groups, from, to) {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => rewriteItemPrefix(item, from, to)),
  }));
}

/**
 * The Admin Portal navigation — a management control centre.
 *
 * Renders the shared PortalSidebar with the ONE Admin navigation
 * configuration, capability-filtered for the signed-in Admin (SUPER_ADMIN
 * sees the complete tree). Backend authorization stays authoritative; this
 * filtering only decides what's worth showing.
 *
 * WORKSPACE-AWARE: when a SUPER_ADMIN session is active the sidebar rewrites
 * all `/admin/*` paths to `/super-admin/*` so sidebar clicks land on the
 * correct workspace routes instead of triggering the AdminProtectedRoute
 * redirect back to /super-admin.
 */
export default function AdminSidebar({ onNavigate, collapsed = false, onToggleCollapsed }) {
  const { admin, hasPermission, signOut, isSuperAdmin } = useAdminAuth();

  const workspacePrefix = isSuperAdmin ? "/super-admin" : "/admin";

  // Filter by capability first (using the canonical /admin paths), then
  // rewrite all `to` values to the active workspace prefix.
  const groups = useMemo(() => {
    const filtered = filterAdminNav(ADMIN_NAV_GROUPS, hasPermission);
    if (isSuperAdmin) {
      return rewriteGroupsPrefix(filtered, "/admin", "/super-admin");
    }
    return filtered;
  }, [hasPermission, isSuperAdmin]);

  // resolveActiveNavId compares `to` values against the current pathname.
  // Pass the already-prefixed groups so the active-item matching works
  // correctly for both workspaces.
  const resolveActiveId = useCallback(
    (pathname) => resolveActiveNavId(pathname, groups),
    [groups]
  );

  return (
    <PortalSidebar
      navId="admin-navigation"
      ariaLabel="Admin portal"
      groups={groups}
      resolveActiveId={resolveActiveId}
      iconResolver={adminNavIcon}
      storageKey={STORAGE_KEY}
      identity={{
        name: adminDisplayName(admin) || "Administrator",
        roleLabel: getAdminRoleLabel(admin?.role),
        avatar: admin?.avatar,
        initials: adminInitials(admin),
      }}
      footerLinks={[{ id: "profile", label: "Profile", to: `${workspacePrefix}/profile`, icon: "user" }]}
      signOut={signOut}
      onNavigate={onNavigate}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
    />
  );
}
