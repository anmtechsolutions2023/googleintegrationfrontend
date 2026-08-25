import api from '../api/api';
import { ENDPOINTS } from '../config/config';

const BASE = ENDPOINTS.ADMIN;
const INVITATIONS = '/api/admin/invitations';

// Every /api/admin/* URL in the app is declared in this file and nowhere else.
// posService used to carry its own copy of half of them, which is how two
// screens managing the same people drifted apart.
//
// Two calling conventions live here on purpose:
//   - the original exports return the raw axios response, because the older
//     admin pages unwrap `res.data?.data ?? res.data?.resource ?? res.data`
//     inline and are not worth disturbing;
//   - the list*/mutation helpers below return the payload already unwrapped,
//     which is what newer components expect.
const toArray = (body) => {
  const d = body?.data ?? body?.resource ?? body;
  return Array.isArray(d) ? d : [];
};
const toObject = (body) => body?.data ?? body?.resource ?? body ?? null;

// ── Onboarding requests ──
export const getOnboardingRequests = (params) =>
  api.get(BASE.ONBOARDING, { params });

export const approveOnboardingRequest = (id, tenantId, roleIds = []) =>
  api.put(`${BASE.ONBOARDING}/${id}/approve`, { tenantId, roleIds });

export const rejectOnboardingRequest = (id, rejectionReason) =>
  api.put(`${BASE.ONBOARDING}/${id}/reject`, { rejectionReason });

export const reopenOnboardingRequest = (id) =>
  api.put(`${BASE.ONBOARDING}/${id}/reopen`);

// ── Users ──
export const getAdminUsers = () =>
  api.get(BASE.USERS);

// Super-admin only: users across every tenant. `limit` is capped at 100 by the API.
export const getAllAdminUsers = (params = { limit: 100 }) =>
  api.get(`${BASE.USERS}/all`, { params });

export const getUserRoles = (email) =>
  api.get(`${BASE.USERS}/${encodeURIComponent(email)}/roles`);

export const updateUserRoles = (email, roleIds) =>
  api.put(`${BASE.USERS}/${encodeURIComponent(email)}/roles`, { roleIds });

export const updateUserStatus = (email, status) =>
  api.put(`${BASE.USERS}/${encodeURIComponent(email)}/status`, { status });

// Super-admin only: suspend/activate a user in any tenant (target in the body).
export const updateUserStatusCrossTenant = (email, tenantId, status) =>
  api.put(`${BASE.USERS}/all/status`, { email, tenantId, status });

export const deleteUser = (email) =>
  api.delete(`${BASE.USERS}/${encodeURIComponent(email)}`);

// ── Roles ──
export const getRoles = () =>
  api.get(BASE.ROLES);

export const createRole = (name, description) =>
  api.post(BASE.ROLES, { name, description });

export const updateRole = (id, data) =>
  api.put(`${BASE.ROLES}/${id}`, data);

export const deleteRole = (id) =>
  api.delete(`${BASE.ROLES}/${id}`);

export const getRolePermissions = (id) =>
  api.get(`${BASE.ROLES}/${id}/permissions`);

export const updateRolePermissions = (id, featureIds) =>
  api.put(`${BASE.ROLES}/${id}/permissions`, { featureIds });

// ── Features ──
export const getFeatures = () =>
  api.get(BASE.FEATURES);

export const createFeature = (data) =>
  api.post(BASE.FEATURES, data);

export const updateFeature = (id, data) =>
  api.put(`${BASE.FEATURES}/${id}`, data);

export const deleteFeature = (id) =>
  api.delete(`${BASE.FEATURES}/${id}`);

// ── Unwrapped helpers for the People & Access screen ──
// Tenancy-scoped without exception: the server reads the tenancy from the token,
// so none of these can be pointed at somebody else's.
export const listUsers = async () => toArray((await api.get(BASE.USERS)).data);
export const listRoles = async () => toArray((await api.get(BASE.ROLES)).data);
export const listFeatures = async () => toArray((await api.get(BASE.FEATURES)).data);

