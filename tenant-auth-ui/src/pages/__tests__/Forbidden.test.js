import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Forbidden from '../Forbidden';
import adminService from '../../services/adminService';
import { useAuth } from '../../context/AuthContext';

// Access Denied used to be a bare "403 — you do not have the required
// permissions", naming neither what was missing nor who could grant it.

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../services/adminService', () => ({
  __esModule: true,
  default: { listAdministrators: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), info: jest.fn(), error: jest.fn() } }));

const WAITER = {
  tid: 't1', phone: '+919876500009', name: 'Ravi', onboardingStatus: 'APPROVED', setupCompleted: true,
  scopes: ['POS_ORDER:READ', 'POS_ORDER:WRITE', 'POS_KITCHEN:READ', 'POS_QR:READ'], roles: ['POS_WAITER'],
};

const renderAt = (path, requiredScopes) => render(
  <MemoryRouter initialEntries={[path]}>
    <Forbidden requiredScopes={requiredScopes} />
  </MemoryRouter>,
);

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: WAITER });
  adminService.listAdministrators.mockResolvedValue([
    { name: 'Owner', phone: '+919876543210' },
    { name: '+919876543211', phone: '+919876543211' },
  ]);
});

describe('Access Denied', () => {
  it('says an admin-only screen opens with the Admin switch, not a role', async () => {
    renderAt('/org/people', ['TENANT:ADMIN']);
    expect(screen.getByRole('heading', { name: 'Admin is for administrators' })).toBeInTheDocument();
    expect(screen.getByText(/No role opens it/)).toBeInTheDocument();
    expect(screen.getByText('Waiter')).toBeInTheDocument();
  });

  it('names the permissions that would open the screen, in words', () => {
    renderAt('/money/ledger', ['TRANSACTIONS:READ', 'TRANSACTIONS:WRITE', 'TENANT:ADMIN']);
    expect(screen.getByText('Ledger, returns & numbering — View')).toBeInTheDocument();
    expect(screen.getByText('Ledger, returns & numbering — Manage')).toBeInTheDocument();
  });

  it('lists who can give access, from this tenancy', async () => {
    renderAt('/org/people', ['TENANT:ADMIN']);
    expect(await screen.findByText(/Owner · \+91 98765 43210/)).toBeInTheDocument();
    // A name that is only the number is not shown twice.
    expect(screen.getByText('+91 98765 43211')).toBeInTheDocument();
  });

  it('copies a request an administrator can act on', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    renderAt('/org/people', ['TENANT:ADMIN']);
    fireEvent.click(screen.getByRole('button', { name: 'Copy access request' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toMatch(/\/org\/people.*Admin switch.*Ravi.*Waiter/);
  });

  it('offers the way back to where this person works', () => {
    renderAt('/org/people', ['TENANT:ADMIN']);
    expect(screen.getByRole('button', { name: 'Back to Billing & KOT' })).toBeInTheDocument();
  });

  it('does not offer the Admin switch for the platform console', () => {
    renderAt('/admin', ['TENANT:SUPER_ADMIN']);
    expect(screen.getByRole('heading', { name: 'This screen is for the platform owner' })).toBeInTheDocument();
    expect(screen.queryByText('Who can give you access')).toBeNull();
  });
});
