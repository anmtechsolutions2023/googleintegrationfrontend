import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TenantUsersPanel from '../TenantUsersPanel';
import adminService from '../../../services/adminService';

// Managing the people who can sign in to this tenancy.
//
// The behaviour that matters most here: "Admin" is a MEMBERSHIP flag, not a
// role. A user assigned the role named SUPER_ADMIN received all of that role's
// feature scopes and was still refused the admin screens, because TENANT:ADMIN
// is derived from user_tenants.is_admin and nothing else.

jest.mock('../../../services/adminService', () => ({
  __esModule: true,
  default: {
    listUsers: jest.fn(),
    listUserRoleIds: jest.fn(),
    setUserRoles: jest.fn(),
    setUserStatus: jest.fn(),
    setUserTenantAdmin: jest.fn(),
    updateUserProfile: jest.fn(),
    removeUser: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const ROLES = [
  { id: 'r1', name: 'POS_CASHIER' },
  { id: 'r2', name: 'POS_MANAGER' },
];

// Identity is the verified mobile number (E.164) since the move to WhatsApp
// sign-in; these fixtures used to carry email addresses.
const ME = '+919000000002';
const user = (over = {}) => ({
  user_phone: '+919000000001', roles: 'POS_CASHIER',
  is_admin: 0, is_super_admin: 0, status: 'ACTIVE', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  adminService.listUsers.mockResolvedValue([user()]);
  // The role ids a member holds come from the server, never from the joined
  // role NAMES on the row.
  adminService.listUserRoleIds.mockResolvedValue(['r1']);
  ['setUserRoles', 'setUserStatus', 'setUserTenantAdmin', 'updateUserProfile', 'removeUser']
    .forEach((fn) => adminService[fn].mockResolvedValue({}));
});

const renderPanel = async (props = {}) => {
  render(<TenantUsersPanel roles={ROLES} currentPhone={ME} canWrite {...props} />);
  await waitFor(() => expect(adminService.listUsers).toHaveBeenCalled());
};

describe('admin access is a membership flag, not a role', () => {
  it('grants it through the switch the login path actually reads', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Admin/i }));
    await waitFor(() => expect(adminService.setUserTenantAdmin)
      .toHaveBeenCalledWith('+919000000001', true));
  });

  it('withdraws it again', async () => {
    adminService.listUsers.mockResolvedValue([user({ is_admin: 1 })]);
    await renderPanel();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Admin/i }));
    await waitFor(() => expect(adminService.setUserTenantAdmin)
      .toHaveBeenCalledWith('+919000000001', false));
  });

  // A super admin already passes every check through the checkScope bypass.
  it('offers no toggle for a super admin', async () => {
    adminService.listUsers.mockResolvedValue([user({ is_super_admin: 1, is_admin: 1 })]);
    await renderPanel();
    await screen.findByText(/super admin/i);
    expect(screen.queryByRole('checkbox', { name: /Admin/i })).not.toBeInTheDocument();
  });

  // The server refuses this; not offering it is kinder than a 403 toast.
  it('does not let an admin withdraw their OWN access', async () => {
    adminService.listUsers.mockResolvedValue([user({ user_phone: ME, is_admin: 1 })]);
    await renderPanel();
    await screen.findByText('you');   // the row chip, not the intro copy
    expect(screen.queryByRole('checkbox', { name: /Admin/i })).not.toBeInTheDocument();
  });
});

describe('editing roles', () => {
  const openEditor = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Edit roles/i }));
    await waitFor(() => expect(adminService.listUserRoleIds).toHaveBeenCalledWith('+919000000001'));
  };

  it('sends the full set — assignment replaces rather than merges', async () => {
    await renderPanel();
    await openEditor();
    // POS_CASHIER is pre-ticked from the current roles; add the manager role.
    fireEvent.click(screen.getByRole('checkbox', { name: /Front desk manager/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => expect(adminService.setUserRoles)
      .toHaveBeenCalledWith('+919000000001', ['r1', 'r2']));
  });

  it('pre-selects what they already hold', async () => {
    await renderPanel();
    await openEditor();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Cashier/ })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: /Front desk manager/ })).not.toBeChecked();
  });

  // The row's `roles` column is a GROUP_CONCAT of NAMES: it truncates at
  // group_concat_max_len and splits wrongly on a name containing a comma.
  // Because saving replaces the whole set, deriving the ticks from it would
  // mean a save that silently strips roles.
  it('takes the current ids from the server, not from the joined names', async () => {
    adminService.listUsers.mockResolvedValue([user({ roles: 'POS_CASHIER, POS_MAN…' })]);
    adminService.listUserRoleIds.mockResolvedValue(['r1', 'r2']);

    await renderPanel();
    await openEditor();

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Front desk manager/ })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: /Cashier/ })).toBeChecked();
  });

  it('backs out of the edit if their roles cannot be read', async () => {
    adminService.listUserRoleIds.mockRejectedValue(new Error('boom'));
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Edit roles/i }));
    // Rather than opening an editor pre-ticked with nothing, which would save
    // as "remove every role".
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument());
    expect(adminService.setUserRoles).not.toHaveBeenCalled();
  });

  it('abandons the edit on cancel', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Edit roles/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(adminService.setUserRoles).not.toHaveBeenCalled();
  });
});