// The role ids a member actually holds. Read from the server rather than
// reconstructed from the concatenated role NAMES on the user row: GROUP_CONCAT
// truncates at group_concat_max_len and splits wrongly on a name containing a
// comma, and since assignment REPLACES the set, a bad read means a save that
// silently strips roles.
export const listUserRoleIds = async (email) => {
  const { data } = await api.get(`${BASE.USERS}/${encodeURIComponent(email)}/roles`);
  return toArray(data).map((r) => r.role_id ?? r.id).filter(Boolean);
};

// Tenant-admin access comes from the MEMBERSHIP flag, not from any role —
// assigning a role NAMED TENANT_ADMIN grants that role's feature scopes and
// nothing more. This is the switch the login path actually reads.
export const setUserTenantAdmin = async (email, isAdmin) =>
  toObject((await api.put(`${BASE.USERS}/${encodeURIComponent(email)}/admin`, { isAdmin })).data);

// The staff details on a membership. Staff and users are one entity: the
// membership row IS the staff record, so there is no separate roster.
export const updateUserProfile = async (email, profile) =>
  toObject((await api.put(`${BASE.USERS}/${encodeURIComponent(email)}/profile`, profile)).data);

// Ends the membership for THIS tenancy only. Memberships elsewhere survive.
export const removeUser = async (email) =>
  api.delete(`${BASE.USERS}/${encodeURIComponent(email)}`);

export const setUserRoles = async (email, roleIds) =>
  toObject((await api.put(`${BASE.USERS}/${encodeURIComponent(email)}/roles`, { roleIds })).data);

export const setUserStatus = async (email, status) =>
  toObject((await api.put(`${BASE.USERS}/${encodeURIComponent(email)}/status`, { status })).data);

// ── Invitations ──
// A tenant admin adding somebody to THEIR tenancy. The invitee joins on their
// next sign-in, and an invitation beats onboarding auto-approval, so they land
// in this tenancy rather than being handed one of their own.
export const listInvitations = async () => toArray((await api.get(INVITATIONS)).data);
export const createInvitation = async (data) => toObject((await api.post(INVITATIONS, data)).data);
export const revokeInvitation = async (id) => api.delete(`${INVITATIONS}/${id}`);

// ── Role permissions (unwrapped) ──
export const listRolePermissionIds = async (roleId) => {
  const { data } = await api.get(`${BASE.ROLES}/${roleId}/permissions`);
  return toArray(data).map((p) => p.feature_id ?? p.id).filter(Boolean);
};
export const saveRole = async (id, body) =>
  toObject((id ? await api.put(`${BASE.ROLES}/${id}`, body) : await api.post(BASE.ROLES, body)).data);
export const saveRolePermissions = async (roleId, featureIds) =>
  toObject((await api.put(`${BASE.ROLES}/${roleId}/permissions`, { featureIds })).data);

// ── Application configuration (super-admin) ──
export const getAppConfig = () =>
  api.get(BASE.APP_CONFIG);

export const updateAppConfig = (patch) =>
  api.patch(BASE.APP_CONFIG, patch);

export default {
  getOnboardingRequests,
  approveOnboardingRequest,
  rejectOnboardingRequest,
  reopenOnboardingRequest,
  getAdminUsers,
  getAllAdminUsers,
  getUserRoles,
  updateUserRoles,
  updateUserStatus,
  updateUserStatusCrossTenant,
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
  getAppConfig,
  updateAppConfig,
  // People & Access
  listUsers,
  listRoles,
  listFeatures,
  listUserRoleIds,
  setUserRoles,
  setUserStatus,
  setUserTenantAdmin,
  updateUserProfile,
  removeUser,
  listInvitations,
  createInvitation,
  revokeInvitation,
  listRolePermissionIds,
  saveRole,
  saveRolePermissions,
};
