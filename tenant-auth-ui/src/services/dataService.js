import api from '../api/api';
import { ENDPOINTS } from '../config/config';

// Admin Services
export const getAdminSettings = () => api.get(ENDPOINTS.ADMIN.SETTINGS);

// Reports Services
export const getReports = () => api.get(ENDPOINTS.REPORTS.LIST);

// Audit Services
export const getAuditLogs = () => api.get(ENDPOINTS.AUDIT.LOGS);

export default {
  getAdminSettings,
  getReports,
  getAuditLogs,
};
