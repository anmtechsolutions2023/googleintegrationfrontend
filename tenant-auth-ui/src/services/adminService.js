import api from '../api/api';
import { ENDPOINTS } from '../config/config';

const BASE = ENDPOINTS.ADMIN;

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
};