describe('suspend and remove', () => {
  it('suspends an active member', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Suspend/i }));
    await waitFor(() => expect(adminService.setUserStatus)
      .toHaveBeenCalledWith('+919000000001', 'SUSPENDED'));
  });

  it('reactivates a suspended one', async () => {
    adminService.listUsers.mockResolvedValue([user({ status: 'SUSPENDED' })]);
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Reactivate/i }));
    await waitFor(() => expect(adminService.setUserStatus)
      .toHaveBeenCalledWith('+919000000001', 'ACTIVE'));
  });

  // "Delete user" reads as something more final than it is, so the dialog says
  // what actually happens: the membership ends, other tenancies are untouched.
  it('confirms before removing, and explains the scope', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Remove/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/this tenancy/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/other tenancy they belong to is unaffected/i)).toBeInTheDocument();
    expect(adminService.removeUser).not.toHaveBeenCalled();
  });

  it('removes only on confirmation', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Remove/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Remove from tenancy/i }));
    await waitFor(() => expect(adminService.removeUser)
      .toHaveBeenCalledWith('+919000000001'));
  });

  it('backs out cleanly', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Remove/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Keep them/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adminService.removeUser).not.toHaveBeenCalled();
  });

  // Self-removal is refused by the server; the controls are simply absent.
  it('offers neither suspend nor remove on your own row', async () => {
    adminService.listUsers.mockResolvedValue([user({ user_phone: ME })]);
    await renderPanel();
    await screen.findByText('you');
    expect(screen.queryByRole('button', { name: /Suspend/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove$/i })).not.toBeInTheDocument();
  });
});

describe('read-only access', () => {
  it('shows the list but offers no mutations', async () => {
    await renderPanel({ canWrite: false });
    await screen.findByText('+91 90000 00001');
    expect(screen.queryByRole('button', { name: /Edit roles/i })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Admin/i })).toBeDisabled();
  });
});

