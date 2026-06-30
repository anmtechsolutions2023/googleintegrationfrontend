import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminRoles from '../AdminRoles';
import * as adminService from '../../../services/adminService';

jest.mock('../../../services/adminService', () => ({
  getRoles: jest.fn(),
  createRole: jest.fn(),
  updateRole: jest.fn(),
  deleteRole: jest.fn(),
  getRolePermissions: jest.fn(),
  getFeatures: jest.fn(),
  updateRolePermissions: jest.fn(),
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const EDITOR_ROLE = {
  id: 'r1',
  name: 'EDITOR',
  description: 'Can edit records',
  is_active: 1,
  is_system_role: 0,
  permission_count: 5,
  user_count: 2,
};

const SYSTEM_ROLE = {
  id: 'r2',
  name: 'SUPER_ADMIN',
  description: 'System administrator',
  is_active: 1,
  is_system_role: 1,
  permission_count: 12,
  user_count: 1,
};

const MOCK_FEATURES = [
  { feature_id: 'f1', feature_short_name: 'MASTER_DATA', scope: 'READ', display_name: 'Master Data — View', category: 'Master Data', is_active: 1 },
  { feature_id: 'f2', feature_short_name: 'INVENTORY', scope: 'WRITE', display_name: 'Inventory — Manage', category: 'Inventory', is_active: 1 },
];

beforeEach(() => {
  adminService.getRoles.mockResolvedValue({ data: { data: [EDITOR_ROLE, SYSTEM_ROLE] } });
  adminService.createRole.mockResolvedValue({ data: {} });
  adminService.updateRole.mockResolvedValue({ data: {} });
  adminService.deleteRole.mockResolvedValue({ data: {} });
  adminService.getRolePermissions.mockResolvedValue({ data: { data: [] } });
  adminService.getFeatures.mockResolvedValue({ data: { data: MOCK_FEATURES } });
  adminService.updateRolePermissions.mockResolvedValue({ data: {} });
});

afterEach(() => jest.clearAllMocks());

test('renders roles list with names and permission counts', async () => {
  render(<AdminRoles />);
  await waitFor(() => expect(screen.getByText('EDITOR')).toBeInTheDocument());
  expect(screen.getByText('SUPER_ADMIN')).toBeInTheDocument();
  expect(screen.getAllByText('5')[0]).toBeInTheDocument();
});

test('system roles do not have Edit or Delete buttons', async () => {
  render(<AdminRoles />);
  await waitFor(() => screen.getByText('SUPER_ADMIN'));

  // Only EDITOR (non-system) should have Edit and Delete
  expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
});

test('system role shows System badge', async () => {
  render(<AdminRoles />);
  await waitFor(() => screen.getByText('SUPER_ADMIN'));
  expect(screen.getByText('System')).toBeInTheDocument();
});

test('opens create role modal on clicking + New Role', async () => {
  render(<AdminRoles />);
  await waitFor(() => screen.getByText('EDITOR'));

  fireEvent.click(screen.getByRole('button', { name: '+ New Role' }));
  // "Create Role" appears as heading AND as button — check by heading role
  expect(screen.getByRole('heading', { name: 'Create Role' })).toBeInTheDocument();
});

test('create role submits name and description', async () => {
  render(<AdminRoles />);
  await waitFor(() => screen.getByText('EDITOR'));

  fireEvent.click(screen.getByRole('button', { name: '+ New Role' }));

  // getAllByRole('textbox') returns: [0]=search-input, [1]=role-name, [2]=description-textarea
  const nameInputs = screen.getAllByRole('textbox');
  fireEvent.change(nameInputs[1], { target: { value: 'ACCOUNTS_MANAGER' } });
  fireEvent.change(nameInputs[2], { target: { value: 'Manages accounts payable' } });

  fireEvent.click(screen.getByRole('button', { name: 'Create Role' }));

  await waitFor(() =>
    expect(adminService.createRole).toHaveBeenCalledWith(
      'ACCOUNTS_MANAGER',
      'Manages accounts payable'
    )
  );
});

test('create role is blocked when name is empty', async () => {
  const { toast } = require('react-toastify');
  render(<AdminRoles />);
  await waitFor(() => screen.getByText('EDITOR'));

  fireEvent.click(screen.getByRole('button', { name: '+ New Role' }));
  // Submit without filling name
  fireEvent.click(screen.getByRole('button', { name: 'Create Role' }));

  expect(adminService.createRole).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith('Role name is required.');
});

test('opens permissions modal for any role', async () => {
  render(<AdminRoles />);
  await waitFor(() => screen.getByText('EDITOR'));

  fireEvent.click(screen.getAllByRole('button', { name: 'Permissions' })[0]);

  await waitFor(() =>
    expect(screen.getByText(/Edit Permissions/i)).toBeInTheDocument()
  );
  expect(adminService.getRolePermissions).toHaveBeenCalledWith('r1');
  expect(adminService.getFeatures).toHaveBeenCalled();
});

test('permissions modal shows feature checkboxes', async () => {
  render(<AdminRoles />);
  await waitFor(() => screen.getByText('EDITOR'));

  fireEvent.click(screen.getAllByRole('button', { name: 'Permissions' })[0]);

  await waitFor(() => screen.getByText('Master Data — View'));
  expect(screen.getByText('Inventory — Manage')).toBeInTheDocument();
});

test('save permissions calls updateRolePermissions with selected featureIds', async () => {
  render(<AdminRoles />);
  await waitFor(() => screen.getByText('EDITOR'));

  fireEvent.click(screen.getAllByRole('button', { name: 'Permissions' })[0]);
  await waitFor(() => screen.getByText('Master Data — View'));

  // Select the first feature
  fireEvent.click(screen.getByText('Master Data — View'));

  fireEvent.click(screen.getByRole('button', { name: 'Save Permissions' }));

  await waitFor(() =>
    expect(adminService.updateRolePermissions).toHaveBeenCalledWith('r1', ['f1'])
  );
});

test('delete shows confirm dialog and calls deleteRole on confirm', async () => {
  render(<AdminRoles />);
  await waitFor(() => screen.getByText('EDITOR'));

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.getByText(/Delete role "EDITOR"/i)).toBeInTheDocument();

  // Two Delete buttons now (table + modal confirm), click the confirm one
  const allDeleteBtns = screen.getAllByRole('button', { name: 'Delete' });
  fireEvent.click(allDeleteBtns[allDeleteBtns.length - 1]);

  await waitFor(() =>
    expect(adminService.deleteRole).toHaveBeenCalledWith('r1')
  );
});

test('shows empty state when no roles exist', async () => {
  adminService.getRoles.mockResolvedValue({ data: { data: [] } });
  render(<AdminRoles />);
  await waitFor(() =>
    expect(screen.getByText('No roles defined yet.')).toBeInTheDocument()
  );
});
