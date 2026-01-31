import { SCOPES } from '../constants/scopes';

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
 * Get user's display scopes (excluding system scopes)
 * Useful for showing user-friendly scope names
 *
 * @param {Object} user - User object with scopes array
 * @returns {Array<string>} - Array of displayable scopes
 */
export const getDisplayScopes = (user) => {
  return user?.scopes || [];
};

export default {
  hasScope,
  hasAllScopes,
  isSuperAdmin,
  isTenantAdmin,
  getDisplayScopes,
};
