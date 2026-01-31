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

  // Admin Routes
  ADMIN: '/admin',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_USERS: '/admin/users',

  // Reports Module
  REPORTS: '/reports',
  REPORTS_DETAIL: '/reports/:id',

  // Audit Module
  AUDIT: '/audit',
  AUDIT_DETAIL: '/audit/:id',

  // Master Data Module
  MASTER: '/master',
  MASTER_MODULE: '/master/:moduleKey',
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
