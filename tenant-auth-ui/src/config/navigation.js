import { SCOPES } from '../constants/scopes'
import { ROUTES } from '../constants/routes'
import { STRINGS } from '../constants'
import {
  hasScope, canRunSetupWizard, isSetupPending, isSuperAdmin,
} from '../utils/permissions'

/**
 * The top bar, and the platform console's tabs.
 *
 * Every tenant screen now lives in a WORKSPACE — see config/workspaces.js,
 * which builds the left rail, the tabs, the routes and the redirects from the
 * old /frontdesk/* and /master/* addresses. What remains here is the little
 * that sits outside any workspace: Home, the first-time setup wizard, the audit
 * log while setup is pending, and the super admin's platform console.
 *
 * The rule for `scopes` is unchanged: MIRROR THE API GUARD. `scopes: null`
 * means unconditional; hasScope() admits a super admin to everything, matching
 * checkScope's bypass on the server.
 */

// Kept for callers that import them from here; the definition moved with the
// Master Data grids into Admin › Data tables.
export { MASTER_DATA_CATEGORIES, MASTER_DATA_SCOPES } from './workspaces'

/**
 * `duringSetup: true` marks the few entries that survive the first-time setup
 * gate. Everything else disappears until the wizard is finished, because the
 * API refuses those calls with TENANT_SETUP_REQUIRED — the menu says the same
 * thing the server would.
 */
export const PRIMARY_NAV = [
  // Home forwards to the first workspace this person can open.
  { key: 'home', path: ROUTES.DASHBOARD, label: STRINGS.nav.home, scopes: null, duringSetup: true },
  // The wizard entry point disappears for good once setup is done.
  { key: 'setupWizard', path: ROUTES.MASTER_SETUP, label: STRINGS.nav.masterSetup,
    scopes: null, duringSetup: true, when: canRunSetupWizard },
  // While setup is pending the workspaces are closed, so the audit log needs a
  // way in of its own. Afterwards it is Admin › Audit Logs.
  { key: 'audit', path: ROUTES.AUDIT, label: STRINGS.nav.auditLogs,
    scopes: [SCOPES.AUDIT_READ, SCOPES.ADMIN_ACCESS, SCOPES.TENANT_ADMIN], duringSetup: true, when: isSetupPending },
  // The platform console — onboarding, the global feature catalogue,
  // cross-tenant users, system configuration. Nothing here can be narrowed to
  // one tenancy, so it is super-admin-only and not a workspace.
  { key: 'platform', path: ROUTES.ADMIN, label: STRINGS.nav.platform,
    scopes: [SCOPES.TENANT_SUPER_ADMIN], duringSetup: true },
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
 * duplicated what is now Admin › People & Access, so they moved there and the old URLs
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

/** Admin tabs this user may open. */
export const visibleAdminTabs = (user) =>
  ADMIN_NAV.filter((tab) => !tab.superAdminOnly || isSuperAdmin(user))

const navigation = { PRIMARY_NAV, ADMIN_NAV, visibleNavItems, visibleAdminTabs }

export default navigation
