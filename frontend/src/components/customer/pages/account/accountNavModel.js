import { ACCOUNT_NAV_ITEMS } from '../../../../components/account/AccountNav.jsx';

/* Every leaf destination below is one of production's eleven account links —
   the sidebar reuses their labels, icons and destinations verbatim. What the
   port adds is the grouping: six entries stay standalone, five leaves become
   the tabs of three sections, and the AI section gains the family's storefront
   home the two AI pages never had. */

const leaf = (to) => ACCOUNT_NAV_ITEMS.find((entry) => entry.to === to);

const requireLeaf = (to) => {
  const found = leaf(to);
  if (!found) throw new Error(`account sidebar: production no longer links ${to}`);
  return found;
};

const standalone = (to, extra = {}) => {
  const { label, icon, badge } = requireLeaf(to);
  return { id: to, label, icon, to, match: [to], badge, ...extra };
};

/* The seven sidebar destinations, in sidebar order. `match` lists every
   pathname the entry stays active on: its own URL plus the legacy URLs that
   redirect into it, so a bookmarked address still highlights its section. */
export const ACCOUNT_SIDEBAR_GROUPS = [
  standalone('/account', { id: 'overview', match: ['/account'], exact: true }),
  standalone('/account/orders', { id: 'orders' }),
  standalone('/account/wishlist', { id: 'wishlist' }),
  standalone('/account/instagram-rewards', { id: 'rewards' }),
  {
    id: 'personal',
    label: 'Personal',
    icon: requireLeaf('/account/profile').icon,
    to: '/account/profile',
    match: ['/account/profile', '/account/addresses', '/account/preferences'],
  },
  {
    id: 'atelier',
    label: 'AI Atelier',
    icon: requireLeaf('/account/ai-shopping').icon,
    to: '/account/ai',
    match: ['/account/ai', '/account/ai-shopping', '/account/ai-mirror'],
  },
  {
    id: 'settings',
    label: requireLeaf('/account/settings').label,
    icon: requireLeaf('/account/settings').icon,
    to: '/account/settings',
    match: ['/account/settings', '/account/security'],
  },
];

export function isGroupActive(group, pathname) {
  if (!group || !pathname) return false;
  if (group.exact) return pathname === group.to;
  return group.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/* A tab keeps its leaf's destination label; `to` is the section URL with the
   tab query, except the default tab, which is the bare section URL. */
const tab = (id, to, leafTo, defaultTab = false) => ({
  id,
  to: defaultTab ? to : `${to}?tab=${id}`,
  label: requireLeaf(leafTo).label,
});

export const PERSONAL_DEFAULT_TAB = 'profile';

export const PERSONAL_TABS = [
  tab('profile', '/account/profile', '/account/profile', true),
  tab('addresses', '/account/profile', '/account/addresses'),
  tab('style', '/account/profile', '/account/preferences'),
];

export const AI_DEFAULT_TAB = 'shopping';

export const AI_TABS = [
  tab('shopping', '/account/ai', '/account/ai-shopping', true),
  tab('mirror', '/account/ai', '/account/ai-mirror'),
];

export const SETTINGS_DEFAULT_TAB = 'communication';

export const SETTINGS_TABS = [
  {
    id: 'communication',
    label: 'Communication',
    to: '/account/settings',
  },
  tab('security', '/account/settings', '/account/security'),
];

/* Every one of production's eleven destinations, mapped to where the new
   navigation answers it: a sidebar href, a tab href, or both. */
export const ACCOUNT_DESTINATION_COVERAGE = ACCOUNT_NAV_ITEMS.map((item) => {
  const sidebar = ACCOUNT_SIDEBAR_GROUPS.find((group) => group.match.includes(item.to));
  const tabHit = [...PERSONAL_TABS, ...AI_TABS, ...SETTINGS_TABS].find(
    (entry) => entry.to === item.to || entry.to.startsWith(`${item.to}?`),
  );
  return { to: item.to, label: item.label, sidebar: sidebar?.id ?? null, tab: tabHit?.id ?? null };
});
