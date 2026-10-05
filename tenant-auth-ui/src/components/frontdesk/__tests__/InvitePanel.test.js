import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import InvitePanel from '../InvitePanel';
import adminService from '../../../services/adminService';

// The tenant admin's way to add somebody to their tenancy — the thing they
// could not do at all before. The tenancy is never sent: the server reads it
// from the token, so this panel cannot invite into anyone else's.

jest.mock('../../../services/adminService', () => ({
  __esModule: true,
  default: {
    listInvitations: jest.fn(),
    createInvitation: jest.fn(),
    revokeInvitation: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const ROLES = [
  { id: 'r1', name: 'POS_CASHIER' },
  { id: 'r2', name: 'POS_MANAGER' },
];

// Identity is the WhatsApp number since the move off Google sign-in; these
// fixtures used to carry email addresses.
const invite = (over = {}) => ({
  id: 'inv-1', phone: '+919876500001', is_admin: 0, status: 'PENDING',
  invited_by: '+919876543210', expires_at: '2026-09-05T00:00:00Z',
  role_names: 'POS_CASHIER', role_count: 1, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  adminService.listInvitations.mockResolvedValue([]);
  adminService.createInvitation.mockResolvedValue({ id: 'inv-new' });
});

const renderPanel = async (props = {}) => {
  render(<InvitePanel roles={ROLES} canWrite {...props} />);
  await waitFor(() => expect(adminService.listInvitations).toHaveBeenCalled());
};

/** The two fields an invitation cannot go without. */
const fillRequired = (phone = '98765 00001', name = 'Asha K') => {
  fireEvent.change(screen.getByLabelText(/WhatsApp number/i), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: name } });
};

describe('sending an invitation', () => {
  it('sends the number and chosen roles, and never a tenancy', async () => {
    await renderPanel();
    fillRequired();
    fireEvent.click(screen.getByRole('checkbox', { name: /POS_CASHIER/ }));
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));

    await waitFor(() => expect(adminService.createInvitation).toHaveBeenCalled());
    const [payload] = adminService.createInvitation.mock.calls[0];
    expect(payload).toMatchObject({ phone: '+919876500001', roleIds: ['r1'], isAdmin: false, fullName: 'Asha K' });
    // The server takes the tenancy from the token. Sending one would be the
    // same mistake the approval endpoints made.
    expect(payload).not.toHaveProperty('tenantId');
  });

  it('refuses a number that is not complete', async () => {
    const { toast } = require('react-toastify');
    await renderPanel();
    fillRequired('98765');
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    expect(adminService.createInvitation).not.toHaveBeenCalled();
    expect(toast.warn).toHaveBeenCalled();
  });

  // TENANT:ADMIN comes from the membership, not from any role, so this checkbox
  // is the only way to invite a co-admin.
  it('can invite a co-admin', async () => {
    await renderPanel();
    fillRequired();
    fireEvent.click(screen.getByRole('checkbox', { name: /Invite as tenant admin/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));

    await waitFor(() => expect(adminService.createInvitation.mock.calls[0][0].isAdmin).toBe(true));
  });

  it('allows an invitation with no roles — the server warns rather than refusing', async () => {
    await renderPanel();
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() => expect(adminService.createInvitation.mock.calls[0][0].roleIds).toEqual([]));
  });

  // "Already a member" and "already invited" are different, actionable facts.
  it('surfaces what the server said when it refuses', async () => {
    const { toast } = require('react-toastify');
    adminService.createInvitation.mockRejectedValue({
      response: { data: { message: 'That person is already in this tenancy.' } },
    });
    await renderPanel();
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));

    await waitFor(() => expect(toast.error)
      .toHaveBeenCalledWith('That person is already in this tenancy.'));
  });

  it('clears the form after a successful send', async () => {
    await renderPanel();
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() => expect(screen.getByLabelText(/Full name/i)).toHaveValue(''));
  });

  // Sign-in is by WhatsApp code; the footnote used to promise a Google account.
  it('says they join by signing in with this WhatsApp number', async () => {
    await renderPanel();
    expect(screen.getByText(/next time they sign in with this WhatsApp number/i)).toBeInTheDocument();
    expect(screen.queryByText(/Google/i)).toBeNull();
  });
});

