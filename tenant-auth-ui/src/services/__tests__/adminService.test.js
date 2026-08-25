import api from '../../api/api';
import {
  getOnboardingRequests,
  approveOnboardingRequest,
  rejectOnboardingRequest,
  getAdminUsers,
  getUserRoles,
  updateUserRoles,
  updateUserStatus,
  deleteUser,
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  updateRolePermissions,
  getFeatures,
  createFeature,
  updateFeature,
  deleteFeature,
  listUsers,
  listUserRoleIds,
  listRolePermissionIds,
  setUserTenantAdmin,
  updateUserProfile,
  removeUser,
  listInvitations,
  createInvitation,
  saveRole,
} from '../adminService';

jest.mock('../../api/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

afterEach(() => jest.clearAllMocks());

// ── Onboarding ────────────────────────────────────────────────

describe('getOnboardingRequests', () => {
  it('calls GET /api/admin/onboarding with params', () => {
    api.get.mockResolvedValue({ data: {} });
    getOnboardingRequests({ status: 'PENDING', page: 1 });
    expect(api.get).toHaveBeenCalledWith('/api/admin/onboarding', {
      params: { status: 'PENDING', page: 1 },
    });
  });
});

describe('approveOnboardingRequest', () => {
  it('sends tenantId and roleIds to the approve endpoint', () => {
    api.put.mockResolvedValue({ data: {} });
    approveOnboardingRequest('req-1', 'tenant-abc', ['role-1', 'role-2']);
    expect(api.put).toHaveBeenCalledWith(
      '/api/admin/onboarding/req-1/approve',
      { tenantId: 'tenant-abc', roleIds: ['role-1', 'role-2'] }
    );
  });

  it('defaults roleIds to empty array when not provided', () => {
    api.put.mockResolvedValue({ data: {} });
    approveOnboardingRequest('req-1', 'tenant-abc');
    expect(api.put).toHaveBeenCalledWith(
      '/api/admin/onboarding/req-1/approve',
      { tenantId: 'tenant-abc', roleIds: [] }
    );
  });
});

describe('rejectOnboardingRequest', () => {
  it('sends rejectionReason to the reject endpoint', () => {
    api.put.mockResolvedValue({ data: {} });
    rejectOnboardingRequest('req-1', 'Not eligible');
    expect(api.put).toHaveBeenCalledWith(
      '/api/admin/onboarding/req-1/reject',
      { rejectionReason: 'Not eligible' }
    );
  });
});

// ── Users ─────────────────────────────────────────────────────

describe('getAdminUsers', () => {
  it('calls GET /api/admin/users', () => {
    api.get.mockResolvedValue({ data: {} });
    getAdminUsers();
    expect(api.get).toHaveBeenCalledWith('/api/admin/users');
  });
});

describe('getUserRoles', () => {
  it('encodes email in GET URL', () => {
    api.get.mockResolvedValue({ data: {} });
    getUserRoles('user@test.com');
    expect(api.get).toHaveBeenCalledWith('/api/admin/users/user%40test.com/roles');
  });
});

describe('updateUserRoles', () => {
  it('sends roleIds array', () => {
    api.put.mockResolvedValue({ data: {} });
    updateUserRoles('user@test.com', ['r1', 'r2']);
    expect(api.put).toHaveBeenCalledWith(
      '/api/admin/users/user%40test.com/roles',
      { roleIds: ['r1', 'r2'] }
    );
  });
});

describe('updateUserStatus', () => {
  it('sends only { status } — no isActive field', () => {
    api.put.mockResolvedValue({ data: {} });
    updateUserStatus('user@example.com', 'SUSPENDED');
    const [url, body] = api.put.mock.calls[0];
    expect(url).toBe('/api/admin/users/user%40example.com/status');
    expect(body).toEqual({ status: 'SUSPENDED' });
    expect(body).not.toHaveProperty('isActive');
  });

  it('works for ACTIVE status', () => {
    api.put.mockResolvedValue({ data: {} });
    updateUserStatus('user@example.com', 'ACTIVE');
    expect(api.put.mock.calls[0][1]).toEqual({ status: 'ACTIVE' });
  });

  it('encodes special characters in email', () => {
    api.put.mockResolvedValue({ data: {} });
    updateUserStatus('user+tag@example.com', 'ACTIVE');
    expect(api.put.mock.calls[0][0]).toBe('/api/admin/users/user%2Btag%40example.com/status');
  });
});

describe('deleteUser', () => {
  it('encodes email in DELETE URL', () => {
    api.delete.mockResolvedValue({ data: {} });
    deleteUser('user@test.com');
    expect(api.delete).toHaveBeenCalledWith('/api/admin/users/user%40test.com');
  });
});

// ── Roles ─────────────────────────────────────────────────────

describe('getRoles', () => {
  it('calls GET /api/admin/roles', () => {
    api.get.mockResolvedValue({ data: {} });
    getRoles();
    expect(api.get).toHaveBeenCalledWith('/api/admin/roles');
  });
});

describe('createRole', () => {
  it('sends name and description', () => {
    api.post.mockResolvedValue({ data: {} });
    createRole('EDITOR', 'Can edit records');
    expect(api.post).toHaveBeenCalledWith('/api/admin/roles', {
      name: 'EDITOR',
      description: 'Can edit records',
    });
  });
});

describe('updateRole', () => {
  it('sends partial update data', () => {
    api.put.mockResolvedValue({ data: {} });
    updateRole('role-uuid', { name: 'NEW_NAME', is_active: false });
    expect(api.put).toHaveBeenCalledWith('/api/admin/roles/role-uuid', {
      name: 'NEW_NAME',
      is_active: false,
    });
  });
});

describe('deleteRole', () => {
  it('calls DELETE /api/admin/roles/:id', () => {
    api.delete.mockResolvedValue({ data: {} });
    deleteRole('role-uuid');
    expect(api.delete).toHaveBeenCalledWith('/api/admin/roles/role-uuid');
  });
});

describe('getRolePermissions', () => {
  it('calls GET /api/admin/roles/:id/permissions', () => {
    api.get.mockResolvedValue({ data: {} });
    getRolePermissions('role-uuid');
    expect(api.get).toHaveBeenCalledWith('/api/admin/roles/role-uuid/permissions');
  });
});

describe('updateRolePermissions', () => {
  it('sends featureIds array', () => {
    api.put.mockResolvedValue({ data: {} });
    updateRolePermissions('role-uuid', ['feat-1', 'feat-2']);
    expect(api.put).toHaveBeenCalledWith('/api/admin/roles/role-uuid/permissions', {
      featureIds: ['feat-1', 'feat-2'],
    });
  });

  it('sends empty array when no permissions selected', () => {
    api.put.mockResolvedValue({ data: {} });
    updateRolePermissions('role-uuid', []);
    expect(api.put).toHaveBeenCalledWith('/api/admin/roles/role-uuid/permissions', {
      featureIds: [],
    });
  });
});

// ── Features ──────────────────────────────────────────────────

describe('getFeatures', () => {
  it('calls GET /api/admin/features', () => {
    api.get.mockResolvedValue({ data: {} });
    getFeatures();
    expect(api.get).toHaveBeenCalledWith('/api/admin/features');
  });
});

describe('createFeature', () => {
  it('sends the full feature payload', () => {
    api.post.mockResolvedValue({ data: {} });
    const payload = {
      name: 'Inventory Read',
      feature_short_name: 'INVENTORY',
      scope: 'READ',
      display_name: 'Inventory — View',
      category: 'Inventory',
      description: 'View inventory records',
    };
    createFeature(payload);
    expect(api.post).toHaveBeenCalledWith('/api/admin/features', payload);
  });
});

describe('updateFeature', () => {
  it('sends partial update fields', () => {
    api.put.mockResolvedValue({ data: {} });
    updateFeature('feat-uuid', { display_name: 'New Name', is_active: false });
    expect(api.put).toHaveBeenCalledWith('/api/admin/features/feat-uuid', {
      display_name: 'New Name',
      is_active: false,
    });
  });
});

describe('deleteFeature', () => {
  it('calls DELETE /api/admin/features/:id', () => {
    api.delete.mockResolvedValue({ data: {} });
    deleteFeature('feat-uuid');
    expect(api.delete).toHaveBeenCalledWith('/api/admin/features/feat-uuid');
  });
});

// ── The People & Access screen ────────────────────────────────
// These return the payload already unwrapped. Verified against a live server:
// /users/:email/roles returns user_roles rows (id, user_email, tenant_id,
// role_id, …) and /roles/:id/permissions returns role_permissions rows
// (id, role_id, feature_id, …).

describe('unwrapping', () => {
  it('pulls the array out of whichever envelope the API used', async () => {
    api.get.mockResolvedValue({ data: { data: [{ user_email: 'a@b.com' }] } });
    expect(await listUsers()).toEqual([{ user_email: 'a@b.com' }]);

    api.get.mockResolvedValue({ data: { resource: [{ user_email: 'c@d.com' }] } });
    expect(await listUsers()).toEqual([{ user_email: 'c@d.com' }]);
  });

  it('yields an empty array rather than undefined when there is no payload', async () => {
    api.get.mockResolvedValue({ data: null });
    expect(await listUsers()).toEqual([]);
  });
});

describe('listUserRoleIds', () => {
  // The row carries BOTH an id (the user_roles row) and a role_id. Picking the
  // wrong one would pre-tick nothing, and since saving replaces the whole set,
  // that saves as "remove every role".
  it('takes role_id, not the row id', async () => {
    api.get.mockResolvedValue({ data: { data: [
      { id: 'ur-1', role_id: 'role-1' },
      { id: 'ur-2', role_id: 'role-2' },
    ] } });
    expect(await listUserRoleIds('a@b.com')).toEqual(['role-1', 'role-2']);
  });

  it('encodes the email into the path', async () => {
    api.get.mockResolvedValue({ data: { data: [] } });
    await listUserRoleIds('a+b@x.com');
    expect(api.get).toHaveBeenCalledWith('/api/admin/users/a%2Bb%40x.com/roles');
  });
});

describe('listRolePermissionIds', () => {
  it('takes feature_id, not the row id', async () => {
    api.get.mockResolvedValue({ data: { data: [
      { id: 'rp-1', role_id: 'r1', feature_id: 'f1' },
    ] } });
    expect(await listRolePermissionIds('r1')).toEqual(['f1']);
  });
});

describe('membership mutations', () => {
  it('sets the admin FLAG, which is what the login path reads', async () => {
    api.put.mockResolvedValue({ data: {} });
    await setUserTenantAdmin('a@b.com', true);
    expect(api.put).toHaveBeenCalledWith('/api/admin/users/a%40b.com/admin', { isAdmin: true });
  });

  it('updates the staff details on the membership', async () => {
    api.put.mockResolvedValue({ data: {} });
    await updateUserProfile('a@b.com', { fullName: 'Priya R' });
    expect(api.put).toHaveBeenCalledWith('/api/admin/users/a%40b.com/profile', { fullName: 'Priya R' });
  });

  it('removes a membership, never a person', async () => {
    api.delete.mockResolvedValue({ data: {} });
    await removeUser('a@b.com');
    expect(api.delete).toHaveBeenCalledWith('/api/admin/users/a%40b.com');
  });
});

describe('invitations', () => {
  it('lists them', async () => {
    api.get.mockResolvedValue({ data: { data: [] } });
    await listInvitations();
    expect(api.get).toHaveBeenCalledWith('/api/admin/invitations');
  });

  // The tenancy comes from the token — sending one would let an admin invite
  // into somebody else's.
  it('never sends a tenancy', async () => {
    api.post.mockResolvedValue({ data: {} });
    await createInvitation({ email: 'new@x.com', roleIds: ['r1'] });
    expect(api.post).toHaveBeenCalledWith('/api/admin/invitations',
      { email: 'new@x.com', roleIds: ['r1'] });
  });
});

describe('saveRole', () => {
  it('posts when there is no id, puts when there is', async () => {
    api.post.mockResolvedValue({ data: {} });
    await saveRole(null, { name: 'POS_HOST', description: '' });
    expect(api.post).toHaveBeenCalledWith('/api/admin/roles', { name: 'POS_HOST', description: '' });

    api.put.mockResolvedValue({ data: {} });
    await saveRole('r1', { name: 'POS_TILL' });
    expect(api.put).toHaveBeenCalledWith('/api/admin/roles/r1', { name: 'POS_TILL' });
  });
});
