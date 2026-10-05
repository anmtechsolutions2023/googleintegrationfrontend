import { SCOPES } from '../constants/scopes'
import { MODULES } from './modules'
import { CATEGORY_READ_SCOPE, hasScope, canRunSetupWizard } from '../utils/permissions'

/**
 * The whole app's navigation: the till, then seven workspaces.
 *
 *   workspace  →  tab  →  (optional) section
 *   Service       Floor    Tables · QR inbox
 *
 * Billing & KOT is first and `bare`: one tab, no workspace header, so the till
 * opens one tap from anywhere and starts right under the navbar. It used to be
 * Service › Floor › Billing & KOT — two taps from anywhere else, and under a
 * title, four tabs and three section pills that took ~185px of a laptop screen.
 *
 * This file is the ONE place that says what exists, where it lives, who may
 * open it and which old URL it replaced. The rail, the tab strip, the section
 * switcher, the routes, the scope guards, the redirects from the old
 * /frontdesk/* and /master/* URLs, and the capability binding
 * (scripts/generate-scope-screens.cjs) are all generated from it. Adding a
 * screen is one line here plus its component in workspaceScreens.js.
 *
 * The rule for `scopes` is unchanged from the old sidebar: MIRROR THE API
 * GUARD. A tab whose scopes are looser than its endpoint's leads to a 403; one
 * that is tighter hides a screen the person may use. A tab with sections is
 * visible when any of its sections is; a workspace when any of its tabs is.
 *
 * FORMAT: keep every tab and section on ONE line with its `label:` and
 * `scopes:` — the capability generator reads this file line by line.
 */

const A = SCOPES.TENANT_ADMIN

/** Read scopes for an embedded Master Data grid — the grid's own category. */
const grid = (moduleKey) => [CATEGORY_READ_SCOPE[MODULES[moduleKey]?.category], A].filter(Boolean)

/** Any POS read — what the old Front Desk shell asked for. */
export const ANY_POS_READ = [
  SCOPES.POS_ORDER_READ, SCOPES.POS_CONFIG_READ, SCOPES.POS_KITCHEN_READ,
  SCOPES.POS_BILLING_READ, SCOPES.POS_CRM_READ, SCOPES.POS_OPS_READ,
  SCOPES.POS_REPORTS_READ, SCOPES.POS_QR_READ, A,
]

const REPORT_SCOPES = [
  SCOPES.TRANSACTIONS_READ, SCOPES.POS_REPORTS_READ, SCOPES.POS_CRM_READ,
  SCOPES.POS_BILLING_READ, SCOPES.ASSET_READ, SCOPES.AUDIT_READ, A,
]

export const MASTER_DATA_CATEGORIES = [
  'Master Data', 'Inventory', 'Transactions', 'Payments', 'Contacts & Addresses', 'Organization',
]
export const MASTER_DATA_SCOPES = [
  ...new Set(MASTER_DATA_CATEGORIES.map((c) => CATEGORY_READ_SCOPE[c]).filter(Boolean)), A,
]

