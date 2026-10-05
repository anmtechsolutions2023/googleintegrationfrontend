import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RolesPanel from '../RolesPanel';
import adminService from '../../../services/adminService';

// The grants a tenancy can hand out.
//
// What this file holds the screen to:
//   - roles are listed by the job (Cashier), grouped the way the business is,
//     and SUPER_ADMIN — which nobody can be given — is not offered to a tenancy;
//   - a role's permissions are laid out by the rail, and ticking Manage brings
//     View with it, saying why;
//   - system roles are read-only;
//   - a role somebody holds cannot be deleted, and the dialog says who holds it
//     before anything is pressed;
//   - compare, matrix and preview are all built from the same grants.

jest.mock('../../../services/adminService', () => ({
  __esModule: true,
  default: {
    listRoles: jest.fn(),
    listRolePermissionMatrix: jest.fn(),
    saveRole: jest.fn(),
    saveRolePermissions: jest.fn(),
    deleteRole: jest.fn(),
    listUsers: jest.fn(),
    listInvitations: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const role = (over = {}) => ({
  id: 'r-cashier', name: 'POS_CASHIER', description: 'Front-desk cashier: take orders, settle bills.',
  is_system_role: 0, is_active: 1, permission_count: 2, user_count: 0, ...over,
});
const WAITER = role({ id: 'r-waiter', name: 'POS_WAITER', description: 'Waiter.', permission_count: 1, user_count: 1 });
const TENANT_ADMIN = role({ id: 'r-admin', name: 'TENANT_ADMIN', is_system_role: 1, permission_count: 4 });
const SUPER_ADMIN = role({ id: 'r-super', name: 'SUPER_ADMIN', is_system_role: 1, permission_count: 4 });

const F = (id, subject, scope) => ({ feature_id: id, feature_short_name: subject, scope, is_active: 1 });
const FEATURES = [
  F('f-or', 'POS_ORDER', 'READ'), F('f-ow', 'POS_ORDER', 'WRITE'),
  F('f-br', 'POS_BILLING', 'READ'), F('f-bw', 'POS_BILLING', 'WRITE'),
];
const GRANTS = [
  { role_id: 'r-cashier', feature_id: 'f-or' }, { role_id: 'r-cashier', feature_id: 'f-ow' },
  { role_id: 'r-waiter', feature_id: 'f-or' },
  ...FEATURES.map((f) => ({ role_id: 'r-admin', feature_id: f.feature_id })),
];

beforeEach(() => {
  jest.clearAllMocks();
  adminService.listRoles.mockResolvedValue([SUPER_ADMIN, TENANT_ADMIN, role(), WAITER]);
  adminService.listRolePermissionMatrix.mockResolvedValue(GRANTS);
  adminService.saveRole.mockResolvedValue({ id: 'r-new' });
  adminService.saveRolePermissions.mockResolvedValue({ added: [], removed: [], implied: [] });
  adminService.deleteRole.mockResolvedValue({});
  adminService.listUsers.mockResolvedValue([]);
  adminService.listInvitations.mockResolvedValue([]);
});

const renderPanel = async (props = {}) => {
  render(<RolesPanel features={FEATURES} canWrite {...props} />);
  await screen.findByRole('tablist', { name: 'Roles views' });
};

const box = (name) => screen.getByRole('checkbox', { name });

describe('the role list', () => {
  it('names roles by the job, with the code beside it, grouped by area', async () => {
    await renderPanel();
    const cashier = screen.getByRole('button', { name: /Cashier POS_CASHIER/ });
    expect(cashier).toBeInTheDocument();
    expect(screen.getByText('Front desk')).toBeInTheDocument();
    expect(screen.getByText('Administration')).toBeInTheDocument();
  });

  it('does not offer SUPER_ADMIN to a tenancy — nobody can be given it', async () => {
    await renderPanel();
    expect(screen.queryByText('SUPER_ADMIN')).toBeNull();
  });

  it('still shows SUPER_ADMIN to a platform super admin', async () => {
    await renderPanel({ viewerIsSuper: true });
    expect(screen.getAllByText(/SUPER_ADMIN/).length).toBeGreaterThan(0);
  });

  it('explains that admin access is the Admin switch, not a role', async () => {
    await renderPanel();
    expect(screen.getByText(/Admin access is not a role/)).toBeInTheDocument();
  });

  it('filters by name and description', async () => {
    await renderPanel();
    fireEvent.change(screen.getByLabelText('Search roles'), { target: { value: 'waiter' } });
    expect(screen.getByRole('button', { name: /Waiter POS_WAITER/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cashier POS_CASHIER/ })).toBeNull();
  });
});

describe('the editor', () => {
  it('opens the first editable role, with its permissions ticked', async () => {
    await renderPanel();
    expect(screen.getByRole('heading', { name: /Cashier/ })).toBeInTheDocument();
    expect(box('Orders & KOTs — View')).toBeChecked();
    expect(box('Orders & KOTs — Manage')).toBeChecked();
    expect(box('Bills & settlement — Manage')).not.toBeChecked();
  });

  it('groups permissions under the rail', async () => {
    await renderPanel();
    expect(screen.getByText('Billing & KOT')).toBeInTheDocument();
  });

  it('ticks View when Manage is ticked, and says why', async () => {
    await renderPanel();
    fireEvent.click(box('Bills & settlement — Manage'));
    expect(box('Bills & settlement — View')).toBeChecked();
    expect(box('Bills & settlement — View')).toBeDisabled();
    expect(screen.getAllByText(/needed by Manage/).length).toBeGreaterThan(0);
  });

  it('saves the full set, requirements included', async () => {
    await renderPanel();
    fireEvent.click(box('Bills & settlement — Manage'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(adminService.saveRolePermissions).toHaveBeenCalled());
    const [id, ids] = adminService.saveRolePermissions.mock.calls[0];
    expect(id).toBe('r-cashier');
    expect([...ids].sort()).toEqual(['f-br', 'f-bw', 'f-or', 'f-ow']);
  });

  it('offers Save only once something changed', async () => {
    await renderPanel();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('says changes apply without anybody signing out', async () => {
    await renderPanel();
    expect(screen.getByText(/Nobody has to sign out/)).toBeInTheDocument();
  });

  it('shows a system role read-only, and says TENANT_ADMIN is not the Admin switch', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Restaurant administrator TENANT_ADMIN/ }));
    expect(box('Orders & KOTs — Manage')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByText(/does not open People & Access/)).toBeInTheDocument();
  });

  it('offers no way to change anything without write access', async () => {
    await renderPanel({ canWrite: false });
    expect(box('Orders & KOTs — Manage')).toBeDisabled();
    expect(screen.queryByRole('button', { name: '+ New role' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });
});

describe('creating and editing a role', () => {
  it('creates one from a name and description', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '+ New role' }));
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Barista' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(adminService.saveRole).toHaveBeenCalledWith(null, { name: 'Barista', description: '' }));
  });

  it('refuses to create a nameless role', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '+ New role' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    expect(adminService.saveRole).not.toHaveBeenCalled();
  });

  it('edits an existing one, carrying its active flag, and says what inactive means', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.getByText(/An inactive role grants nothing/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save role' }));
    await waitFor(() => expect(adminService.saveRole).toHaveBeenCalledWith('r-cashier', expect.objectContaining({ is_active: true })));
  });
});

describe('deleting a role', () => {
  it('names the people who hold it and refuses until they are taken off', async () => {
    adminService.listUsers.mockResolvedValue([
      { user_phone: '+919876543211', full_name: 'User211', roles: 'POS_CASHIER, POS_KITCHEN_STAFF', is_admin: 1 },
    ]);
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete Cashier/ });
    expect(await within(dialog).findByText('User211')).toBeInTheDocument();
    expect(within(dialog).getByText(/1 person holds this role/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete role' })).toBeDisabled();
  });

  it('refuses while a pending invitation offers it', async () => {
    adminService.listInvitations.mockResolvedValue([{ status: 'PENDING', role_names: 'POS_CASHIER' }]);
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete Cashier/ });
    expect(await within(dialog).findByText(/1 pending invitation offers this role/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete role' })).toBeDisabled();
  });

  it('deletes a role nobody holds, listing what goes with it', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete Cashier/ });
    expect(await within(dialog).findByText(/Nobody holds this role/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(adminService.deleteRole).toHaveBeenCalledWith('r-cashier'));
  });

  it('backs out cleanly', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete Cashier/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(adminService.deleteRole).not.toHaveBeenCalled();
  });
});

describe('compare, matrix and preview', () => {
  it('compares roles and shows only what differs', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    // Cashier is preselected from the editor; add the waiter.
    fireEvent.change(screen.getByLabelText('Add a role to compare'), { target: { value: 'r-waiter' } });
    const table = screen.getByRole('table');
    // Both hold Orders — View, so with "only differences" it is hidden…
    expect(within(table).queryByText('Orders & KOTs — View')).toBeNull();
    // …and Manage, which only the cashier holds, is shown.
    expect(within(table).getByText('Orders & KOTs — Manage')).toBeInTheDocument();
  });

  it('lays every role against every permission', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Matrix' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Bills & settlement — Manage')).toBeInTheDocument();
    expect(within(table).getByLabelText('Cashier has Orders & KOTs — Manage')).toBeInTheDocument();
    expect(within(table).queryByLabelText('Waiter has Orders & KOTs — Manage')).toBeNull();
  });

  it('previews what a role would see, from the real navigation', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Preview access' }));
    // Cashier holds Orders & KOTs: the till is open to them and is where they land.
    expect(screen.getByText('Lands on')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'The rail they would see' })).toHaveTextContent('Billing & KOT');
  });
});
