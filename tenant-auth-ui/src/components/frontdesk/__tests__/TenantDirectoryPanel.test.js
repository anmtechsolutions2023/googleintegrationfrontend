import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TenantDirectoryPanel from '../TenantDirectoryPanel';
import adminService from '../../../services/adminService';

// Every tenancy on the platform, for a super admin.
//
// The reason this screen exists is the questions it answers that no tenancy can
// answer about itself — above all "which tenancies have nobody who can
// administer them", where everybody inside is locked out of the very screen
// that would show it.

jest.mock('../../../services/adminService', () => ({
  __esModule: true,
  default: {
    listTenants: jest.fn(),
    listTenantUsers: jest.fn(),
    updateUserStatusCrossTenant: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const ME = 'super@x.com';
const MY_TENANT = 'tenant-mine';

const tenancy = (over = {}) => ({
  tenant_id: 'tenant-a', tenant_name: 'ANM Tech', user_count: 6, admin_count: 2,
  super_admin_count: 0, suspended_count: 0, branch_count: 3,
  setup_status: 'COMPLETED', setup_completed_at: '2026-08-01T00:00:00Z',
  last_active_at: new Date().toISOString(),
  roles: 'POS_CASHIER, POS_MANAGER, TENANT_ADMIN', ...over,
});

const person = (over = {}) => ({
  user_email: 'priya@anmtech.in', tenant_id: 'tenant-a', full_name: 'Priya Ramanathan',
  phone: '9876543210', branch_name: 'Central', roles: 'TENANT_ADMIN',
  is_admin: 1, is_super_admin: 0, is_active: 1, status: 'ACTIVE',
  last_active_at: new Date().toISOString(), ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  adminService.listTenants.mockResolvedValue([tenancy()]);
  adminService.listTenantUsers.mockResolvedValue([person()]);
  adminService.updateUserStatusCrossTenant.mockResolvedValue({});
});

// Each person is in the DOM twice: the table for a wide panel and a card for a
// narrow one, with a container query choosing between them. jsdom applies no
// CSS, so both are found — assertions that care about one person scope
// themselves to the table.
const inTable = () => within(document.querySelector('.fd-tenant-table'));

const renderPanel = async (props = {}) => {
  render(<TenantDirectoryPanel currentEmail={ME} currentTenantId={MY_TENANT} {...props} />);
  await waitFor(() =>
    expect(screen.queryByText(/Loading tenancies/i)).not.toBeInTheDocument());
};

describe('the tenancy list', () => {
  it('shows each tenancy with what it holds', async () => {
    await renderPanel();
    expect(await screen.findByText('ANM Tech')).toBeInTheDocument();
    expect(screen.getByText('tenant-a')).toBeInTheDocument();

    const counts = document.querySelector('.fd-tenant-counts');
    expect(counts).toHaveTextContent('6 people');
    expect(counts).toHaveTextContent('2 admins');
    expect(counts).toHaveTextContent('3 branches');
  });

  // A tenancy is created at first sign-in, before the setup wizard runs, so a
  // tenancy with no organisation record is a real state — one of the live ones
  // is exactly this. It must be labelled, not rendered as a blank cell.
  it('labels a tenancy that has no organisation yet', async () => {
    adminService.listTenants.mockResolvedValue([tenancy({ tenant_name: null })]);
    await renderPanel();
    expect(await screen.findByText(/Unnamed tenancy/i)).toBeInTheDocument();
  });

  it('marks which tenancy is your own', async () => {
    adminService.listTenants.mockResolvedValue([
      tenancy(), tenancy({ tenant_id: MY_TENANT, tenant_name: 'Head Office' }),
    ]);
    await renderPanel();
    expect(await screen.findByText('yours')).toBeInTheDocument();
  });

  it('folds a long role list into a count rather than wrapping forever', async () => {
    await renderPanel();
    expect(await screen.findByText('+1')).toBeInTheDocument();   // 3 roles, 2 shown
  });

  it('says whether each tenancy finished setup', async () => {
    adminService.listTenants.mockResolvedValue([
      tenancy(), tenancy({ tenant_id: 'tenant-b', tenant_name: 'Fresh', setup_status: 'PENDING' }),
    ]);
    await renderPanel();
    expect(await screen.findByText('Set up')).toBeInTheDocument();
    // 'Setup incomplete' is both a filter chip and a badge; the badge is the
    // one that matters here.
    expect(document.querySelectorAll('.fd-tenant-setup .fd-badge-pending')).toHaveLength(1);
  });
});

// The point of the screen.
describe('a tenancy nobody can administer', () => {
  const orphan = tenancy({ tenant_id: 'tenant-orphan', tenant_name: 'Blue Fig', admin_count: 0 });

  it('is called out when opened', async () => {
    adminService.listTenants.mockResolvedValue([orphan]);
    adminService.listTenantUsers.mockResolvedValue([person({ is_admin: 0, roles: 'POS_CASHIER' })]);
    await renderPanel();

    fireEvent.click(await screen.findByText('Blue Fig'));
    const warn = await screen.findByText(/No tenant admin/i);
    expect(warn).toHaveTextContent(/can invite staff, assign a role/i);
  });

  it('counts toward the attention figure', async () => {
    adminService.listTenants.mockResolvedValue([tenancy(), orphan]);
    await renderPanel();
    const stat = (await screen.findByText('Need attention')).closest('.fd-stat');
    expect(within(stat).getByText('1')).toBeInTheDocument();
  });

  it('can be filtered down to', async () => {
    adminService.listTenants.mockResolvedValue([tenancy(), orphan]);
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'No admin' }));
    expect(screen.getByText('Blue Fig')).toBeInTheDocument();
    expect(screen.queryByText('ANM Tech')).not.toBeInTheDocument();
  });

  it('shows every tenancy again when the filter is cleared', async () => {
    adminService.listTenants.mockResolvedValue([tenancy(), orphan]);
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'No admin' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('ANM Tech')).toBeInTheDocument();
  });
});

