import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminAllUsers from '../AdminAllUsers';
import * as adminService from '../../../services/adminService';

jest.mock('../../../services/adminService', () => ({
  getAllAdminUsers: jest.fn(),
  updateUserStatusCrossTenant: jest.fn(),
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

// The signed-in super admin. Reassigned by the self-action tests.
let mockCurrentUser = { email: 'root@other.com' };
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockCurrentUser }),
}));

const ACTIVE_USER = {
  user_email: 'bob@test.com',
  tenant_id: 't-100',
  tenant_name: 'Acme Foods',
  status: 'ACTIVE',
  is_active: 1,
  roles: 'EDITOR',
  is_admin: 1,
  is_super_admin: 0,
};

const SUSPENDED_USER = {
  user_email: 'carol@test.com',
  tenant_id: 't-200',
  tenant_name: 'Beta Bakery',
  status: 'SUSPENDED',
  is_active: 0,
  roles: 'VIEWER',
  is_admin: 0,
  is_super_admin: 0,
};

const SUPER_USER = {
  user_email: 'root@test.com',
  tenant_id: 't-000',
  tenant_name: 'HQ',
  status: 'ACTIVE',
  is_active: 1,
  roles: 'ADMIN',
  is_admin: 1,
  is_super_admin: 1,
};

beforeEach(() => {
  mockCurrentUser = { email: 'root@other.com' };
  adminService.getAllAdminUsers.mockResolvedValue({
    data: { data: [ACTIVE_USER, SUSPENDED_USER, SUPER_USER] },
  });
  adminService.updateUserStatusCrossTenant.mockResolvedValue({ data: {} });
});

afterEach(() => jest.clearAllMocks());

test('renders users from all tenants with tenant names', async () => {
  render(<AdminAllUsers />);
  await waitFor(() => expect(screen.getByText('bob@test.com')).toBeInTheDocument());
  expect(screen.getByText('carol@test.com')).toBeInTheDocument();
  expect(screen.getByText('Acme Foods')).toBeInTheDocument();
  expect(screen.getByText('Beta Bakery')).toBeInTheDocument();
});

test('active user shows Suspend; suspended user shows Activate; super admin is protected', async () => {
  render(<AdminAllUsers />);
  await waitFor(() => screen.getByText('bob@test.com'));
  expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument();
  // The super-admin row exposes no suspend/activate action.
  expect(screen.getByText('Protected')).toBeInTheDocument();
});

test('suspend calls updateUserStatusCrossTenant(email, tenantId, "SUSPENDED")', async () => {
  render(<AdminAllUsers />);
  await waitFor(() => screen.getByText('bob@test.com'));

  fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await waitFor(() =>
    expect(adminService.updateUserStatusCrossTenant).toHaveBeenCalledWith(
      'bob@test.com',
      't-100',
      'SUSPENDED'
    )
  );
});

test('activate calls updateUserStatusCrossTenant(email, tenantId, "ACTIVE")', async () => {
  render(<AdminAllUsers />);
  await waitFor(() => screen.getByText('carol@test.com'));

  fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await waitFor(() =>
    expect(adminService.updateUserStatusCrossTenant).toHaveBeenCalledWith(
      'carol@test.com',
      't-200',
      'ACTIVE'
    )
  );
});

test('search filter narrows by tenant name', async () => {
  render(<AdminAllUsers />);
  await waitFor(() => screen.getByText('bob@test.com'));

  fireEvent.change(
    screen.getByPlaceholderText('Search by email, role, or tenant…'),
    { target: { value: 'bakery' } }
  );

  expect(screen.queryByText('bob@test.com')).not.toBeInTheDocument();
  expect(screen.getByText('carol@test.com')).toBeInTheDocument();
});

test('shows empty state when no users are returned', async () => {
  adminService.getAllAdminUsers.mockResolvedValue({ data: { data: [] } });
  render(<AdminAllUsers />);
  await waitFor(() =>
    expect(screen.getByText('No users found.')).toBeInTheDocument()
  );
});

