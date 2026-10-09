import api from '../api/api';
import { ENDPOINTS } from '../config/config';

// Admin Services
export const getAdminSettings = () => api.get(ENDPOINTS.ADMIN.SETTINGS);

// Reports Services

// Audit Services
export const getAuditLogs = (params = {}) => api.get(ENDPOINTS.AUDIT.LOGS, { params });
export const getAuditCategories = () => api.get(ENDPOINTS.AUDIT.CATEGORIES);
/** People and Action dropdown values — the server reads them from recent rows. */
export const getAuditFilters = () => api.get(ENDPOINTS.AUDIT.FILTERS);

export default {
  getAdminSettings,
  getAuditLogs,
};
