/**
 * PRATIKSHYA FASHION — Media authorization.
 *
 * Media is governed by the permission architecture the house already has:
 * the keys live in `employeePermissions`, the role defaults in
 * `employeeRoles`, and the checks in `employees/authorization`. Nothing here
 * invents a second permission system — this file only answers "who is
 * asking" for the two portals that can reach media.
 *
 *   Admin Portal    capability-based, exactly like the server: an ADMIN holds
 *                   `media.*` only if its resolved grant list carries it
 *                   (built-in ADMIN does; a custom-permission ADMIN may not),
 *                   while SUPER_ADMIN overrides every check
 *   Employee portal permissions come from the employee's own grant list
 *   Customer        no media permissions at all
 *
 * Admin authority is resolved with `hasAdminPermission` — the same helper the
 * homepage surfaces use (`homepageContentModel.homepageAccess`) and the same
 * codes `require_admin_permission` enforces server-side. A role-limited ADMIN
 * therefore sees exactly the controls its token can actually use: this file
 * grants nothing extra, and the server remains the authority.
 *
 * UI hiding is never the only control: the routes are also guarded, and the
 * backend enforces the same keys on every call.
 */

import { hasAdminPermission } from "../../config/adminAccess";
import { PERMISSIONS } from "../../config/employeePermissions";
import { hasPermission } from "../employees/authorization";

export const MEDIA_PERMISSIONS = {
  VIEW: PERMISSIONS.MEDIA_VIEW,
  UPLOAD: PERMISSIONS.MEDIA_UPLOAD,
  EDIT: PERMISSIONS.MEDIA_EDIT,
  DELETE: PERMISSIONS.MEDIA_DELETE,
  ASSIGN: PERMISSIONS.MEDIA_ASSIGN,
  MANAGE: PERMISSIONS.MEDIA_MANAGE,
};

/**
 * What an ADMIN-workspace session may do with media.
 *
 * Each answer is the backend's own capability code, resolved with the shared
 * house helper (SUPER_ADMIN and `*` pass every check; a legacy grant such as
 * `media.upload` expands through the same implication table the server uses,
 * so `media.upload` also satisfies `media.assign`/`media.edit`/`media.manage`).
 * Nothing is defaulted to "allowed": an ADMIN whose resolved grants carry no
 * `media.*` code gets no media abilities, matching the 401/403 the API would
 * return for that token.
 */
const adminGrant = (admin) => ({
  canView: hasAdminPermission(admin, MEDIA_PERMISSIONS.VIEW),
  canUpload: hasAdminPermission(admin, MEDIA_PERMISSIONS.UPLOAD),
  canEdit: hasAdminPermission(admin, MEDIA_PERMISSIONS.EDIT),
  canDelete: hasAdminPermission(admin, MEDIA_PERMISSIONS.DELETE),
  canAssign: hasAdminPermission(admin, MEDIA_PERMISSIONS.ASSIGN),
  canManageMarketing: hasAdminPermission(admin, MEDIA_PERMISSIONS.MANAGE),
});

/** No media permissions at all — the answer for a signed-out visitor. */
const noGrant = {
  canView: false,
  canUpload: false,
  canEdit: false,
  canDelete: false,
  canAssign: false,
  canManageMarketing: false,
};

/**
 * Resolves what a viewer may do with media.
 *
 * `admin` is an Admin Portal session; `employee` an employee one. An
 * administrator is answered first because the Admin Portal is where media
 * is managed. The admin answer is capability-based (see `adminGrant`), so the
 * UI never claims an ability the token does not hold.
 */
export const resolveMediaAccess = ({ admin = null, employee = null } = {}) => {
  if (admin) return { ...adminGrant(admin), actorLabel: admin.name ?? "Administrator" };
  if (!employee) return { ...noGrant, actorLabel: "Guest" };

  return {
    canView: hasPermission(employee, MEDIA_PERMISSIONS.VIEW),
    canUpload: hasPermission(employee, MEDIA_PERMISSIONS.UPLOAD),
    canEdit: hasPermission(employee, MEDIA_PERMISSIONS.EDIT),
    canDelete: hasPermission(employee, MEDIA_PERMISSIONS.DELETE),
    canAssign: hasPermission(employee, MEDIA_PERMISSIONS.ASSIGN),
    canManageMarketing: hasPermission(employee, MEDIA_PERMISSIONS.MANAGE),
    actorLabel: [employee.firstName, employee.lastName].filter(Boolean).join(" ") || "Team member",
  };
};

export default resolveMediaAccess;
