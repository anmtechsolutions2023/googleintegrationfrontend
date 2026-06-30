import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminUsers from '../AdminUsers';
import * as adminService from '../../../services/adminService';

jest.mock('../../../services/adminService', () => ({
  getAdminUsers: jest.fn(),
  getRoles: jest.fn(),
  getUserRoles: jest.fn(),
  updateUserRoles: jest.fn(),
  updateUserStatus: jest.fn(),
  deleteUser: jest.fn(),
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const ACTIVE_USER = {
  user_email: 'bob@test.com',
  status: 'ACTIVE',
  is_active: 1,
  roles: 'EDITOR',
  is_admin: 0,
  is_super_admin: 0,
};

const SUSPENDED_USER = {
  user_email: 'carol@test.com',
  status: 'SUSPENDED',
  is_active: 0,
  roles: 'VIEWER',
  is_admin: 0,
  is_super_admin: 0,
};

const MOCK_ROLES = [
  { id: 'r1', name: 'EDITOR', description: 'Can edit', is_active: 1 },
  { id: 'r2', name: 'VIEWER', description: 'Read-only', is_active: 1 },
];

beforeEach(() => {
  adminService.getAdminUsers.mockResolvedValue({
    data: { data: [ACTIVE_USER, SUSPENDED_USER] },
  });
  adminService.getRoles.mockResolvedValue({ data: { data: MOCK_ROLES } });
  adminService.getUserRoles.mockResolvedValue({
    data: { data: [{ role_id: 'r1' }] },
  });
  adminService.updateUserStatus.mockResolvedValue({ data: {} });
  adminService.updateUserRoles.mockResolvedValue({ data: {} });
  adminService.deleteUser.mockResolvedValue({ data: {} });
});

afterEach(() => jest.clearAllMocks());

test('renders user list with emails and statuses', async () => {
  render(<AdminUsers />);
  await waitFor(() => expect(screen.getByText('bob@test.com')).toBeInTheDocument());
  expect(screen.getByText('carol@test.com')).toBeInTheDocument();
  expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  expect(screen.getByText('SUSPENDED')).toBeInTheDocument();
});

test('active user shows Suspend button; suspended user shows Activate', async () => {
  render(<AdminUsers />);
  await waitFor(() => screen.getByText('bob@test.com'));
  expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument();
});

test('suspend calls updateUserStatus(email, "SUSPENDED") — no isActive arg', async () => {
  render(<AdminUsers />);
  await waitFor(() => screen.getByText('bob@test.com'));

  fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await waitFor(() =>
    expect(adminService.updateUserStatus).toHaveBeenCalledWith('bob@test.com', 'SUSPENDED')
  );
  // Must be exactly 2 arguments — no extra isActive param
  expect(adminService.updateUserStatus.mock.calls[0]).toHaveLength(2);
});

test('activate calls updateUserStatus(email, "ACTIVE")', async () => {
  render(<AdminUsers />);
  await waitFor(() => screen.getByText('carol@test.com'));

  fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await waitFor(() =>
    expect(adminService.updateUserStatus).toHaveBeenCalledWith('carol@test.com', 'ACTIVE')
  );
});

test('edit roles modal loads and shows role checkboxes', async () => {
  render(<AdminUsers />);
  await waitFor(() => screen.getByText('bob@test.com'));

  fireEvent.click(screen.getAllByRole('button', { name: 'Roles' })[0]);

  await waitFor(() => expect(screen.getByText('Edit Roles')).toBeInTheDocument());
  expect(adminService.getUserRoles).toHaveBeenCalledWith('bob@test.com');

  // Wait for role checkboxes to appear; EDITOR/VIEWER appear in table too, so check by checkbox count
  await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(2));
  // Confirm role names are rendered inside the modal (checkboxes confirm the modal is showing roles)
  const checkboxes = screen.getAllByRole('checkbox');
  expect(checkboxes).toHaveLength(2); // EDITOR + VIEWER
});

test('save roles calls updateUserRoles with selected ids', async () => {
  render(<AdminUsers />);
  await waitFor(() => screen.getByText('bob@test.com'));

  fireEvent.click(screen.getAllByRole('button', { name: 'Roles' })[0]);
  await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(2));

  // EDITOR is pre-selected (r1 from getUserRoles mock); toggle VIEWER checkbox on
  const checkboxes = screen.getAllByRole('checkbox');
  // checkboxes[0] = EDITOR (checked), checkboxes[1] = VIEWER (unchecked)
  fireEvent.click(checkboxes[1]); // select VIEWER

  fireEvent.click(screen.getByRole('button', { name: 'Save Roles' }));

  await waitFor(() =>
    expect(adminService.updateUserRoles).toHaveBeenCalledWith('bob@test.com', ['r1', 'r2'])
  );
});

test('delete opens confirmation and calls deleteUser on confirm', async () => {
  render(<AdminUsers />);
  await waitFor(() => screen.getByText('bob@test.com'));

  fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
  expect(screen.getByRole('heading', { name: 'Confirm' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await waitFor(() =>
    expect(adminService.deleteUser).toHaveBeenCalledWith('bob@test.com')
  );
});

test('search filter narrows user list', async () => {
  render(<AdminUsers />);
  await waitFor(() => screen.getByText('bob@test.com'));

  fireEvent.change(
    screen.getByPlaceholderText('Search by email or role…'),
    { target: { value: 'carol' } }
  );

  expect(screen.queryByText('bob@test.com')).not.toBeInTheDocument();
  expect(screen.getByText('carol@test.com')).toBeInTheDocument();
});

test('shows empty state when no users are returned', async () => {
  adminService.getAdminUsers.mockResolvedValue({ data: { data: [] } });
  adminService.getRoles.mockResolvedValue({ data: { data: [] } });

  render(<AdminUsers />);
  await waitFor(() =>
    expect(screen.getByText('No users found in this tenant.')).toBeInTheDocument()
  );
});
