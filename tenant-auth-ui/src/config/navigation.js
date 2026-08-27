import { SCOPES } from '../constants/scopes'
import { ROUTES } from '../constants/routes'
import { STRINGS } from '../constants'
import {
  hasScope, canRunSetupWizard, isSetupPending, isSuperAdmin,
  CATEGORY_READ_SCOPE,
} from '../utils/permissions'

/**
 * Every navigable destination in the app, in one declarative list.
 *
 * Menus are rendered FROM this file rather than hand-written in each shell, so
 * adding a destination means adding an entry here and nothing else — no menu
 * component has to be reopened, and none can drift from another. That drift was
 * a real defect and not a tidiness point: the Master Data link carried no
 * permission check at all, and the desktop bar and the mobile drawer used to
 * hold two hand-maintained copies of the same list.
 *
 * The rule for `scopes` is: MIRROR THE API GUARD. A menu entry whose scopes are
 * looser than the route's takes the user to a 403; one that is tighter hides a
 * screen they are entitled to. Either way the menu is lying about what they may
 * do, which is worse than an ugly menu.
 *
 * `scopes: null` means unconditional. hasScope() admits a super admin to
 * everything, matching checkScope's bypass on the server.
 */

// Master Data is an index over six categories, and a user may hold READ on any
// one of them. Derived from the category map so a new category is covered
// automatically — the link's old state, no check at all, showed an empty index
// to anybody without a single one of these.
//
// POS categories are excluded deliberately. CATEGORY_READ_SCOPE also maps
// 'POS Config', 'POS Operations' and 'POS CRM', which live on the Front Desk;
// including them put Master Data in the menu of every cashier, since
// POS_CONFIG:READ is part of taking orders. The index itself only ever renders
// the six below, so the link must ask for the same six.
export const MASTER_DATA_CATEGORIES = [
  'Master Data', 'Inventory', 'Transactions',
  'Payments', 'Contacts & Addresses', 'Organization',
]

export const MASTER_DATA_SCOPES = [
  ...new Set(MASTER_DATA_CATEGORIES.map((c) => CATEGORY_READ_SCOPE[c]).filter(Boolean)),
  SCOPES.TENANT_ADMIN,
]

// Any POS read scope is enough to reach the Front Desk shell; the sidebar
// inside it then narrows to the individual screens.
const FRONT_DESK_SCOPES = [
  SCOPES.POS_ORDER_READ, SCOPES.POS_CONFIG_READ, SCOPES.POS_KITCHEN_READ,
  SCOPES.POS_BILLING_READ, SCOPES.POS_CRM_READ, SCOPES.POS_OPS_READ,
  SCOPES.POS_REPORTS_READ, SCOPES.TENANT_ADMIN,
]

/**
 * The top navigation bar.
 *
 * `duringSetup: true` marks the few entries that survive the first-time setup
 * gate. Everything else disappears until the wizard is finished, because the
 * API refuses those calls with TENANT_SETUP_REQUIRED — the menu says the same
 * thing the server would.
 */
export const PRIMARY_NAV = [
  { key: 'home', path: ROUTES.DASHBOARD, label: STRINGS.nav.home, scopes: null, duringSetup: true },
  { key: 'master', path: ROUTES.MASTER, label: STRINGS.nav.masterData, scopes: MASTER_DATA_SCOPES },
  // The wizard entry point disappears for good once setup is done.
  { key: 'setupWizard', path: ROUTES.MASTER_SETUP, label: STRINGS.nav.masterSetup,
    scopes: null, duringSetup: true, when: canRunSetupWizard },
  { key: 'reports', path: ROUTES.REPORTS, label: STRINGS.nav.reports,
    scopes: [SCOPES.REPORTS_READ, SCOPES.REPORTS_WRITE, SCOPES.TENANT_ADMIN] },
  // A tenancy's own people, invitations and roles — one screen, on Front Desk.
  // /admin/users and /admin/roles redirect to it.
  { key: 'access', path: ROUTES.ACCESS_CONTROL, label: STRINGS.nav.access,
    scopes: [SCOPES.ADMIN_ACCESS, SCOPES.TENANT_ADMIN] },
  { key: 'frontdesk', path: ROUTES.FRONTDESK, label: STRINGS.nav.frontDesk, scopes: FRONT_DESK_SCOPES },
  { key: 'audit', path: ROUTES.AUDIT, label: STRINGS.nav.auditLogs,
    scopes: [SCOPES.AUDIT_READ, SCOPES.ADMIN_ACCESS, SCOPES.TENANT_ADMIN], duringSetup: true },
  // The platform console — onboarding, the global feature catalogue,
  // cross-tenant users, system configuration. Nothing here can be narrowed to
  // one tenancy, so it is super-admin-only and separate from Access above.
  { key: 'platform', path: ROUTES.ADMIN, label: STRINGS.nav.platform,
    scopes: [SCOPES.TENANT_SUPER_ADMIN], duringSetup: true },
]

