import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
import { useAuth } from './context/AuthContext';

// ── Core dependency mocks ────────────────────────────────────────────────────
jest.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: jest.fn(),
}));

jest.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }) => <>{children}</>,
  useGoogleLogin: jest.fn(() => jest.fn()),
}));

jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
  ToastContainer: () => null,
}));

// ── Page / layout component stubs ────────────────────────────────────────────
jest.mock('./pages/Login', () => () => <div>Login Page</div>);
jest.mock('./pages/Dashboard', () => () => <div>Dashboard Page</div>);
jest.mock('./pages/OnboardingPage', () => () => <div>Onboarding Page</div>);
jest.mock('./pages/AdminPage', () => () => <div>Admin Page</div>);
jest.mock('./pages/ReportsPage', () => () => <div>Reports Page</div>);
jest.mock('./pages/AuditLogs', () => () => <div>Audit Logs Page</div>);
jest.mock('./pages/admin/AdminDashboard', () => () => <div>Admin Dashboard</div>);
jest.mock('./components/Navbar', () => () => <nav data-testid="navbar">Navbar</nav>);
jest.mock('./components/LoadingSpinner', () => () => <div>Loading...</div>);
jest.mock('./components/MasterData', () => ({
  MasterDataLayout: () => <div>Master Data Layout</div>,
  MasterDataIndex: () => <div>Master Data Index</div>,
  GenericCrudPage: () => <div>Generic Crud Page</div>,
}));

// Front Desk (POS) stubs — prevents axios ESM parse error via posService → api.js
jest.mock('./components/frontdesk/FrontDeskLayout', () => () => <div>Front Desk Layout</div>);
jest.mock('./pages/frontdesk/FrontDeskDashboard', () => () => <div>Front Desk Dashboard</div>);
jest.mock('./pages/frontdesk/Billing',     () => () => <div>Billing</div>);
jest.mock('./pages/frontdesk/Tables',      () => () => <div>Tables</div>);
jest.mock('./pages/frontdesk/Kitchen',     () => () => <div>Kitchen</div>);
jest.mock('./pages/frontdesk/MenuMaster',  () => () => <div>Menu Master</div>);
jest.mock('./pages/frontdesk/Floors',      () => () => <div>Floors</div>);
jest.mock('./pages/frontdesk/Expenses',    () => () => <div>Expenses</div>);
jest.mock('./pages/frontdesk/Customers',   () => () => <div>Customers</div>);
jest.mock('./pages/frontdesk/Feedback',    () => () => <div>Feedback</div>);
jest.mock('./pages/frontdesk/Tokens',        () => () => <div>Tokens</div>);
jest.mock('./pages/frontdesk/OnlineOrders',  () => () => <div>Online Orders</div>);
jest.mock('./pages/frontdesk/Tracking',      () => () => <div>Tracking</div>);
jest.mock('./pages/frontdesk/Inventory',     () => () => <div>Inventory</div>);
jest.mock('./pages/frontdesk/Reports',       () => () => <div>POS Reports</div>);
jest.mock('./pages/frontdesk/AccessControl', () => () => <div>Access Control</div>);

// ── Helpers ──────────────────────────────────────────────────────────────────
const APPROVED_USER = {
  email: 'admin@test.com',
  name: 'Admin User',
  tid: 'tenant-1',
  onboardingStatus: 'APPROVED',
  scopes: ['TENANT:ADMIN'],
  roles: ['VIEWER'],
};

const GUEST_USER = {
  email: 'guest@test.com',
  name: 'Guest User',
  tid: null,
  onboardingStatus: 'PENDING',
  scopes: ['guest:explore'],
  roles: [],
};

afterEach(() => jest.clearAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('App routing', () => {
  test('shows loading spinner while auth is resolving', () => {
    useAuth.mockReturnValue({ loading: true, user: null });
    render(<App />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('redirects unauthenticated user to login page', () => {
    useAuth.mockReturnValue({ loading: false, user: null });
    render(<App />);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  test('does not render navbar for unauthenticated user', () => {
    useAuth.mockReturnValue({ loading: false, user: null });
    render(<App />);
    expect(screen.queryByTestId('navbar')).not.toBeInTheDocument();
  });

  test('renders navbar for authenticated approved user', () => {
    useAuth.mockReturnValue({ loading: false, user: APPROVED_USER });
    render(<App />);
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
  });

  // A tenancy's people are managed in one place. /admin/users and /admin/roles
  // were a second implementation over the same API and had drifted apart, so
  // they redirect rather than 404 for anybody holding a bookmark.
  describe('the retired admin screens', () => {
    const at = (path) => {
      window.history.pushState({}, '', path);
      useAuth.mockReturnValue({ loading: false, user: APPROVED_USER });
      render(<App />);
      return window.location.pathname;
    };

    test('/admin/users lands on the front-desk screen', () => {
      expect(at('/admin/users')).toBe('/frontdesk/access-control');
    });

    test('/admin/roles lands there too', () => {
      expect(at('/admin/roles')).toBe('/frontdesk/access-control');
    });

    // The platform console is what is left at /admin: onboarding, the global
    // feature catalogue, cross-tenant users. None of it is tenant-scoped, so a
    // tenant admin has no business there.
    test('/admin itself refuses a tenant admin', () => {
      at('/admin');
      // ScopeGuard renders Forbidden in place rather than navigating away.
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument();
    });

    test('a super admin still reaches it', () => {
      window.history.pushState({}, '', '/admin');
      useAuth.mockReturnValue({
        loading: false,
        user: { ...APPROVED_USER, scopes: ['TENANT:SUPER_ADMIN'] },
      });
      render(<App />);
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    });
  });

  test('guest user sees onboarding page', () => {
    // Render GuestRoute directly to test it independently of BrowserRouter redirect chains,
    // which behave differently in JSDOM when chaining multiple <Navigate> components.
    const { MemoryRouter } = require('react-router-dom');
    const { GuestRoute } = require('./components/Guards');
    useAuth.mockReturnValue({ loading: false, user: GUEST_USER });

    render(
      <MemoryRouter>
        <GuestRoute>
          <div>Onboarding Page</div>
        </GuestRoute>
      </MemoryRouter>
    );
    expect(screen.getByText('Onboarding Page')).toBeInTheDocument();
  });
});
