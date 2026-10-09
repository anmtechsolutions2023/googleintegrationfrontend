// Centralized configuration values (env-overrides via REACT_APP_*)
// All external URLs and API endpoints are defined here for easy management

// Base URLs
export const API_BASE_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:3000';
export const WS_BASE_URL =
  process.env.REACT_APP_WS_URL || 'ws://localhost:3000';

// Authentication Endpoints
export const AUTH = {
  // Two steps, because asking for a code and spending it fail for completely
  // different reasons — and only the first one costs money.
  OTP_REQUEST: process.env.REACT_APP_AUTH_OTP_REQUEST || '/api/auth/otp/request',
  OTP_VERIFY: process.env.REACT_APP_AUTH_OTP_VERIFY || '/api/auth/otp/verify',
  LOGOUT: process.env.REACT_APP_AUTH_LOGOUT || '/api/user/logout',
  SWITCH_TENANT: process.env.REACT_APP_AUTH_SWITCH || '/api/tenants/switch',
  REFRESH: process.env.REACT_APP_AUTH_REFRESH || '/api/refresh-token',
  REDIRECT_URI:
    process.env.REACT_APP_REDIRECT_URI ||
    window.location.origin + '/auth/callback',
};

// QR table ordering. The QR printed on a table encodes
// `${PUBLIC_DINE_ORIGIN}/t/<token>`, so it must be the address guests' phones
// can reach — set REACT_APP_PUBLIC_DINE_ORIGIN when the staff app is served
// from an internal host.
export const PUBLIC_DINE_ORIGIN =
  process.env.REACT_APP_PUBLIC_DINE_ORIGIN || window.location.origin;

export const DINE = {
  resolve: (token) => `/api/dine/${token}`,
  logo: (token) => `/api/dine/${token}/logo`,
  // A dish photo, as an absolute URL for an <img>: the guest app does not go
  // through axios for images. `v` is the item's photoVersion (cache key).
  photo: (token, itemId, version, size = 'thumb') =>
    `${API_BASE_URL}/api/dine/${token}/photo/${encodeURIComponent(itemId)}?size=${size}&v=${version}`,
  otpRequest: (token) => `/api/dine/${token}/otp/request`,
  otpVerify: (token) => `/api/dine/${token}/otp/verify`,
  SESSION: '/api/dine/session',
  ME: '/api/dine/me',
  MENU: '/api/dine/menu',
  QUOTE: '/api/dine/orders/quote',
  ORDERS: '/api/dine/orders',
};

export const QR = {
  CODES: '/api/pos/qr/codes',
  rotate: (tableId) => `/api/pos/qr/codes/${tableId}/rotate`,
  SETTINGS: '/api/pos/qr/settings',
  LIMITS: '/api/pos/qr/limits',
  PENDING: '/api/pos/qr/orders/pending',
  REJECTION_REASONS: '/api/pos/qr/rejection-reasons',
  accept: (orderId) => `/api/pos/qr/orders/${orderId}/accept`,
  reject: (orderId) => `/api/pos/qr/orders/${orderId}/reject`,
};

