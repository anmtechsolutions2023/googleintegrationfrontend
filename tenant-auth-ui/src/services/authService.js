import api from '../api/api'
import { AUTH } from '../config/config'
import { toE164 } from '../utils/phone'

/**
 * Ask for a one-time code.
 *
 * Resolves the same way whether or not the number is registered — the server
 * deliberately gives nothing away. A rejection here means something went wrong
 * (a malformed number, a rate limit, WhatsApp unreachable), never "we do not
 * know you".
 */
export const requestOtp = (phone) =>
  api.post(AUTH.OTP_REQUEST, { phone: toE164(phone) })

/** Spend the code. `name` is read only when the number turns out to be new. */
export const verifyOtp = ({ challengeId, code, name }) =>
  api.post(AUTH.OTP_VERIFY, { challengeId, code, ...(name ? { name } : {}) })

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
  requestOtp,
  verifyOtp,
  logout,
  switchTenant,
  getMyCapabilities,
}
