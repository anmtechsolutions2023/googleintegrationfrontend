import { SCOPES } from '../constants/scopes';

// Maps MODULE_CATEGORIES display values → scope strings
export const CATEGORY_READ_SCOPE = {
  'Master Data':          SCOPES.MASTER_DATA_READ,
  'Inventory':            SCOPES.INVENTORY_READ,
  'Transactions':         SCOPES.TRANSACTIONS_READ,
  'Payments':             SCOPES.PAYMENTS_READ,
  'Contacts & Addresses': SCOPES.CONTACTS_READ,
  'Organization':         SCOPES.ORGANIZATION_READ,
  // POS categories
  'POS Config':           SCOPES.POS_CONFIG_READ,
  'POS Operations':       SCOPES.POS_OPS_READ,
  'POS CRM':              SCOPES.POS_CRM_READ,
};

export const CATEGORY_WRITE_SCOPE = {
  'Master Data':          SCOPES.MASTER_DATA_WRITE,
  'Inventory':            SCOPES.INVENTORY_WRITE,
  'Transactions':         SCOPES.TRANSACTIONS_WRITE,
  'Payments':             SCOPES.PAYMENTS_WRITE,
  'Contacts & Addresses': SCOPES.CONTACTS_WRITE,
  'Organization':         SCOPES.ORGANIZATION_WRITE,
  // POS categories
  'POS Config':           SCOPES.POS_CONFIG_WRITE,
  'POS Operations':       SCOPES.POS_OPS_WRITE,
  'POS CRM':              SCOPES.POS_CRM_WRITE,
};

/**
 * Check if user has any of the required scopes
 * Super admin has access to everything
 *
 * @param {Object} user - User object with scopes array
 * @param {Array<string>} requiredScopes - Array of scope strings to check
 * @returns {boolean} - True if user has at least one required scope
 */
export const hasScope = (user, requiredScopes = []) => {
  const userScopes = user?.scopes || [];

  // Super admin has access to everything
  if (userScopes.includes(SCOPES.TENANT_SUPER_ADMIN)) {
    return true;
  }

  // No required scopes means public access
  if (!requiredScopes || requiredScopes.length === 0) {
    return true;
  }

  // Check if user has any of the required scopes
  return requiredScopes.some((scope) => userScopes.includes(scope));
};

/**
 * Check if user has ALL of the required scopes
 *
 * @param {Object} user - User object with scopes array
 * @param {Array<string>} requiredScopes - Array of scope strings to check
 * @returns {boolean} - True if user has all required scopes
 */
export const hasAllScopes = (user, requiredScopes = []) => {
  const userScopes = user?.scopes || [];

  // Super admin has access to everything
  if (userScopes.includes(SCOPES.TENANT_SUPER_ADMIN)) {
    return true;
  }

  // No required scopes means public access
  if (!requiredScopes || requiredScopes.length === 0) {
    return true;
  }

  // Check if user has all required scopes
  return requiredScopes.every((scope) => userScopes.includes(scope));
};

/**
 * Check if user is a super admin
 *
 * @param {Object} user - User object with scopes array
 * @returns {boolean} - True if user is super admin
 */
export const isSuperAdmin = (user) => {
  const userScopes = user?.scopes || [];
  return userScopes.includes(SCOPES.TENANT_SUPER_ADMIN);
};

/**
 * Check if user is a tenant admin
 *
 * @param {Object} user - User object with scopes array
 * @returns {boolean} - True if user is tenant admin or super admin
 */
export const isTenantAdmin = (user) => {
  const userScopes = user?.scopes || [];
  return (
    userScopes.includes(SCOPES.TENANT_ADMIN) ||
    userScopes.includes(SCOPES.TENANT_SUPER_ADMIN)
  );
};

/**
 * Check whether the user is blocked by the first-time tenancy setup gate.
 *
 * Mirrors requireTenantSetup on the backend exactly, so what the UI hides always
 * matches what the API refuses:
 *  - only a provisioned user can be gated (guests have no tenant to set up);
 *  - only an EXPLICIT `setupCompleted === false` gates. A token minted before
 *    this feature shipped carries no such claim and must keep working, or every
 *    live session would be locked out the moment this deploys;
 *  - super admins are exempt — they need cross-tenant access (including the
 *    setup tracker in the admin panel) whatever their own tenant's state.
 *
 * @param {Object} user - Decoded JWT payload.
 * @returns {boolean} - True when the user must finish the setup wizard first.
 */
export const isSetupPending = (user) =>
  !!user?.tid &&
  user.onboardingStatus === 'APPROVED' &&
  user.setupCompleted === false &&
  !isSuperAdmin(user);

/**
 * Whether the first-time setup wizard should still be offered to this user.
 * Once a tenant is set up the entry point disappears for good — a completed or
 * claimless token both resolve to false.
 *
 * @param {Object} user - Decoded JWT payload.
 * @returns {boolean}
 */
export const canRunSetupWizard = (user) =>
  user?.setupCompleted === false && isTenantAdmin(user);

/**
 * Get user's display scopes (excluding system scopes)
 * Useful for showing user-friendly scope names
 *
 * @param {Object} user - User object with scopes array
 * @returns {Array<string>} - Array of displayable scopes
 */
export const getDisplayScopes = (user) => {
  return user?.scopes || [];
};

// Returns true if the user can READ the given module category.
// Unknown categories (no scope mapping) default to allowed.
export const hasCategoryAccess = (user, categoryValue) => {
  const scope = CATEGORY_READ_SCOPE[categoryValue];
  if (!scope) return true;
  return hasScope(user, [scope]);
};

export default {
  hasScope,
  hasAllScopes,
  isSuperAdmin,
  isTenantAdmin,
  isSetupPending,
  canRunSetupWizard,
  getDisplayScopes,
  hasCategoryAccess,
  CATEGORY_READ_SCOPE,
  CATEGORY_WRITE_SCOPE,
};
