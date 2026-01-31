import logger from './logger';

/**
 * Decode a JWT token and return the payload
 *
 * @param {string} token - JWT token string
 * @returns {Object|null} - Decoded payload or null if invalid
 */
export const decodeToken = (token) => {
  if (!token) {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      logger.warn('Invalid token format: expected 3 parts');
      return null;
    }

    const payload = JSON.parse(window.atob(parts[1]));
    return payload;
  } catch (error) {
    logger.error('Failed to decode token:', error);
    return null;
  }
};

/**
 * Check if a token is expired
 *
 * @param {string} token - JWT token string
 * @param {number} bufferSeconds - Buffer time before actual expiry (default 60 seconds)
 * @returns {boolean} - True if token is expired or will expire within buffer time
 */
export const isTokenExpired = (token, bufferSeconds = 60) => {
  const payload = decodeToken(token);

  if (!payload || !payload.exp) {
    return true;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const expiryTime = payload.exp - bufferSeconds;

  return currentTime >= expiryTime;
};

/**
 * Get the expiry time of a token
 *
 * @param {string} token - JWT token string
 * @returns {Date|null} - Expiry date or null if invalid
 */
export const getTokenExpiry = (token) => {
  const payload = decodeToken(token);

  if (!payload || !payload.exp) {
    return null;
  }

  return new Date(payload.exp * 1000);
};

/**
 * Get time remaining until token expires
 *
 * @param {string} token - JWT token string
 * @returns {number} - Milliseconds until expiry, or 0 if expired
 */
export const getTimeUntilExpiry = (token) => {
  const payload = decodeToken(token);

  if (!payload || !payload.exp) {
    return 0;
  }

  const expiryMs = payload.exp * 1000;
  const remaining = expiryMs - Date.now();

  return Math.max(0, remaining);
};

/**
 * Extract user info from token payload
 *
 * @param {string} token - JWT token string
 * @returns {Object|null} - User info object or null
 */
export const getUserFromToken = (token) => {
  const payload = decodeToken(token);

  if (!payload) {
    return null;
  }

  return {
    name: payload.name,
    email: payload.email,
    tid: payload.tid,
    scopes: payload.scopes || [],
    associatedTenants: payload.associatedTenants || [],
    // Add any other user properties from your JWT
  };
};

export default {
  decodeToken,
  isTokenExpired,
  getTokenExpiry,
  getTimeUntilExpiry,
  getUserFromToken,
};