/**
 * The Front Desk sidebar, grouped by what the user is trying to do.
 * Groups with nothing visible in them are not rendered at all.
 */
export const FRONT_DESK_NAV = [
  { group: 'Operations', items: [
    { key: 'fd-dashboard', path: '/frontdesk',          label: 'Dashboard',     icon: '📊', scopes: null },
    { key: 'fd-billing',   path: '/frontdesk/billing',  label: 'Billing & KOT', icon: '🧾', scopes: [SCOPES.POS_ORDER_READ,   SCOPES.TENANT_ADMIN] },
    { key: 'fd-tables',    path: '/frontdesk/tables',   label: 'Tables',        icon: '🪑', scopes: [SCOPES.POS_ORDER_READ,   SCOPES.TENANT_ADMIN] },
    { key: 'fd-kitchen',   path: '/frontdesk/kitchen',  label: 'Kitchen (KDS)', icon: '👨‍🍳', scopes: [SCOPES.POS_KITCHEN_READ, SCOPES.TENANT_ADMIN] },
    { key: 'fd-tokens',    path: '/frontdesk/tokens',   label: 'Token Queue',   icon: '🎫', scopes: [SCOPES.POS_OPS_READ,     SCOPES.TENANT_ADMIN] },
    { key: 'fd-online',    path: '/frontdesk/online',   label: 'Online Orders', icon: '🛒', scopes: [SCOPES.POS_OPS_READ,     SCOPES.TENANT_ADMIN] },
    { key: 'fd-tracking',  path: '/frontdesk/tracking', label: 'Live Tracking', icon: '📍', scopes: [SCOPES.POS_OPS_READ,     SCOPES.TENANT_ADMIN] },
  ]},
  { group: 'Setup', items: [
    { key: 'fd-menu',       path: '/frontdesk/menu',       label: 'Menu Master',  icon: '🍽️', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { key: 'fd-food-types', path: '/frontdesk/food-types', label: 'Food Types',   icon: '🥗', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { key: 'fd-channels',   path: '/frontdesk/channels',   label: 'Channels',     icon: '📡', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    // A portal is a SELLER ON a channel, so it sits directly under Channels.
    { key: 'fd-portals',    path: '/frontdesk/portals',    label: 'Portals',      icon: '🔀', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { key: 'fd-variants',   path: '/frontdesk/variants',   label: 'Variants',     icon: '🧩', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { key: 'fd-floors',     path: '/frontdesk/floors',     label: 'Floors',       icon: '🏢', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { key: 'fd-settings',   path: '/frontdesk/settings',   label: 'POS Settings', icon: '⚙️', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { key: 'fd-inventory',  path: '/frontdesk/inventory',  label: 'Inventory',    icon: '📦', scopes: [SCOPES.INVENTORY_READ,  SCOPES.TENANT_ADMIN] },
    { key: 'fd-expense-cats', path: '/frontdesk/expense-categories', label: 'Expense Categories', icon: '🏷️', scopes: [SCOPES.POS_OPS_READ, SCOPES.EXPENSE_APPROVE, SCOPES.TENANT_ADMIN] },
    { key: 'fd-asset-cats',   path: '/frontdesk/asset-categories',   label: 'Asset Categories',   icon: '🏷️', scopes: [SCOPES.ASSET_READ,   SCOPES.ASSET_WRITE,     SCOPES.TENANT_ADMIN] },
  ]},
  // Money in, money out, and what is left. Separated from Operations because
  // these read the accounting ledger rather than the POS tables.
  { group: 'Finance', items: [
    { key: 'fd-finance',  path: '/frontdesk/finance',       label: 'Finance',        icon: '💰', scopes: [SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE, SCOPES.TENANT_ADMIN] },
    { key: 'fd-returns',  path: '/frontdesk/returns',       label: 'Returns',        icon: '↩️', scopes: [SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE, SCOPES.TENANT_ADMIN] },
    { key: 'fd-expenses', path: '/frontdesk/expenses',      label: 'Expenses',       icon: '💸', scopes: [SCOPES.POS_OPS_READ,      SCOPES.TENANT_ADMIN] },
    { key: 'fd-cash',     path: '/frontdesk/cash-sessions', label: 'Cash Sessions',  icon: '🧮', scopes: [SCOPES.POS_BILLING_READ,  SCOPES.POS_BILLING_WRITE, SCOPES.TENANT_ADMIN] },
    { key: 'fd-assets',   path: '/frontdesk/assets',        label: 'Asset Register', icon: '🏗️', scopes: [SCOPES.ASSET_READ,        SCOPES.ASSET_WRITE, SCOPES.TENANT_ADMIN] },
  ]},
  { group: 'CRM', items: [
    { key: 'fd-customers', path: '/frontdesk/customers', label: 'Customers', icon: '👥', scopes: [SCOPES.POS_CRM_READ, SCOPES.TENANT_ADMIN] },
    { key: 'fd-feedback',  path: '/frontdesk/feedback',  label: 'Feedback',  icon: '⭐', scopes: [SCOPES.POS_CRM_READ, SCOPES.TENANT_ADMIN] },
  ]},
  { group: 'Analytics & Admin', items: [
    { key: 'fd-reports', path: '/frontdesk/reports', label: 'Reports', icon: '📈', scopes: [SCOPES.POS_REPORTS_READ, SCOPES.TENANT_ADMIN] },
    { key: 'fd-ledger',  path: '/frontdesk/ledger',  label: 'Ledger',  icon: '📒', scopes: [SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE, SCOPES.TENANT_ADMIN] },
    // People, invitations and roles for this tenancy — a tenant-admin act, and
    // the only place any of it is managed.
    { key: 'fd-access',  path: ROUTES.ACCESS_CONTROL, label: 'People & Access', icon: '🔐', scopes: [SCOPES.TENANT_ADMIN, SCOPES.ADMIN_ACCESS] },
  ]},
]

/**
 * The tabs inside the platform console (/admin).
 *
 * Every one is `superAdminOnly`, and that is the definition of what belongs
 * here: the onboarding queue carries no tenant_id until a request is approved,
 * the feature catalogue is global, All Users spans tenancies and App Config is
 * system-wide. None can be narrowed to a single tenancy.
 *
 * Users and Roles used to sit here too. They were tenant-scoped all along and
 * duplicated /frontdesk/access-control, so they moved there and the old URLs
 * redirect.
 */
export const ADMIN_NAV = [
  { key: 'approvals', to: 'approvals', label: 'Approvals', icon: '📋', superAdminOnly: true },
  { key: 'features',  to: 'features',  label: 'Features',  icon: '⚙️', superAdminOnly: true },
  { key: 'all-users', to: 'all-users', label: 'All Users', icon: '🌐', superAdminOnly: true },
  { key: 'app-config', to: 'app-config', label: 'App Config', icon: '🛠️', superAdminOnly: true },
]

/**
 * Filter a flat list of nav entries down to what this user may actually reach.
 *
 * One place decides visibility for every menu, so a permission change cannot be
 * applied to the sidebar and forgotten in the top bar.
 *
 * @param {Array} items - Entries shaped like the lists above.
 * @param {Object} user - Decoded JWT payload.
 * @returns {Array} - The entries to render, in order.
 */
export const visibleNavItems = (items = [], user) => {
  const setupPending = isSetupPending(user)
  return items.filter((item) => {
    if (item.when && !item.when(user)) return false
    if (setupPending && !item.duringSetup) return false
    return hasScope(user, item.scopes || [])
  })
}

/**
 * The same filter for the grouped sidebar. Groups left empty are dropped, so a
 * user with no Finance permissions never sees a Finance heading over nothing.
 */
export const visibleNavGroups = (groups = [], user) =>
  groups
    .map(({ group, items }) => ({ group, items: visibleNavItems(items, user) }))
    .filter(({ items }) => items.length > 0)

/** Admin tabs this user may open. */
export const visibleAdminTabs = (user) =>
  ADMIN_NAV.filter((tab) => !tab.superAdminOnly || isSuperAdmin(user))

export default { PRIMARY_NAV, FRONT_DESK_NAV, ADMIN_NAV, visibleNavItems, visibleNavGroups, visibleAdminTabs }
