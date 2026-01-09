import api from '../api/api'
import { ENDPOINTS } from '../config/config'

export const getAdminSettings = () => api.get(ENDPOINTS.ADMIN_SETTINGS)

export const getReports = () => api.get(ENDPOINTS.REPORTS)

export const getAuditLogs = () => api.get(ENDPOINTS.AUDIT_LOGS)

export default {
  getAdminSettings,
  getReports,
  getAuditLogs,
}
