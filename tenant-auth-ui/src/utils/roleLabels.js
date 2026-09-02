// Role names, in the words of the job.
//
// `roles.name` stays the identity — it is seeded, cloned into every new tenancy
// by the provisioner, and referenced by anything outside this app — so nothing
// is renamed in the database. This is display only, and the code is still shown
// beside it so support can ask "which role do you hold" and get an answer that
// matches the seed.
//
// A role with no entry falls back to a readable form of its own name, so a role
// somebody creates by hand never renders as a bare enum either.
const DISPLAY = {
  SUPER_ADMIN:       'Platform super admin',
  TENANT_ADMIN:      'Restaurant administrator',
  POS_MANAGER:       'Front desk manager',
  POS_CASHIER:       'Cashier',
  POS_WAITER:        'Waiter',
  POS_KITCHEN_STAFF: 'Kitchen staff',
  ACCOUNTS_MANAGER:  'Accounts',
  INVENTORY_MANAGER: 'Inventory manager',
  OPERATIONS_STAFF:  'Operations staff',
  OWNER_OPERATOR:    'Owner-operator',
  EDITOR:            'Editor',
  VIEWER:            'Viewer',
}

/** Which part of the business a role belongs to, for grouping the list. */
const AREA = {
  SUPER_ADMIN: 'Administration',
  TENANT_ADMIN: 'Administration',
  POS_MANAGER: 'Front desk',
  POS_CASHIER: 'Front desk',
  POS_WAITER: 'Front desk',
  POS_KITCHEN_STAFF: 'Front desk',
  OWNER_OPERATOR: 'Front desk',
}

/**
 * `POS_KITCHEN_STAFF` → `Pos kitchen staff`. Ugly, but a sentence rather than a
 * code, and it means a hand-made role is still legible.
 */
const humaniseRole = (name) => {
  const words = String(name || '').replace(/_/g, ' ').toLowerCase().trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : String(name || '')
}

export const roleLabel = (role) => {
  const name = role?.name || role?.Name || ''
  return DISPLAY[name] || humaniseRole(name)
}

export const roleCode = (role) => role?.name || role?.Name || ''

export const roleArea = (role) => AREA[role?.name || role?.Name] || 'Back office'

export const roleDescription = (role) => role?.description || role?.Description || ''

// Roles the UI must never offer for assignment.
//
// SUPER_ADMIN is the platform owner's role: there is one owner, established when
// the system is installed, and nobody can be given the rank afterwards. Offering
// it in a picker labelled "Full system access" invited exactly the mistake it
// describes — and the role really does carry blanket READ+WRITE on every module,
// so ticking it over-granted even though it never conferred platform rank
// (that comes from user_tenants.is_super_admin, which no code path writes).
//
// The server refuses these too (utils/roleGuard.js). This filter is so nobody is
// shown a box that would only fail on save.
export const UNGRANTABLE_ROLE_NAMES = ['SUPER_ADMIN']

/**
 * The roles a person may actually be given. Use everywhere roles are OFFERED —
 * invitations, role editing. Not for displaying what somebody already holds:
 * the seeded platform owner does hold SUPER_ADMIN, and hiding it from their row
 * would misreport who they are.
 */
export const grantableRoles = (roles = []) =>
  roles.filter((r) => !UNGRANTABLE_ROLE_NAMES.includes(roleCode(r)))

export default { roleLabel, roleCode, roleArea, roleDescription, grantableRoles, UNGRANTABLE_ROLE_NAMES, DISPLAY }
