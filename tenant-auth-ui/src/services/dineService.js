// src/services/dineService.js
// The guest's API: a phone at a table, with no staff account.
//
// ITS OWN axios instance, on purpose. The staff instance (api/api.js) attaches
// the staff cookie and, on any 401, wipes it and hard-redirects to /login — the
// wrong thing on a guest's phone. Here the diner session token is attached
// explicitly, and a 401 simply means "scan the table again".

import axios from 'axios'
import { API_BASE_URL, DINE } from '../config/config'
import { APP_CONFIG } from '../constants'
import { toE164 } from '../utils/phone'

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: APP_CONFIG.API.REQUEST_TIMEOUT_MS,
})

const data = (res) => res.data?.data ?? res.data
const auth = (sessionToken) => ({ headers: { Authorization: `Bearer ${sessionToken}` } })

/** Where am I? Branch, table and whether ordering is on. 404 = code not active. */
export const resolve = (qrToken) => client.get(DINE.resolve(qrToken)).then(data)

/** The branch logo, or null. Never throws — a missing logo is not an error. */
export const getLogo = (qrToken) =>
  client.get(DINE.logo(qrToken)).then(data).catch(() => null)

export const requestCode = (qrToken, phone) =>
  client.post(DINE.otpRequest(qrToken), { phone: toE164(phone) }).then(data)

export const verifyCode = (qrToken, { challengeId, code, name }) =>
  client.post(DINE.otpVerify(qrToken), {
    challengeId, code, ...(name ? { name } : {}),
  }).then(data)

export const getSessionState = (sessionToken) =>
  client.get(DINE.SESSION, auth(sessionToken)).then(data)

/** A first-time guest's name. The server keeps a name staff already entered. */
export const setName = (sessionToken, name) =>
  client.put(DINE.ME, { name }, auth(sessionToken)).then(data)

export const getMenu = (sessionToken) =>
  client.get(DINE.MENU, auth(sessionToken)).then(data)

/** Only the fields the server accepts — price and name are the server's. */
const toLines = (cart) => cart.map((l) => ({
  id: l.id,
  quantity: l.quantity,
  variantIds: l.variantIds || [],
  addonIds: l.addonIds || [],
  ...(l.note ? { note: l.note } : {}),
}))

export const quote = (sessionToken, cart) =>
  client.post(DINE.QUOTE, { items: toLines(cart) }, auth(sessionToken)).then(data)

export const placeOrder = (sessionToken, cart, cookingInstructions) =>
  client.post(DINE.ORDERS, {
    items: toLines(cart),
    ...(cookingInstructions ? { cookingInstructions } : {}),
  }, auth(sessionToken)).then(data)

export const getOrders = (sessionToken) =>
  client.get(DINE.ORDERS, auth(sessionToken)).then(data)

/** The server's sentence for a failed call, or a fallback. */
export const messageOf = (error, fallback = 'Something went wrong. Please try again.') =>
  error?.response?.data?.message || fallback

/** True when the session is gone and the guest has to scan again. */
export const isSessionEnded = (error) =>
  error?.response?.status === 401 || error?.response?.data?.code === 'DINER_SESSION_ENDED'

const dineService = {
  resolve, getLogo, requestCode, verifyCode, getSessionState, setName, getMenu,
  quote, placeOrder, getOrders, messageOf, isSessionEnded,
}

export default dineService