export const WORKSPACES = [
  { workspace: 'Billing & KOT', key: 'billing', bare: true, hint: 'The till — take the order, send the KOT, settle the bill.', tabs: [
    { key: 'till', label: 'Billing & KOT', path: '/billing', banner: 'qrAlert', scopes: [SCOPES.POS_ORDER_READ, A], legacy: ['/frontdesk/billing', '/service/floor/order'] },
  ] },

  { workspace: 'Service', key: 'service', hint: 'The live shift — tables, orders, kitchen, counter.', tabs: [
    { key: 'today', label: 'Today', path: '/service/today', scopes: ANY_POS_READ, legacyExact: ['/frontdesk'] },
    { key: 'floor', path: '/service/floor', tabLabel: 'Floor', banner: 'qrAlert', sections: [
      { key: 'tables', label: 'Tables', scopes: [SCOPES.POS_ORDER_READ, A], legacy: ['/frontdesk/tables'] },
      { key: 'qr', label: 'QR inbox', scopes: [SCOPES.POS_QR_READ, SCOPES.POS_QR_WRITE, SCOPES.POS_ORDER_READ, A], legacy: ['/frontdesk/qr-orders'] },
    ] },
    { key: 'counter', path: '/service/counter', tabLabel: 'Counter & online', sections: [
      { key: 'tokens', label: 'Token Queue', scopes: [SCOPES.POS_OPS_READ, A], legacy: ['/frontdesk/tokens'] },
      { key: 'online', label: 'Online Orders', scopes: [SCOPES.POS_OPS_READ, A], legacy: ['/frontdesk/online'] },
      { key: 'tracking', label: 'Live Tracking', scopes: [SCOPES.POS_OPS_READ, A], legacy: ['/frontdesk/tracking'] },
    ] },
    { key: 'kitchen', label: 'Kitchen (KDS)', path: '/service/kitchen', scopes: [SCOPES.POS_KITCHEN_READ, A], legacy: ['/frontdesk/kitchen'] },
  ] },

  { workspace: 'Menu', key: 'menu', hint: 'What is sold, when, where and for how much.', tabs: [
    { key: 'items', label: 'Menu Master', path: '/menu/items', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/menu'] },
    { key: 'categories', path: '/menu/categories', tabLabel: 'Categories & hours', sections: [
      { key: 'hours', label: 'Category Hours', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/category-schedules'] },
      { key: 'categories', label: 'Categories', scopes: grid('categories'), grid: 'categories' },
    ] },
    { key: 'options', path: '/menu/options', tabLabel: 'Options', sections: [
      { key: 'variants', label: 'Variants', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/variants'] },
      { key: 'addon-groups', label: 'Add-on Groups', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/addon-groups'] },
      { key: 'addons', label: 'Add-ons', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/addons'] },
    ] },
    { key: 'labels', path: '/menu/labels', tabLabel: 'Labels', sections: [
      { key: 'food-types', label: 'Food Types', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/food-types'] },
      { key: 'meat-types', label: 'Meat Types', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/meat-types'] },
      { key: 'menu-tags', label: 'Menu Tags', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/menu-tags'] },
    ] },
    { key: 'channels', path: '/menu/channels', tabLabel: 'Channels & portals', sections: [
      { key: 'channels', label: 'Channels', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/channels'] },
      { key: 'portals', label: 'Portals', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/portals'], nested: true },
      { key: 'rejection-reasons', label: 'Rejection Reasons', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/rejection-reasons'] },
    ] },
    { key: 'stock', path: '/menu/stock', tabLabel: 'Stock & units', sections: [
      // First in the tab because it is the only one here touched DAILY, and it
      // is touched before service: a dish tracked with no count today is not
      // sold. Open to the till scopes as well as config — the cashier is asked
      // whether a dish is still on before the guest is.
      { key: 'daily', label: "Today's Counts", scopes: [SCOPES.POS_CONFIG_READ, SCOPES.POS_OPS_READ, SCOPES.POS_BILLING_READ, A] },
      { key: 'inventory', label: 'Inventory', scopes: [SCOPES.INVENTORY_READ, A], legacy: ['/frontdesk/inventory'] },
      { key: 'units', label: 'Units of Measure', scopes: grid('uom'), grid: 'uom' },
      { key: 'uom-factors', label: 'UOM Factors', scopes: grid('uomFactors'), grid: 'uomFactors' },
      { key: 'batches', label: 'Batch Details', scopes: grid('batchDetails'), grid: 'batchDetails' },
    ] },
  ] },

  { workspace: 'Outlet', key: 'outlet', hint: 'The premises, and how the POS behaves there.', tabs: [
    { key: 'business', path: '/outlet/business', tabLabel: 'Business & branches', sections: [
      { key: 'profile', label: 'Business Profile', scopes: [SCOPES.ORGANIZATION_READ, SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/business-profile'] },
      { key: 'branches', label: 'Branches', scopes: grid('branchDetails'), grid: 'branchDetails' },
      { key: 'organizations', label: 'Organizations', scopes: grid('organizations'), grid: 'organizations' },
    ] },
    { key: 'floors', path: '/outlet/floors', tabLabel: 'Floors & tables', sections: [
      { key: 'floors', label: 'Floors', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/floors'] },
      { key: 'tables', label: 'Tables', scopes: [SCOPES.POS_CONFIG_READ, A] },
      { key: 'qr-codes', label: 'QR Codes', scopes: [SCOPES.POS_QR_READ, SCOPES.POS_QR_WRITE, A], legacy: ['/frontdesk/qr-codes'] },
    ] },
    { key: 'front-desk', label: 'POS Settings', path: '/outlet/front-desk', scopes: [SCOPES.POS_CONFIG_READ, A], legacy: ['/frontdesk/settings'] },
    { key: 'receipts', label: 'Receipt Format', path: '/outlet/receipts', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.POS_CONFIG_WRITE, A], legacy: ['/frontdesk/receipt-format'] },
    { key: 'payments', path: '/outlet/payments', tabLabel: 'Payment methods', sections: [
      { key: 'branch', label: 'Payment methods (per branch)', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.MASTER_DATA_READ, A] },
      { key: 'modes', label: 'Payment Modes', scopes: grid('paymentModes'), grid: 'paymentModes' },
      { key: 'received-types', label: 'Received Types', scopes: grid('paymentReceivedTypes'), grid: 'paymentReceivedTypes' },
    ] },
    { key: 'tax', path: '/outlet/tax', tabLabel: 'Tax & GST', sections: [
      { key: 'gst', label: 'GST Switch', scopes: [SCOPES.POS_CONFIG_READ, A] },
      { key: 'tax-types', label: 'Tax Types', scopes: grid('taxTypes'), grid: 'taxTypes' },
      { key: 'tax-groups', label: 'Tax Groups', scopes: grid('taxGroups'), grid: 'taxGroups' },
      { key: 'mappers', label: 'Tax Group Mappers', scopes: grid('taxGroupTaxTypeMappers'), grid: 'taxGroupTaxTypeMappers' },
    ] },
    { key: 'numbering', label: 'Numbering', path: '/outlet/numbering', scopes: grid('transactionTypeConfigs'), grid: 'transactionTypeConfigs' },
  ] },

  { workspace: 'Money', key: 'money', hint: 'Money in, money out, and what is on hand.', tabs: [
    { key: 'overview', label: 'Finance', path: '/money/overview', scopes: [SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE, A], legacy: ['/frontdesk/finance'] },
    { key: 'ledger', label: 'Ledger', path: '/money/ledger', scopes: [SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE, A], legacy: ['/frontdesk/ledger'] },
    // Money still owed on bills paid short. Offered to cashiers as well as the
    // books' readers: collecting a balance is taking money at the till.
    { key: 'dues', label: 'Dues', path: '/money/dues', scopes: [SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE, SCOPES.POS_BILLING_READ, SCOPES.POS_BILLING_WRITE, A] },
    { key: 'returns', label: 'Returns', path: '/money/returns', scopes: [SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE, A], legacy: ['/frontdesk/returns'] },
    { key: 'cash', label: 'Cash Sessions', path: '/money/cash', scopes: [SCOPES.POS_BILLING_READ, SCOPES.POS_BILLING_WRITE, A], legacy: ['/frontdesk/cash-sessions'] },
    { key: 'expenses', path: '/money/expenses', tabLabel: 'Expenses', sections: [
      { key: 'expenses', label: 'Expenses', scopes: [SCOPES.POS_OPS_READ, A], legacy: ['/frontdesk/expenses'] },
      { key: 'categories', label: 'Expense Categories', scopes: [SCOPES.POS_OPS_READ, SCOPES.POS_OPS_WRITE, SCOPES.EXPENSE_APPROVE, A], legacy: ['/frontdesk/expense-categories'] },
    ] },
    { key: 'assets', path: '/money/assets', tabLabel: 'Assets', sections: [
      { key: 'register', label: 'Asset Register', scopes: [SCOPES.ASSET_READ, SCOPES.ASSET_WRITE, A], legacy: ['/frontdesk/assets'] },
      { key: 'categories', label: 'Asset Categories', scopes: [SCOPES.ASSET_READ, SCOPES.ASSET_WRITE, A], legacy: ['/frontdesk/asset-categories'] },
    ] },
    { key: 'gst', label: 'GST filing', path: '/money/gst', scopes: [SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE, A] },
  ] },

  { workspace: 'Guests', key: 'guests', hint: 'Who comes back, what they said, and what brings them back.', tabs: [
    { key: 'customers', label: 'Customers', path: '/guests/customers', scopes: [SCOPES.POS_CRM_READ, A], legacy: ['/frontdesk/customers'] },
    { key: 'feedback', label: 'Feedback', path: '/guests/feedback', scopes: [SCOPES.POS_CRM_READ, A], legacy: ['/frontdesk/feedback'] },
    { key: 'offers', label: 'Campaigns', path: '/guests/offers', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.POS_CONFIG_WRITE, A], legacy: ['/frontdesk/campaigns'], nested: true },
  ] },

  { workspace: 'Insights', key: 'insights', hint: 'Every report, in one catalogue.', tabs: [
    { key: 'reports', label: 'Reports', path: '/insights/reports', scopes: REPORT_SCOPES, legacy: ['/reports'] },
    { key: 'live', label: 'Front desk today', path: '/insights/live', scopes: [SCOPES.POS_REPORTS_READ, A], legacy: ['/frontdesk/reports'] },
  ] },

  { workspace: 'Admin', key: 'org', hint: 'People, the audit trail, and the raw data tables.', tabs: [
    { key: 'people', label: 'People & Access', path: '/org/people', scopes: [SCOPES.TENANT_ADMIN], legacy: ['/frontdesk/access-control', '/frontdesk/staff'] },
    { key: 'audit', label: 'Audit Logs', path: '/org/audit', scopes: [SCOPES.AUDIT_READ, A] },
    { key: 'data', label: 'Data tables', path: '/org/data', scopes: MASTER_DATA_SCOPES, legacy: ['/master'], nested: true },
    { key: 'setup', label: 'Setup Wizard', path: '/master-setup', scopes: [A, SCOPES.TENANT_SUPER_ADMIN], external: true, when: canRunSetupWizard },
  ] },
]

// ── Queries over the config ────────────────────────────────────────────────

/** A tab's label, whether it has sections or not. */
export const tabLabelOf = (tab) => tab.tabLabel || tab.label

const may = (user, entry) => (!entry.when || entry.when(user)) && hasScope(user, entry.scopes || [])

/** Sections of a tab this user may open. */
export const visibleSections = (tab, user) => (tab.sections || []).filter((s) => may(user, s))

/** Tabs of a workspace this user may open. */
export const visibleTabs = (ws, user) =>
  ws.tabs.filter((t) => (t.sections ? visibleSections(t, user).length > 0 : may(user, t)))

/** Workspaces with at least one tab this user may open. */
export const visibleWorkspaces = (user) =>
  WORKSPACES.filter((ws) => visibleTabs(ws, user).length > 0)

/** Where a tab lands: its own path, or its first section this user may open. */
export const entryPathOf = (tab, user) => {
  if (!tab.sections) return tab.path
  const first = user ? visibleSections(tab, user)[0] : tab.sections[0]
  return `${tab.path}/${(first || tab.sections[0]).key}`
}

// Where Home looks first: the till, then the day-to-day workspaces before
// configuration, so an accountant who can also read the numbering series lands
// in Money, not Outlet.
const HOME_ORDER = ['billing', 'service', 'money', 'guests', 'menu', 'insights', 'outlet', 'org']

// The tab Home opens within a workspace when it is not the first one. Somebody
// who cannot open the till but can see Service lands on Floor (Tables, or the
// QR inbox) rather than Today. Anyone else falls back to the first tab.
const HOME_TAB = { service: 'floor' }

/**
 * Kitchen staff: they mark tickets ready and can only READ the till. Home used
 * to send them to Billing & KOT — the first workspace they could see — so their
 * shift started on a screen with no buttons for them.
 */
const worksTheKitchen = (user) =>
  hasScope(user, [SCOPES.POS_KITCHEN_WRITE])
  && !hasScope(user, [SCOPES.POS_ORDER_WRITE, SCOPES.POS_BILLING_WRITE, SCOPES.TENANT_ADMIN])

/** The first place this user may go — where Home sends them. */
export const homePathFor = (user) => {
  if (worksTheKitchen(user)) {
    const service = WORKSPACES.find((w) => w.key === 'service')
    const kds = service && visibleTabs(service, user).find((t) => t.key === 'kitchen')
    if (kds) return entryPathOf(kds, user)
  }
  const open = visibleWorkspaces(user)
  const ws = HOME_ORDER.map((k) => open.find((w) => w.key === k)).find(Boolean)
  if (!ws) return null
  const tabs = visibleTabs(ws, user)
  return entryPathOf(tabs.find((t) => t.key === HOME_TAB[ws.key]) || tabs[0], user)
}

/** Which workspace a path belongs to, for the rail's highlight. */
export const workspaceOfPath = (pathname) =>
  WORKSPACES.find((ws) => ws.tabs.some((t) => !t.external && (pathname === t.path || pathname.startsWith(`${t.path}/`))))

/**
 * Every old URL and the new path it now lives at, longest first so
 * '/frontdesk/menu-tags' is matched before '/frontdesk/menu'.
 */
export const LEGACY_PATHS = WORKSPACES
  .flatMap((ws) => ws.tabs.flatMap((t) => [
    ...(t.legacy || []).map((from) => ({ from, to: t.path })),
    // An old section ROOT (/frontdesk) means only itself: '/frontdesk/whatever'
    // is an unknown page, not Today with a suffix.
    ...(t.legacyExact || []).map((from) => ({ from, to: t.path, exact: true })),
    ...(t.sections || []).flatMap((s) => (s.legacy || []).map((from) => ({ from, to: `${t.path}/${s.key}` }))),
  ]))
  .sort((a, b) => b.from.length - a.from.length)

// Prefixes App.js already sends to the legacy redirect wholesale.
const OLD_ROOTS = /^\/(frontdesk|master|reports)(\/|$)/

/**
 * Old addresses inside today's workspace URLs — /service/floor/order, from
 * before Billing & KOT had a rail entry of its own. Nothing else catches them
 * (the router would answer 404), so each gets its own redirect route.
 */
export const MOVED_PATHS = LEGACY_PATHS.map((l) => l.from).filter((from) => !OLD_ROOTS.test(from))

/**
 * The new address for an old one, keeping whatever came after the matched
 * prefix (an id, a sub-page) and the query string. null when not an old URL.
 * @param {string} pathname
 * @param {string} [search]
 */
export const legacyTargetFor = (pathname, search = '') => {
  const clean = pathname.replace(/\/+$/, '') || '/'
  const hit = LEGACY_PATHS.find(({ from, exact }) => clean === from || (!exact && clean.startsWith(`${from}/`)))
  if (!hit) return null
  return `${hit.to}${clean.slice(hit.from.length)}${search || ''}`
}
