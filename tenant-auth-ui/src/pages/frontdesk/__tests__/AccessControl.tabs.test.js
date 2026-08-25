import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AccessControl from '../AccessControl';
import adminService from '../../../services/adminService';
import posService from '../../../services/posService';
import { useAuth } from '../../../context/AuthContext';

// Which tabs exist on Access & Staff, and for whom.
//
// Three of them are about THIS tenancy. The fourth spans every tenancy on the
// platform, which is a different authority — and the API says so: the routes
// behind it are on the super-admin guard, not the tenant-admin one. The tab and
// the guard have to agree, or the tab is an invitation to a 403.

jest.mock('../../../services/adminService', () => ({
  __esModule: true,
  default: {
    listRoles: jest.fn(), listFeatures: jest.fn(), listUsers: jest.fn(),
    listUserRoleIds: jest.fn(), listTenants: jest.fn(), listTenantUsers: jest.fn(),
    listInvitations: jest.fn(),
  },
}));
jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { getPosBranches: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const renderAs = async (scopes) => {
  useAuth.mockReturnValue({
    user: { tid: 't1', email: 'me@x.com', onboardingStatus: 'APPROVED', scopes },
  });
  render(<AccessControl />);
  await waitFor(() => expect(adminService.listRoles).toHaveBeenCalled());
};

beforeEach(() => {
  jest.clearAllMocks();
  adminService.listRoles.mockResolvedValue([]);
  adminService.listFeatures.mockResolvedValue([]);
  adminService.listUsers.mockResolvedValue([]);
  adminService.listInvitations.mockResolvedValue([]);
  adminService.listTenants.mockResolvedValue([]);
  posService.getPosBranches.mockResolvedValue([]);
});

describe('a tenant admin', () => {
  it('gets the three tabs about their own tenancy', async () => {
    await renderAs(['TENANT:ADMIN']);
    expect(screen.getByRole('button', { name: /People/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invitations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Roles/i })).toBeInTheDocument();
  });

  it('is not offered the cross-tenant one', async () => {
    await renderAs(['TENANT:ADMIN']);
    expect(screen.queryByRole('button', { name: /All Tenants/i })).not.toBeInTheDocument();
  });

  // The tab is hidden AND the API refuses them, so nothing is fetched either.
  it('never asks for the tenancy list', async () => {
    await renderAs(['TENANT:ADMIN']);
    expect(adminService.listTenants).not.toHaveBeenCalled();
  });
});

describe('a super admin', () => {
  it('gets the fourth tab', async () => {
    await renderAs(['TENANT:SUPER_ADMIN']);
    expect(screen.getByRole('button', { name: /All Tenants/i })).toBeInTheDocument();
  });

  it('still lands on their own tenancy first', async () => {
    await renderAs(['TENANT:SUPER_ADMIN']);
    // Cross-tenant sight is the exception, not the default view.
    expect(screen.getByRole('button', { name: /People/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /All Tenants/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