describe('opening a tenancy', () => {
  // The list carries counts; pulling every person on the platform to render a
  // handful of collapsed rows would be paying for nothing.
  it('fetches its people only when expanded', async () => {
    await renderPanel();
    expect(adminService.listTenantUsers).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('ANM Tech'));
    await waitFor(() => expect(adminService.listTenantUsers).toHaveBeenCalledWith('tenant-a'));
  });

  it('does not refetch a tenancy already opened once', async () => {
    await renderPanel();
    fireEvent.click(screen.getByText('ANM Tech'));
    await waitFor(() => expect(inTable().getByText('Priya Ramanathan')).toBeInTheDocument());
    fireEvent.click(screen.getByText('ANM Tech'));   // collapse
    fireEvent.click(screen.getByText('ANM Tech'));   // re-open
    await waitFor(() => expect(inTable().getByText('Priya Ramanathan')).toBeInTheDocument());
    expect(adminService.listTenantUsers).toHaveBeenCalledTimes(1);
  });

  it('shows people by name, with the email beneath', async () => {
    await renderPanel();
    fireEvent.click(screen.getByText('ANM Tech'));
    await waitFor(() => expect(inTable().getByText('Priya Ramanathan')).toBeInTheDocument());
    expect(inTable().getByText('priya@anmtech.in')).toBeInTheDocument();
    expect(inTable().getByText('Central')).toBeInTheDocument();
  });

  it('falls back to the email for somebody with no name set', async () => {
    adminService.listTenantUsers.mockResolvedValue([person({ full_name: null })]);
    await renderPanel();
    fireEvent.click(screen.getByText('ANM Tech'));
    await waitFor(() => expect(inTable().getByText('priya@anmtech.in')).toBeInTheDocument());
  });

  // "Nobody is in this tenancy" is an answer worth seeing.
  it('says so when a tenancy has no members', async () => {
    adminService.listTenantUsers.mockResolvedValue([]);
    await renderPanel();
    fireEvent.click(screen.getByText('ANM Tech'));
    expect(await screen.findByText(/Nobody belongs to this tenancy/i)).toBeInTheDocument();
  });
});