describe('the invitation list', () => {
  it('shows who was invited, with what roles (by the job), and when it lapses', async () => {
    adminService.listInvitations.mockResolvedValue([invite()]);
    await renderPanel();

    const row = (await screen.findByText('+91 98765 00001')).closest('tr');
    expect(within(row).getByText('Cashier')).toBeInTheDocument();
    expect(within(row).getByText('PENDING')).toBeInTheDocument();
  });

  it('marks an invitation that confers admin', async () => {
    adminService.listInvitations.mockResolvedValue([invite({ is_admin: 1 })]);
    await renderPanel();
    expect(await screen.findByText('admin')).toBeInTheDocument();
  });

  it('says so when an invitation grants no roles', async () => {
    adminService.listInvitations.mockResolvedValue([invite({ role_names: null, role_count: 0 })]);
    await renderPanel();
    expect(await screen.findByText(/No roles/i)).toBeInTheDocument();
  });

  it('withdraws a pending invitation', async () => {
    adminService.listInvitations.mockResolvedValue([invite()]);
    adminService.revokeInvitation.mockResolvedValue({});
    await renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /Withdraw/i }));
    await waitFor(() => expect(adminService.revokeInvitation).toHaveBeenCalledWith('inv-1'));
  });

  // Only a live invitation can be withdrawn; the rest are history.
  it('offers no withdraw on one already accepted', async () => {
    adminService.listInvitations.mockResolvedValue([invite({ status: 'ACCEPTED' })]);
    await renderPanel();
    await screen.findByText('ACCEPTED');
    expect(screen.queryByRole('button', { name: /Withdraw/i })).not.toBeInTheDocument();
  });
});

describe('read-only access', () => {
  it('hides the form and the withdraw action from someone who cannot invite', async () => {
    adminService.listInvitations.mockResolvedValue([invite()]);
    await renderPanel({ canWrite: false });
    await screen.findByText('+91 98765 00001');

    expect(screen.queryByRole('button', { name: /Send invitation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Withdraw/i })).not.toBeInTheDocument();
  });
});

// Adding a staff member IS inviting them: one person, one record. The details
// travel with the invitation and land on the membership when it is claimed.
describe('the staff details on an invitation', () => {
  const BRANCHES = [{ Id: 'b1', BranchName: 'Central' }];

  it('sends name and home branch alongside the roles', async () => {
    await renderPanel({ branches: BRANCHES });
    fillRequired('98765 00002', 'Priya R');
    fireEvent.change(screen.getByLabelText(/Home branch/i), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));

    await waitFor(() => expect(adminService.createInvitation).toHaveBeenCalled());
    expect(adminService.createInvitation.mock.calls[0][0]).toMatchObject({
      phone: '+919876500002', fullName: 'Priya R', branchDetailId: 'b1',
    });
  });

  // The branch is optional — an invitation without one still works.
  it('omits the branch when none was chosen', async () => {
    await renderPanel({ branches: BRANCHES });
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));

    await waitFor(() => expect(adminService.createInvitation).toHaveBeenCalled());
    const [payload] = adminService.createInvitation.mock.calls[0];
    expect(payload.branchDetailId).toBeUndefined();
  });

  it('lists a pending invitation by name once it has one', async () => {
    adminService.listInvitations.mockResolvedValue([invite({ full_name: 'Priya R' })]);
    await renderPanel({ branches: BRANCHES });
    expect(await screen.findByText('Priya R')).toBeInTheDocument();
    expect(screen.getByText('+91 98765 00001')).toBeInTheDocument();
  });

  // No branches configured yet is not an error — the picker simply does not
  // appear, and the invitation still goes out.
  it('leaves the branch picker out when there are no branches', async () => {
    await renderPanel();
    expect(screen.queryByLabelText(/Home branch/i)).not.toBeInTheDocument();
  });
});

// ── The platform owner's role is not on offer ───────────────────────────────
// There is one super admin in the system, established at install. Ticking it in
// an invite form would have granted blanket READ+WRITE on every module, under a
// label that read "Full system access" — so it is filtered out of the picker and
// refused by the server (utils/roleGuard.js) for anyone who posts it anyway.
describe('SUPER_ADMIN is never offered', () => {
  const WITH_SUPER = [
    { id: 'r0', name: 'SUPER_ADMIN', description: 'Full system access' },
    ...ROLES,
    { id: 'r3', name: 'TENANT_ADMIN', description: 'Full CRUD access' },
  ];

  it('is absent from the role list even when the API returns it', async () => {
    await renderPanel({ roles: WITH_SUPER });
    expect(screen.queryByText('SUPER_ADMIN')).not.toBeInTheDocument();
    expect(screen.queryByText(/Platform super admin/i)).not.toBeInTheDocument();
  });

  it('still offers TENANT_ADMIN — a tenancy may have as many as it likes', async () => {
    await renderPanel({ roles: WITH_SUPER });
    expect(screen.getByText('TENANT_ADMIN')).toBeInTheDocument();
  });

  it('leaves the ordinary roles untouched', async () => {
    await renderPanel({ roles: WITH_SUPER });
    expect(screen.getByText('POS_CASHIER')).toBeInTheDocument();
    expect(screen.getByText('POS_MANAGER')).toBeInTheDocument();
  });

  it('hides the whole roles block when SUPER_ADMIN is the only role there is', () => {
    // Otherwise the fieldset renders with nothing inside it.
    renderPanel({ roles: [{ id: 'r0', name: 'SUPER_ADMIN' }] });
    expect(screen.queryByText(/Roles in this tenancy/i)).not.toBeInTheDocument();
  });
});
