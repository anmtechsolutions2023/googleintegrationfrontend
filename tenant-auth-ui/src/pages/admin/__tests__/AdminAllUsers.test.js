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
