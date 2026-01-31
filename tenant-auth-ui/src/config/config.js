// Centralized configuration values (env-overrides via REACT_APP_*)
// All external URLs and API endpoints are defined here for easy management

// Base URLs
export const API_BASE_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:3000';
export const WS_BASE_URL =
  process.env.REACT_APP_WS_URL || 'ws://localhost:3000';

// Authentication Endpoints
export const AUTH = {
  LOGIN: process.env.REACT_APP_AUTH_LOGIN || '/api/auth/google',
  LOGOUT: process.env.REACT_APP_AUTH_LOGOUT || '/api/user/logout',
  SWITCH_TENANT: process.env.REACT_APP_AUTH_SWITCH || '/api/tenants/switch',
  REFRESH: process.env.REACT_APP_AUTH_REFRESH || '/api/refresh-token',
  REDIRECT_URI:
    process.env.REACT_APP_REDIRECT_URI ||
    window.location.origin + '/auth/callback',
};

// API Endpoints - organized by domain/feature for scalability
export const ENDPOINTS = {
  // Admin endpoints
  ADMIN: {
    SETTINGS: process.env.REACT_APP_ENDPOINT_ADMIN || '/api/data/settings',
    USERS: '/api/admin/users',
    ROLES: '/api/admin/roles',
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
  GOOGLE_CLIENT_ID: process.env.REACT_APP_GOOGLE_CLIENT_ID || '',
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
