import api from '../api/api'
import { AUTH } from '../config/config'

export const login = (googleToken) => {
  return api.post(AUTH.LOGIN, { id_token: googleToken })
}

export const logout = () => {
  return api.post(AUTH.LOGOUT)
}

export const switchTenant = (tenantId) => {
  return api.post(AUTH.SWITCH_TENANT, { tenantId })
}

// The caller's own access, already grouped and worded by the server. Resolved
// there rather than here so the wording cannot differ between the two.
export const getMyCapabilities = async () => {
  const res = await api.get('/api/user/capabilities')
  return res.data?.data || res.data || null
}

export default {
  login,
  logout,
  switchTenant,
  getMyCapabilities,
}