// Read-only apart from suspension, and the exceptions match what the server
// refuses — a button that always 403s is worse than no button.
describe('what can actually be changed from here', () => {
  it('suspends across tenancies, naming the tenancy explicitly', async () => {
    await renderPanel();
    fireEvent.click(screen.getByText('ANM Tech'));
    const btn = await waitFor(() => inTable().getByRole('button', { name: /Suspend/i }));
    fireEvent.click(btn);

    await waitFor(() => expect(adminService.updateUserStatusCrossTenant)
      .toHaveBeenCalledWith('priya@anmtech.in', 'tenant-a', 'SUSPENDED'));
  });

  it('reactivates a suspended member', async () => {
    adminService.listTenantUsers.mockResolvedValue([person({ status: 'SUSPENDED', is_active: 0 })]);
    await renderPanel();
    fireEvent.click(screen.getByText('ANM Tech'));
    const btn = await waitFor(() => inTable().getByRole('button', { name: /Reactivate/i }));
    fireEvent.click(btn);

    await waitFor(() => expect(adminService.updateUserStatusCrossTenant)
      .toHaveBeenCalledWith('priya@anmtech.in', 'tenant-a', 'ACTIVE'));
  });

  it('offers nothing against a super admin', async () => {
    adminService.listTenantUsers.mockResolvedValue([person({ is_super_admin: 1 })]);
    await renderPanel();
    fireEvent.click(screen.getByText('ANM Tech'));
    await waitFor(() => expect(inTable().getByText('Protected')).toBeInTheDocument());
    // Scoped to the table: 'Has suspended' is a filter chip, not a row action.
    expect(inTable().queryByRole('button', { name: /Suspend/i })).not.toBeInTheDocument();
  });

  it('offers nothing against your own account', async () => {
    adminService.listTenantUsers.mockResolvedValue([person({ user_email: ME, full_name: null })]);
    await renderPanel();
    fireEvent.click(screen.getByText('ANM Tech'));
    await waitFor(() => expect(inTable().getByText('Protected')).toBeInTheDocument());
  });

  // Roles are assigned inside the tenancy that owns them; the server scopes
  // that write to the caller's own tenancy and cannot be pointed elsewhere.
  it('never offers to edit roles from here', async () => {
    await renderPanel();
    fireEvent.click(screen.getByText('ANM Tech'));
    await waitFor(() => expect(inTable().getByText('Priya Ramanathan')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Edit roles/i })).not.toBeInTheDocument();
  });
});

describe('finding a tenancy', () => {
  beforeEach(() => {
    adminService.listTenants.mockResolvedValue([
      tenancy(), tenancy({ tenant_id: 'tenant-b', tenant_name: 'Saffron House', roles: 'POS_WAITER' }),
    ]);
  });

  it('searches on name', async () => {
    await renderPanel();
    fireEvent.change(await screen.findByLabelText(/Search tenancies/i), { target: { value: 'saffron' } });
    expect(screen.getByText('Saffron House')).toBeInTheDocument();
    expect(screen.queryByText('ANM Tech')).not.toBeInTheDocument();
  });

  it('searches on tenancy id and on role', async () => {
    await renderPanel();
    const box = await screen.findByLabelText(/Search tenancies/i);

    fireEvent.change(box, { target: { value: 'tenant-b' } });
    expect(screen.getByText('Saffron House')).toBeInTheDocument();

    fireEvent.change(box, { target: { value: 'waiter' } });
    expect(screen.getByText('Saffron House')).toBeInTheDocument();
    expect(screen.queryByText('ANM Tech')).not.toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    await renderPanel();
    fireEvent.change(await screen.findByLabelText(/Search tenancies/i), { target: { value: 'zzz' } });
    expect(screen.getByText(/No tenancy matches/i)).toBeInTheDocument();
  });
});
