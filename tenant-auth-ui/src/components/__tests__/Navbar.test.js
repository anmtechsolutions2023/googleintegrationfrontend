import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../Navbar';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { info: jest.fn(), error: jest.fn() } }));

// A tenant admin with the scopes behind every menu entry, so anything missing
// from the bar is missing because of the setup gate and nothing else.
const ADMIN_SCOPES = [
  'TENANT:ADMIN', 'admin:access', 'AUDIT:READ', 'reports:READ', 'POS_ORDER:READ',
];

const renderNavbar = (userOverrides = {}) => {
  useAuth.mockReturnValue({
    user: {
      tid: 'tenant-1',
      name: 'Admin',
      email: 'admin@test.com',
      onboardingStatus: 'APPROVED',
      scopes: ADMIN_SCOPES,
      ...userOverrides,
    },
    logout: jest.fn(),
    switchTenant: jest.fn(),
  });
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );
};

afterEach(() => jest.clearAllMocks());

describe('Navbar — setup wizard entry point', () => {
  test('is offered while the tenant still needs setup', () => {
    renderNavbar({ setupCompleted: false });
    expect(screen.getAllByText('Setup Wizard').length).toBeGreaterThan(0);
  });

  test('disappears once setup is complete', () => {
    renderNavbar({ setupCompleted: true });
    expect(screen.queryByText('Setup Wizard')).not.toBeInTheDocument();
  });

  test('is absent for a pre-existing token with no claim', () => {
    // Backfilled tenants are already set up — the wizard must not reappear.
    renderNavbar();
    expect(screen.queryByText('Setup Wizard')).not.toBeInTheDocument();
  });

  test('is not offered to a non-admin even mid-setup', () => {
    renderNavbar({ scopes: ['MASTER_DATA:READ'], setupCompleted: false });
    expect(screen.queryByText('Setup Wizard')).not.toBeInTheDocument();
  });
});

describe('Navbar — menu while setup is pending', () => {
  test('collapses to Home, Audit Logs and the wizard', () => {
    renderNavbar({ setupCompleted: false });

    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Audit Logs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Setup Wizard').length).toBeGreaterThan(0);

    // Everything the API would refuse anyway is hidden, so the UI never offers
    // a link that leads to a 403.
    expect(screen.queryByText('Master Data')).not.toBeInTheDocument();
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
    expect(screen.queryByText('Access')).not.toBeInTheDocument();
    expect(screen.queryByText('Front Desk')).not.toBeInTheDocument();
  });

  test('shows the Setup Required badge', () => {
    renderNavbar({ setupCompleted: false });
    expect(screen.getByText('Setup Required')).toBeInTheDocument();
  });

  test('shows the full menu once setup is complete', () => {
    renderNavbar({ setupCompleted: true });

    expect(screen.getAllByText('Master Data').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reports').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Access').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Front Desk').length).toBeGreaterThan(0);
    expect(screen.queryByText('Setup Required')).not.toBeInTheDocument();
  });

  test('super admins keep the full menu even mid-setup', () => {
    renderNavbar({ scopes: ['TENANT:SUPER_ADMIN'], setupCompleted: false });
    expect(screen.getAllByText('Access').length).toBeGreaterThan(0);
    expect(screen.queryByText('Setup Required')).not.toBeInTheDocument();
  });
});
