// Centralized route paths - easy to extend as app grows
// Group routes by feature/module for scalability

export const ROUTES = {
  // Auth Routes
  LOGIN: '/login',
  AUTH_CALLBACK: '/auth/callback',

  // Core Routes
  HOME: '/',
  DASHBOARD: '/dashboard',
  FORBIDDEN: '/forbidden',
  NOT_FOUND: '/404',

  // Onboarding (guest users)
  ONBOARDING: '/onboarding',

  // Admin Routes
  ADMIN: '/admin',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_USERS: '/admin/users',
  ADMIN_APPROVALS: '/admin/approvals',
  ADMIN_ROLES: '/admin/roles',
  ADMIN_FEATURES: '/admin/features',

  // Reports Module
  // Insights › Reports. /reports still redirects here.
  REPORTS: '/insights/reports',
  REPORTS_DETAIL: '/reports/:id',

  // Audit Module
  AUDIT: '/audit',
  AUDIT_DETAIL: '/audit/:id',

  // Master Data Module
  // Admin › Data tables (the Master Data grids). /master still redirects here.
  MASTER: '/org/data',
  MASTER_MODULE: '/org/data/:moduleKey',

  // First-time master-data setup wizard (transactional bootstrap)
  MASTER_SETUP: '/master-setup',

  // Everything the setup wizard collected, viewable and editable afterwards.
  // Lives under Front Desk rather than Master Data: Master Data is a generic CRUD
  // grid over raw tables and shows an address as a dropdown of GUIDs.
  BUSINESS_PROFILE: '/outlet/business/profile',

  // Front Desk (POS)
  FRONTDESK: '/frontdesk',
  FRONTDESK_MODULE: '/frontdesk/:tab',

  // The one place a tenancy's people, invitations and roles are managed.
  // /admin/users and /admin/roles redirect here.
  ACCESS_CONTROL: '/org/people',

  // QR table ordering. /t/:token is the PUBLIC page a guest's phone opens from
  // the code on their table — no staff login, no app chrome.
  DINE: '/t/:token',
  FRONTDESK_QR_CODES: '/outlet/floors/qr-codes',
  FRONTDESK_QR_ORDERS: '/service/floor/qr',
};

// Route groups for navigation menus
export const NAV_ROUTES = {
  MAIN: [ROUTES.DASHBOARD],
  REPORTS: [ROUTES.REPORTS],
  ADMIN: [ROUTES.ADMIN, ROUTES.ADMIN_SETTINGS, ROUTES.ADMIN_USERS],
  AUDIT: [ROUTES.AUDIT],
  MASTER: [ROUTES.MASTER],
};

// Routes that don't require authentication
export const PUBLIC_ROUTES = [
  ROUTES.LOGIN,
  ROUTES.AUTH_CALLBACK,
  ROUTES.FORBIDDEN,
  ROUTES.NOT_FOUND,
];

export default ROUTES;
