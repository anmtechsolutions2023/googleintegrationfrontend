import logger from './logger';

/**
 * A JWT segment as text.
 *
 * Two things a bare atob() got wrong. The segment is base64URL (- and _, no
 * padding), which atob rejects outright whenever one of those characters
 * appears — the token then decoded to nothing and the person was signed out.
 * And atob returns one character per BYTE, so any name outside plain ASCII
 * came out mangled: "Mayini’s" read as "Mayiniâ€™s" in the menu.
 *
 * @param {string} segment
 * @returns {string} The UTF-8 text it encodes.
 */
const decodeSegment = (segment) => {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const binary = window.atob(base64);
  return decodeURIComponent(
    Array.from(binary, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
  );
};

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

    const payload = JSON.parse(decodeSegment(parts[1]));
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
    // The identity claim is `phone` since the migration. This said `email`,
    // which silently resolved to undefined on every token.
    phone: payload.phone,
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
