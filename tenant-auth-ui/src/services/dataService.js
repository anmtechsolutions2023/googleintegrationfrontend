import api from '../api/api';
import { ENDPOINTS } from '../config/config';

// Admin Services
export const getAdminSettings = () => api.get(ENDPOINTS.ADMIN.SETTINGS);

// Reports Services
export const getReports = () => api.get(ENDPOINTS.REPORTS.LIST);

// Audit Services
export const getAuditLogs = (params = {}) => api.get(ENDPOINTS.AUDIT.LOGS, { params });
export const getAuditCategories = () => api.get(ENDPOINTS.AUDIT.CATEGORIES);

export default {
  getAdminSettings,
  getReports,
  getAuditLogs,
};
