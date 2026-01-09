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

export default {
  login,
  logout,
  switchTenant,
}