// ── Self-action guards (mirror of the backend 403) ───────────────────────────
// A super admin can appear as an ordinary member of another tenant, so the
// existing "super admins are protected" rule does not cover every self row.
describe('self-action protection', () => {
  const SELF_ACTIVE = { ...ACTIVE_USER, user_email: 'root@other.com', is_super_admin: 0 };

  test('own active membership renders no Suspend, only a Protected marker', async () => {
    adminService.getAllAdminUsers.mockResolvedValue({ data: { data: [SELF_ACTIVE] } });

    render(<AdminAllUsers />);
    await waitFor(() => screen.getByText('root@other.com'));

    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(screen.getByText('Protected')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  test('other users keep Suspend enabled', async () => {
    render(<AdminAllUsers />);
    await waitFor(() => screen.getByText('bob@test.com'));

    expect(screen.getByRole('button', { name: 'Suspend' })).toBeEnabled();
    expect(screen.queryByText('You')).not.toBeInTheDocument();
  });

  test('matches self case-insensitively', async () => {
    mockCurrentUser = { email: 'Root@Other.com' };
    adminService.getAllAdminUsers.mockResolvedValue({ data: { data: [SELF_ACTIVE] } });

    render(<AdminAllUsers />);
    await waitFor(() => screen.getByText('root@other.com'));

    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  test('own membership can still be re-activated when suspended', async () => {
    const selfSuspended = { ...SUSPENDED_USER, user_email: 'root@other.com' };
    adminService.getAllAdminUsers.mockResolvedValue({ data: { data: [selfSuspended] } });

    render(<AdminAllUsers />);
    await waitFor(() => screen.getByText('root@other.com'));

    const activate = screen.getByRole('button', { name: 'Activate' });
    expect(activate).toBeEnabled();

    fireEvent.click(activate);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(adminService.updateUserStatusCrossTenant).toHaveBeenCalledWith(
        'root@other.com',
        't-200',
        'ACTIVE'
      )
    );
  });
});

// ── Tenancy setup tracking column ────────────────────────────────────────────
describe('tenancy setup column', () => {
  const withSetup = (rows) =>
    adminService.getAllAdminUsers.mockResolvedValue({ data: { data: rows } });

  test('renders a green Completed badge for a set-up tenant', async () => {
    withSetup([{ ...ACTIVE_USER, setup_status: 'COMPLETED' }]);
    render(<AdminAllUsers />);

    const badge = await screen.findByText('Completed');
    expect(badge).toHaveClass('badge-setup-done');
  });

  test('renders a red Incomplete badge for a tenant still to be set up', async () => {
    withSetup([{ ...ACTIVE_USER, setup_status: 'PENDING' }]);
    render(<AdminAllUsers />);

    const badge = await screen.findByText('Incomplete');
    expect(badge).toHaveClass('badge-setup-pending');
  });

  test('treats a missing setup_status as incomplete', async () => {
    // Defensive: an older API response, or a row the join could not resolve.
    withSetup([ACTIVE_USER]);
    render(<AdminAllUsers />);

    const badge = await screen.findByText('Incomplete');
    expect(badge).toHaveClass('badge-setup-pending');
  });

  test('adds the Tenancy Setup header without disturbing the existing columns', async () => {
    withSetup([{ ...ACTIVE_USER, setup_status: 'COMPLETED' }]);
    render(<AdminAllUsers />);
    await screen.findByText('bob@test.com');

    ['Email', 'Tenant', 'Tenancy Setup', 'Status', 'Roles', 'Flags', 'Actions'].forEach((h) =>
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
    );
  });

  test('search matches on setup state so pending tenants are easy to find', async () => {
    withSetup([
      { ...ACTIVE_USER, setup_status: 'COMPLETED' },
      { ...SUSPENDED_USER, setup_status: 'PENDING' },
    ]);
    render(<AdminAllUsers />);
    await screen.findByText('bob@test.com');

    fireEvent.change(screen.getByPlaceholderText(/Search by email/i), {
      target: { value: 'incomplete' },
    });

    expect(screen.getByText('carol@test.com')).toBeInTheDocument();
    expect(screen.queryByText('bob@test.com')).not.toBeInTheDocument();
  });
});
