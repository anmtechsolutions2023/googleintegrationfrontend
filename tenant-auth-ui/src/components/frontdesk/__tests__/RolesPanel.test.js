import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RolesPanel from '../RolesPanel';
import adminService from '../../../services/adminService';

// The grants a tenancy can hand out. Ported from the retired /admin/roles page,
// which was a second implementation over the same API.
//
// Two boundaries this file exists to hold: roles are per-tenancy but the
// FEATURES they are built from are global, so this screen never edits the
// catalogue; and SUPER_ADMIN / TENANT_ADMIN are system roles the login path
// depends on, so they are read-only here.

jest.mock('../../../services/adminService', () => ({
  __esModule: true,
  default: {
    listRoles: jest.fn(),
    listRolePermissionIds: jest.fn(),
    saveRole: jest.fn(),
    saveRolePermissions: jest.fn(),
    deleteRole: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const role = (over = {}) => ({
  id: 'r1', name: 'POS_CASHIER', description: 'Takes payments',
  is_system_role: 0, is_active: 1, permission_count: 4, user_count: 2, ...over,
});

const FEATURES = [
  { feature_id: 'f1', feature_short_name: 'POS_ORDER', scope: 'READ', display_name: 'Orders Read', category: 'POS' },
  { feature_id: 'f2', feature_short_name: 'POS_ORDER', scope: 'WRITE', display_name: 'Orders Write', category: 'POS' },
  { feature_id: 'f3', feature_short_name: 'REPORTS', scope: 'READ', display_name: 'Reports Read', category: 'Analytics' },
];

beforeEach(() => {
  jest.clearAllMocks();
  adminService.listRoles.mockResolvedValue([role()]);
  adminService.listRolePermissionIds.mockResolvedValue(['f1']);
  adminService.saveRole.mockResolvedValue({});
  adminService.saveRolePermissions.mockResolvedValue({});
  adminService.deleteRole.mockResolvedValue({});
});

const renderPanel = async (props = {}) => {
  render(<RolesPanel features={FEATURES} canWrite {...props} />);
  await waitFor(() => expect(adminService.listRoles).toHaveBeenCalled());
};

describe('the roles list', () => {
  it('shows what each role grants and who holds it', async () => {
    await renderPanel();
    expect(await screen.findByText('POS_CASHIER')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();   // grants
    expect(screen.getByText('2')).toBeInTheDocument();   // people
  });

  it('says so when the tenancy has no roles at all', async () => {
    adminService.listRoles.mockResolvedValue([]);
    await renderPanel();
    expect(await screen.findByText(/No roles in this tenancy yet/i)).toBeInTheDocument();
  });

  it('filters by name and description', async () => {
    adminService.listRoles.mockResolvedValue([role(), role({ id: 'r2', name: 'POS_MANAGER' })]);
    await renderPanel();
    fireEvent.change(await screen.findByLabelText(/Search roles/i), { target: { value: 'manager' } });
    expect(screen.getByText('POS_MANAGER')).toBeInTheDocument();
    expect(screen.queryByText('POS_CASHIER')).not.toBeInTheDocument();
  });
});

describe('creating and editing a role', () => {
  it('creates one from a name and description', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /New role/i }));
    fireEvent.change(screen.getByLabelText(/Role name/i), { target: { value: 'POS_HOST' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Seats guests' } });
    fireEvent.click(screen.getByRole('button', { name: /Create role/i }));

    await waitFor(() => expect(adminService.saveRole)
      .toHaveBeenCalledWith(null, { name: 'POS_HOST', description: 'Seats guests' }));
  });

  it('refuses to create a nameless role', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /New role/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create role/i }));
    expect(adminService.saveRole).not.toHaveBeenCalled();
  });

  it('edits an existing one, carrying its active flag', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.change(screen.getByLabelText(/Role name/i), { target: { value: 'POS_TILL' } });
    fireEvent.click(screen.getByRole('button', { name: /Save role/i }));

    await waitFor(() => expect(adminService.saveRole).toHaveBeenCalledWith('r1', {
      name: 'POS_TILL', description: 'Takes payments', is_active: true,
    }));
  });

  it('reloads the shared catalogue so other tabs cannot offer a stale role', async () => {
    const onRolesChanged = jest.fn();
    await renderPanel({ onRolesChanged });
    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save role/i }));
    await waitFor(() => expect(onRolesChanged).toHaveBeenCalled());
  });
});

describe('what a role grants', () => {
  it('ticks the features it already has', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Permissions/i }));
    await waitFor(() => expect(adminService.listRolePermissionIds).toHaveBeenCalledWith('r1'));
    expect(await screen.findByRole('checkbox', { name: /Orders Read/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Reports Read/i })).not.toBeChecked();
  });

  it('saves the full set of feature ids', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Permissions/i }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Orders Write/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save permissions/i }));

    await waitFor(() => expect(adminService.saveRolePermissions)
      .toHaveBeenCalledWith('r1', ['f1', 'f2']));
  });

  it('narrows the catalogue by category', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Permissions/i }));
    await screen.findByRole('checkbox', { name: /Orders Read/i });

    fireEvent.change(screen.getByLabelText(/Filter by category/i), { target: { value: 'Analytics' } });
    expect(screen.getByRole('checkbox', { name: /Reports Read/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Orders Read/i })).not.toBeInTheDocument();
  });

  // Scopes are frozen into the JWT at login, which is the single most common
  // "I granted it and nothing happened" report.
  it('says the change lands at next sign-in', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Permissions/i }));
    expect(await screen.findByText(/next time they sign in/i)).toBeInTheDocument();
  });
});

describe('system roles', () => {
  const systemRole = role({ id: 'r0', name: 'TENANT_ADMIN', is_system_role: 1 });

  beforeEach(() => adminService.listRoles.mockResolvedValue([systemRole]));

  it('cannot be edited or deleted — the login path depends on them', async () => {
    await renderPanel();
    await screen.findByText('TENANT_ADMIN');
    expect(screen.queryByRole('button', { name: /^Edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument();
    expect(screen.getByText('system')).toBeInTheDocument();
  });

  it('can still be inspected, read-only', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /View permissions/i }));
    expect(await screen.findByText(/what it grants is fixed/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Orders Read/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save permissions/i })).toBeDisabled();
  });
});

describe('deleting a role', () => {
  it('explains the consequence before doing it', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Delete/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/next sign in/i)).toBeInTheDocument();
    expect(adminService.deleteRole).not.toHaveBeenCalled();
  });

  it('deletes only on confirmation', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Delete/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Delete role/i }));
    await waitFor(() => expect(adminService.deleteRole).toHaveBeenCalledWith('r1'));
  });

  it('backs out cleanly', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Delete/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Keep it/i }));
    expect(adminService.deleteRole).not.toHaveBeenCalled();
  });
});

describe('read-only access', () => {
  it('shows the roles but offers no way to change them', async () => {
    await renderPanel({ canWrite: false });
    expect(await screen.findByText('POS_CASHIER')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New role/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument();
  });
});
