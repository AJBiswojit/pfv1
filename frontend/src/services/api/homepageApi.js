import { apiClient, handleError } from './apiClient';
import { hasAdminPermission } from '../../config/adminAccess';
import { hasPermission } from '../employees/authorization';

export function staffHomepageAccess(actor = {}) {
  // The caller supplies only the active workspace actor, never both sessions.
  const ambiguous = Boolean(actor.admin && actor.employee);
  const employee = !actor.admin && actor.employee;
  const can = (permission) => ambiguous ? false : employee ? hasPermission(employee, permission) : hasAdminPermission(actor.admin, permission);
  const view = can('marketing.view');
  return { scope: employee ? 'employee' : 'admin', view, write: view && can('marketing.manage'),
    mediaView: view && can('media.view'), mediaAssign: can('media.view') && can('media.assign'),
    mediaDelete: can('media.view') && can('media.delete'), heroCreate: can('media.upload'), can };
}

export async function homepageRequest(actor, path, method = 'get', body, permissions = []) {
  const access = staffHomepageAccess(actor);
  if (!access.view || !permissions.every(access.can)) return { ok: false, status: 403, error: 'Homepage permission denied.' };
  try {
    const url = `/${access.scope}/homepage${path}`;
    const options = { scope: access.scope };
    const data = method === 'get' || method === 'delete' ? await apiClient[method](url, options) : await apiClient[method](url, body, options);
    return { ok: true, ...data };
  } catch (error) { return handleError(error); }
}

export const readHomepageSection = (actor, key) => homepageRequest(actor, `/sections/${encodeURIComponent(key)}`);
export const writeHomepageSection = (actor, key, suffix, method, body) => homepageRequest(actor, `/sections/${encodeURIComponent(key)}${suffix}`, method, body, ['marketing.manage']);

export function employeeHeroAccess(actor) {
  const access = staffHomepageAccess(actor);
  return { view: access.mediaView, create: access.write && access.mediaView && access.heroCreate,
    edit: access.write && access.mediaAssign, delete: access.write && access.mediaDelete };
}

export async function employeeHeroRequest(actor, action, { id, draft, asset, ids } = {}) {
  const access = employeeHeroAccess(actor);
  const permission = action === 'read' ? 'view' : action === 'create' ? 'create' : action === 'delete' ? 'delete' : 'edit';
  if (!actor?.employee || actor.admin || !access[permission]) return { ok: false, status: 403, error: 'Employee hero permission denied.' };
  if (action === 'read') return homepageRequest(actor, '/hero/items');
  if (action === 'reorder') return homepageRequest(actor, '/hero/reorder', 'put', { itemIds: ids });
  if (action === 'delete') return homepageRequest(actor, `/hero/items/${encodeURIComponent(id)}`, 'delete');
  const payload = { ...draft, ...(asset ? { mediaAssetId: asset.id } : {}) };
  const result = await homepageRequest(actor, action === 'create' ? '/hero/items' : `/hero/items/${encodeURIComponent(id)}`, action === 'create' ? 'post' : 'patch', payload);
  return result.ok ? { ok: true, item: result } : result;
}