// API Endpoints - organized by domain/feature for scalability
export const ENDPOINTS = {
  // Onboarding endpoints (guest token)
  ONBOARDING: {
    STATUS: '/api/onboarding/status',
    NOTE: '/api/onboarding/note',
  },

  // Admin endpoints
  ADMIN: {
    SETTINGS: process.env.REACT_APP_ENDPOINT_ADMIN || '/api/data/settings',
    USERS: '/api/admin/users',
    ROLES: '/api/admin/roles',
    ONBOARDING: '/api/admin/onboarding',
    FEATURES: '/api/admin/features',
    // Cross-tenant directory: every tenancy, and the people in any one of them.
    // Super-admin only — see the guards on the admin routes.
    TENANTS: '/api/admin/tenants',
    APP_CONFIG: '/api/admin/app-config',
  },

  // Reports endpoints
  REPORTS: {
    LIST: process.env.REACT_APP_ENDPOINT_REPORTS || '/api/reports',
    DETAIL: '/api/reports/:id',
    EXPORT: '/api/reports/export',
  },

  // Audit endpoints
  AUDIT: {
    LOGS: process.env.REACT_APP_ENDPOINT_AUDIT || '/api/audit/logs',
    CATEGORIES: '/api/audit/categories',
    FILTERS: '/api/audit/filters',
    DETAIL: '/api/audit/logs/:id',
  },

  // User endpoints
  USER: {
    PROFILE: '/api/user/profile',
    PREFERENCES: '/api/user/preferences',
  },

  // Tenant endpoints
  TENANT: {
    LIST: '/api/tenants',
    DETAIL: '/api/tenants/:id',
    SWITCH: '/api/tenants/switch',
  },

  // Master Data CRUD Endpoints
  // All module endpoints follow RESTful conventions: GET/POST/PUT/DELETE
  MASTER: {
    // Tax & Units
    TAX_TYPES: '/api/tax-types',
    UOM: '/api/uom',
    UOM_FACTORS: '/api/uom-factors',
    TAX_GROUPS: '/api/tax-groups',
    TAX_GROUP_MAPPERS: '/api/tax-group-mappers',

    // Categories
    CATEGORIES: '/api/categories',

    // Organization
    ORGANIZATIONS: '/api/organizations',
    BRANCH_DETAILS: '/api/branch-details',
    BRANCH_USER_GROUPS: '/api/branch-user-groups',

    // Account & Transaction Types
    ACCOUNT_TYPES: '/api/account-types',
    ACCOUNT_TYPE_BASES: '/api/account-type-bases',
    TRANSACTION_TYPES: '/api/transaction-types',
    TRANSACTION_CONFIGS: '/api/transaction-configs',
    TRANSACTION_STATUSES: '/api/transaction-statuses',

    // Conversions
    BASE_CONVERSIONS: '/api/base-conversions',
    CONVERSION_MAPPERS: '/api/conversion-mappers',

    // Transaction & Inventory
    TRANSACTION_LOGS: '/api/transaction-logs',
    TRANSACTION_ITEMS: '/api/transaction-items',
    BATCH_DETAILS: '/api/batch-details',
    ITEM_DETAILS: '/api/item-details',
    COST_INFO: '/api/cost-info',

    // Contacts & Addresses
    CONTACT_ADDRESS_TYPES: '/api/contact-address-types',
    CONTACT_DETAILS: '/api/contact-details',
    ADDRESS_DETAILS: '/api/address-details',
    LOCATION_DETAILS: '/api/location-details',
    MAP_PROVIDERS: '/api/map-providers',
    LOCATION_MAPPERS: '/api/location-mappers',

    // Payments
    PAYMENT_RECEIVED_TYPES: '/api/payment-received-types',
    PAYMENT_MODES: '/api/payment-modes',
    PAYMENT_TRANSACTIONS: '/api/payment-transactions',
    PAYMENT_DETAILS: '/api/payment-details',
    PAYMENT_BREAKUPS: '/api/payment-breakups',
  },
};

// Third-party service configurations
export const THIRD_PARTY = {
  // No Google client id: sign-in is WhatsApp one-time codes, and the OTP is
  // sent server-side. The browser holds no third-party auth credential at all.
  SENTRY_DSN: process.env.REACT_APP_SENTRY_DSN || '',
  ANALYTICS_ID: process.env.REACT_APP_ANALYTICS_ID || '',
};

// External UI Links
export const UI_LINKS = {
  PRIVACY: process.env.REACT_APP_PRIVACY_URL || '/privacy',
  TERMS: process.env.REACT_APP_TERMS_URL || '/terms',
  SUPPORT: process.env.REACT_APP_SUPPORT_URL || '/support',
  DOCS: process.env.REACT_APP_DOCS_URL || '/docs',
};

// Helper function to build endpoint with params
export const buildEndpoint = (endpoint, params = {}) => {
  let url = endpoint;
  Object.keys(params).forEach((key) => {
    url = url.replace(`:${key}`, params[key]);
  });
  return url;
};

export default {
  API_BASE_URL,
  WS_BASE_URL,
  AUTH,
  ENDPOINTS,
  THIRD_PARTY,
  UI_LINKS,
  buildEndpoint,
};