// Staff and users are ONE entity: the membership row IS the staff record, so
// the details that used to live on a separate roster are edited right here.
describe('staff details on a membership', () => {
  const BRANCHES = [{ Id: 'b1', BranchName: 'Central' }];

  it('shows the person by name, with the email underneath', async () => {
    adminService.listUsers.mockResolvedValue([
      user({ full_name: 'Priya R', phone: '9876543210', branch_name: 'Central' }),
    ]);
    await renderPanel({ branches: BRANCHES });
    expect(await screen.findByText('Priya R')).toBeInTheDocument();
    expect(screen.getByText('+91 90000 00001')).toBeInTheDocument();
    expect(screen.getByText('Central')).toBeInTheDocument();
  });

  it('falls back to the number for somebody with no name yet, and says so', async () => {
    await renderPanel();
    expect(await screen.findByText('+91 90000 00001')).toBeInTheDocument();
    expect(screen.getByText('Name not set')).toBeInTheDocument();
  });

  // Provisioning stores the number as the name when none was given; that is
  // still no name, and must not be shown twice.
  it('treats a name that is just the number as no name', async () => {
    adminService.listUsers.mockResolvedValue([user({ full_name: '+919000000001' })]);
    await renderPanel();
    expect(await screen.findByText('Name not set')).toBeInTheDocument();
    expect(screen.queryByText('+919000000001')).toBeNull();
  });

  // The number is the identity (user_phone) and is not edited here; name and
  // home branch are.
  it('saves name and home branch together', async () => {
    adminService.listUsers.mockResolvedValue([user({ full_name: 'Priya R' })]);
    await renderPanel({ branches: BRANCHES });

    fireEvent.click(await screen.findByRole('button', { name: /Edit details/i }));
    fireEvent.change(screen.getByLabelText(/Full name for/i), { target: { value: 'Priya Ramanathan' } });
    fireEvent.change(screen.getByLabelText(/Branch for/i), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: /Save details/i }));

    await waitFor(() => expect(adminService.updateUserProfile).toHaveBeenCalledWith('+919000000001', {
      fullName: 'Priya Ramanathan', branchDetailId: 'b1',
    }));
  });

  // Unassigning a branch is a legitimate edit, so an empty field must send
  // null rather than being silently dropped.
  it('sends null for a field that has been cleared', async () => {
    adminService.listUsers.mockResolvedValue([user({ full_name: 'Priya R', branch_detail_id: 'b1' })]);
    await renderPanel({ branches: BRANCHES });

    fireEvent.click(await screen.findByRole('button', { name: /Edit details/i }));
    fireEvent.change(screen.getByLabelText(/Branch for/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Save details/i }));

    await waitFor(() => expect(adminService.updateUserProfile)
      .toHaveBeenCalledWith('+919000000001', expect.objectContaining({ branchDetailId: null })));
  });

  it('shows roles by the job, and says the home branch restricts nothing', async () => {
    adminService.listUsers.mockResolvedValue([user({ roles: 'POS_CASHIER, POS_MANAGER' })]);
    await renderPanel();
    expect(await screen.findByText('Cashier, Front desk manager')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Home branch' })).toBeInTheDocument();
    expect(screen.getByText(/does not limit what anyone can open/)).toBeInTheDocument();
  });
});

// Requirement: a tenant admin cannot modify their OWN roles, but keeps full
// access to everything else in their tenancy.
describe('an admin looking at their own row', () => {
  beforeEach(() => {
    adminService.listUsers.mockResolvedValue([user({ user_phone: ME, is_admin: 1, full_name: 'Me' })]);
  });

  it('is not offered a way to edit their own roles', async () => {
    await renderPanel();
    expect(await screen.findByText(/Roles locked/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit roles/i })).not.toBeInTheDocument();
  });

  // Their own NAME is harmless to change — it cannot lock anybody out.
  it('can still correct their own details', async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Edit details/i }));
    fireEvent.change(screen.getByLabelText(/Full name for/i), { target: { value: 'Corrected' } });
    fireEvent.click(screen.getByRole('button', { name: /Save details/i }));
    await waitFor(() => expect(adminService.updateUserProfile)
      .toHaveBeenCalledWith(ME, expect.objectContaining({ fullName: 'Corrected' })));
  });
});

// Ported from the retired /admin/users screen, which was the only one of the two
// that could filter a long list.
describe('finding somebody in a long list', () => {
  beforeEach(() => {
    adminService.listUsers.mockResolvedValue([
      user({ user_phone: '+919000000003', full_name: 'Priya R', roles: 'POS_MANAGER' }),
      user({ user_phone: '+919000000004', full_name: 'Sam T', roles: 'POS_CASHIER' }),
    ]);
  });

  it('filters by name', async () => {
    await renderPanel();
    fireEvent.change(await screen.findByLabelText(/Search people/i), { target: { value: 'priya' } });
    expect(screen.getByText('Priya R')).toBeInTheDocument();
    expect(screen.queryByText('Sam T')).not.toBeInTheDocument();
  });

  it('filters by email and by role, because both are how people search', async () => {
    await renderPanel();
    const box = await screen.findByLabelText(/Search people/i);

    fireEvent.change(box, { target: { value: '9000000004' } });
    expect(screen.getByText('Sam T')).toBeInTheDocument();

    fireEvent.change(box, { target: { value: 'cashier' } });
    expect(screen.getByText('Sam T')).toBeInTheDocument();
    expect(screen.queryByText('Priya R')).not.toBeInTheDocument();
  });

  it('says so when nothing matches, rather than showing an empty table', async () => {
    await renderPanel();
    fireEvent.change(await screen.findByLabelText(/Search people/i), { target: { value: 'zzz' } });
    expect(screen.getByText(/matches that search/i)).toBeInTheDocument();
  });

  it('counts what is shown against the total', async () => {
    await renderPanel();
    expect(await screen.findByText('2 people')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Search people/i), { target: { value: 'priya' } });
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });
});
