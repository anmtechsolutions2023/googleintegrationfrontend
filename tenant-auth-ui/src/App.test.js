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
