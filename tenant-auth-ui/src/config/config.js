// Centralized configuration values (env-overrides via REACT_APP_*)
export const API_BASE_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:3000';
export const WS_BASE_URL =
  process.env.REACT_APP_WS_URL || 'ws://localhost:3000';

export const AUTH = {
  LOGIN: process.env.REACT_APP_AUTH_LOGIN || '/api/auth/google',
  LOGOUT: process.env.REACT_APP_AUTH_LOGOUT || '/api/user/logout',
  SWITCH_TENANT: process.env.REACT_APP_AUTH_SWITCH || '/api/tenants/switch',
  REFRESH: process.env.REACT_APP_AUTH_REFRESH || '/api/refresh-token',
  REDIRECT_URI:
    process.env.REACT_APP_REDIRECT_URI ||
    window.location.origin + '/auth/callback',
};

export const ENDPOINTS = {
  ADMIN_SETTINGS: process.env.REACT_APP_ENDPOINT_ADMIN || '/api/data/settings',
  REPORTS: process.env.REACT_APP_ENDPOINT_REPORTS || '/api/reports',
  AUDIT_LOGS: process.env.REACT_APP_ENDPOINT_AUDIT || '/api/audit/logs',
};

export const THIRD_PARTY = {
  SENTRY_DSN: process.env.REACT_APP_SENTRY_DSN || '',
  ANALYTICS_ID: process.env.REACT_APP_ANALYTICS_ID || '',
};

export const UI_LINKS = {
  PRIVACY: process.env.REACT_APP_PRIVACY_URL || '/privacy',
  TERMS: process.env.REACT_APP_TERMS_URL || '/terms',
  SUPPORT: process.env.REACT_APP_SUPPORT_URL || '/support',
};

export default {
  API_BASE_URL,
  WS_BASE_URL,
  AUTH,
  THIRD_PARTY,
  UI_LINKS,
};
