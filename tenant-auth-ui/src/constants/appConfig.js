// Centralized application configuration constants
// All magic numbers and configurable values go here

export const APP_CONFIG = {
  // Application Info
  APP_NAME: 'TenantPortal',
  APP_LOGO: '🏢',

  // Session & Authentication
  COOKIE_NAME: 'app_token',
  COOKIE_EXPIRY_HOURS: 1,
  SESSION_TIMEOUT_MS: 3600000, // 1 hour in milliseconds

  // Toast Notifications
  TOAST: {
    DEFAULT_DURATION_MS: 3000,
    ERROR_DURATION_MS: 5000,
    SUCCESS_DURATION_MS: 3000,
    POSITION: 'bottom-right',
    ERROR_POSITION: 'top-center',
    THEME: 'colored',
  },

  // UI Configuration
  UI: {
    TRUNCATE_ID_LENGTH: 8, // For displaying shortened tenant IDs
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
  },

  // Retry & Timeout Settings (for future API calls)
  API: {
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
    REQUEST_TIMEOUT_MS: 30000,
  },

  // Pagination Defaults (for future list pages)
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },

  // Date/Time Formats (for future use)
  DATE_FORMAT: {
    DISPLAY: 'MMM DD, YYYY',
    DISPLAY_WITH_TIME: 'MMM DD, YYYY HH:mm',
    API: 'YYYY-MM-DD',
  },
};

export default APP_CONFIG;
