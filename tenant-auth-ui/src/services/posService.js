import api from '../api/api'
import { APP_CONFIG } from '../constants'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

// Normalize any of the backend's response envelopes to a plain array
const toArray = (res) => {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.message)) return res.message
  if (Array.isArray(res?.pagination)) return res.pagination
  return []
}

const toObject = (res) => {
  if (res?.data && typeof res.data === 'object' && !Array.isArray(res.data)) return res.data
  if (res?.message && typeof res.message === 'object' && !Array.isArray(res.message)) return res.message
  return res || {}
}

// ── Floors ──────────────────────────────────────────────────────────────────
export const getFloors = async (params = {}) => {
  const res = await api.get('/api/pos/floors', { params })
  return toArray(res.data)
}
export const createFloor = async (data) => {
  const res = await api.post('/api/pos/floors', data)
  return toObject(res.data)
}
export const updateFloor = async (id, data) => {
  const res = await api.put(`/api/pos/floors/${id}`, data)
  return toObject(res.data)
}
export const deleteFloor = async (id) => api.delete(`/api/pos/floors/${id}`)

// ── Tables ───────────────────────────────────────────────────────────────────
export const getTables = async (params = {}) => {
  const res = await api.get('/api/pos/tables', { params })
  return toArray(res.data)
}
export const createTable = async (data) => {
  const res = await api.post('/api/pos/tables', data)
  return toObject(res.data)
}
export const updateTable = async (id, data) => {
  const res = await api.put(`/api/pos/tables/${id}`, data)
  return toObject(res.data)
}
export const deleteTable = async (id) => api.delete(`/api/pos/tables/${id}`)

// ── Item Meta (Menu) ─────────────────────────────────────────────────────────
export const getItemMeta = async (params = {}) => {
  const res = await api.get('/api/pos/item-meta', { params })
  return toArray(res.data)
}
export const createItemMeta = async (data) => {
  const res = await api.post('/api/pos/item-meta', data)
  return toObject(res.data)
}
export const updateItemMeta = async (id, data) => {
  const res = await api.put(`/api/pos/item-meta/${id}`, data)
  return toObject(res.data)
}
export const deleteItemMeta = async (id) => api.delete(`/api/pos/item-meta/${id}`)

// ── Customers ────────────────────────────────────────────────────────────────
export const getCustomers = async (params = {}) => {
  const res = await api.get('/api/pos/customers', { params })
  return toArray(res.data)
}
export const createCustomer = async (data) => {
  const res = await api.post('/api/pos/customers', data)
  return toObject(res.data)
}
export const updateCustomer = async (id, data) => {
  const res = await api.put(`/api/pos/customers/${id}`, data)
  return toObject(res.data)
}
export const deleteCustomer = async (id) => api.delete(`/api/pos/customers/${id}`)

// ── Orders ───────────────────────────────────────────────────────────────────
export const getOrders = async (params = {}) => {
  const res = await api.get('/api/pos/orders', { params })
  return toArray(res.data)
}
export const getOrder = async (id) => {
  const res = await api.get(`/api/pos/orders/${id}`)
  return toObject(res.data)
}
export const createOrder = async (data) => {
  const res = await api.post('/api/pos/orders', data)
  return toObject(res.data)
}
export const updateOrder = async (id, data) => {
  const res = await api.put(`/api/pos/orders/${id}`, data)
  return toObject(res.data)
}
export const deleteOrder = async (id) => api.delete(`/api/pos/orders/${id}`)

// Move items or whole rounds between tables (keep-as-served — the server
// preserves each line's priced snapshot). Returns { undo, createdOrderId, ... };
// POST the `undo` payload straight back here to reverse the move.
export const transferOrder = async (payload) => {
  const res = await api.post('/api/pos/orders/transfer', payload)
  return toObject(res.data)
}

export const fireKot = async (orderId) => {
  const res = await api.post(`/api/pos/orders/${orderId}/fire-kot`)
  return toObject(res.data)
}

// ── KOTs ─────────────────────────────────────────────────────────────────────
export const getKots = async (params = {}) => {
  const res = await api.get('/api/pos/kots', { params })
  return toArray(res.data)
}
export const createKot = async (data) => {
  const res = await api.post('/api/pos/kots', data)
  return toObject(res.data)
}
export const updateKot = async (id, data) => {
  const res = await api.put(`/api/pos/kots/${id}`, data)
  return toObject(res.data)
}
export const markKotReady = async (kotId) => {
  const res = await api.patch(`/api/pos/kots/${kotId}/ready`)
  return toObject(res.data)
}
export const deleteKot = async (id) => api.delete(`/api/pos/kots/${id}`)

// ── Bills ─────────────────────────────────────────────────────────────────────
export const getBills = async (params = {}) => {
  const res = await api.get('/api/pos/bills', { params })
  return toArray(res.data)
}
export const getBill = async (id) => {
  const res = await api.get(`/api/pos/bills/${id}`)
  return toObject(res.data)
}
export const createBill = async (data) => {
  const res = await api.post('/api/pos/bills', data)
  return toObject(res.data)
}
export const updateBill = async (id, data) => {
  const res = await api.put(`/api/pos/bills/${id}`, data)
  return toObject(res.data)
}
export const settleBill = async (billId, payload) => {
  const res = await api.post(`/api/pos/bills/${billId}/settle`, payload)
  return toObject(res.data)
}
export const deleteBill = async (id) => api.delete(`/api/pos/bills/${id}`)

// ── Online Orders ─────────────────────────────────────────────────────────────
export const getOnlineOrders = async (params = {}) => {
  const res = await api.get('/api/pos/online-orders', { params })
  return toArray(res.data)
}
export const createOnlineOrder = async (data) => {
  const res = await api.post('/api/pos/online-orders', data)
  return toObject(res.data)
}
export const updateOnlineOrder = async (id, data) => {
  const res = await api.put(`/api/pos/online-orders/${id}`, data)
  return toObject(res.data)
}
export const deleteOnlineOrder = async (id) => api.delete(`/api/pos/online-orders/${id}`)

// ── Feedback ──────────────────────────────────────────────────────────────────
export const getFeedback = async (params = {}) => {
  const res = await api.get('/api/pos/feedback', { params })
  return toArray(res.data)
}
export const createFeedback = async (data) => {
  const res = await api.post('/api/pos/feedback', data)
  return toObject(res.data)
}
export const updateFeedback = async (id, data) => {
  const res = await api.put(`/api/pos/feedback/${id}`, data)
  return toObject(res.data)
}
export const deleteFeedback = async (id) => api.delete(`/api/pos/feedback/${id}`)

// ── Tokens ────────────────────────────────────────────────────────────────────
export const getTokens = async (params = {}) => {
  const res = await api.get('/api/pos/tokens', { params })
  return toArray(res.data)
}
export const createToken = async (data) => {
  const res = await api.post('/api/pos/tokens', data)
  return toObject(res.data)
}
export const updateToken = async (id, data) => {
  const res = await api.put(`/api/pos/tokens/${id}`, data)
  return toObject(res.data)
}
export const deleteToken = async (id) => api.delete(`/api/pos/tokens/${id}`)

// ── Expenses ──────────────────────────────────────────────────────────────────
export const getExpenses = async (params = {}) => {
  const res = await api.get('/api/pos/expenses', { params })
  return toArray(res.data)
}
export const createExpense = async (data) => {
  const res = await api.post('/api/pos/expenses', data)
  return toObject(res.data)
}
export const updateExpense = async (id, data) => {
  const res = await api.put(`/api/pos/expenses/${id}`, data)
  return toObject(res.data)
}
export const deleteExpense = async (id) => api.delete(`/api/pos/expenses/${id}`)

// ── Staff ──────────────────────────────────────────────────────────────────────
export const getStaff = async (params = {}) => {
  const res = await api.get('/api/pos/staff', { params })
  return toArray(res.data)
}
export const createStaff = async (data) => {
  const res = await api.post('/api/pos/staff', data)
  return toObject(res.data)
}
export const updateStaff = async (id, data) => {
  const res = await api.put(`/api/pos/staff/${id}`, data)
  return toObject(res.data)
}
export const deleteStaff = async (id) => api.delete(`/api/pos/staff/${id}`)

// ── Admin/cross-domain lookups (used by AccessControl + Billing) ─────────────
export const getAdminRoles = async () => {
  const res = await api.get('/api/admin/roles')
  return toArray(res.data)
}
export const getAdminUsers = async () => {
  const res = await api.get('/api/admin/users')
  return toArray(res.data)
}
export const getItemDetail = async (id) => {
  const res = await api.get(`/api/itemdetails/${id}`)
  return toObject(res.data)
}
export const getInventoryEndpoint = async (path, params = {}) => {
  const res = await api.get(path, { params })
  return toArray(res.data)
}

// ── Generic endpoint helpers (used by PosCrudPage so no component hits api.js) ─
export const genericGet = async (endpoint, params = {}) => {
  const res = await api.get(endpoint, { params })
  return res.data
}
export const genericPost = async (endpoint, data) => {
  const res = await api.post(endpoint, data)
  return res.data
}
export const genericPut = async (endpoint, data) => {
  const res = await api.put(endpoint, data)
  return res.data
}
export const genericDelete = async (endpoint) => {
  const res = await api.delete(endpoint)
  return res.data
}

// ── POS Reports (aggregated from backend) ─────────────────────────────────────
export const getReports = async (params = {}) => {
  const res = await api.get('/api/pos/reports', { params })
  return toObject(res.data)
}

// ── Variants (item options: Small/Large, Extra cheese, …) ───────────────────
// Master list. A variant's Price is a flat surcharge on the item it is added
// to; the server resolves it at order time so the client never sets the price.
export const getVariants = async (params = {}) => {
  const res = await api.get('/api/pos/variants', {
    params: { limit: MAX_LIMIT, ...params },
  })
  return toArray(res.data)
}

// ── Pricing ─────────────────────────────────────────────────────────────────
// Server-side tax calculation over the master-data chain
// costinfo → taxgroup → taxgrouptaxtypemapper → TaxTypes, honouring each cost
// record's IsTaxIncluded flag.
//
// Stateless — stores nothing — so it is safe to call on every cart change. The
// server is the only place that knows the rounding and component-allocation
// rules, which is why the cart does not add up tax itself.
//
// @param {Array<{costInfoId:string, quantity:number, discount?:Object, ref?:string}>} lines
// @param {Object|null} discount - Document-level discount, applied BEFORE tax.
// @returns {Promise<{lines:Array, totals:Object}>}
export const quotePricing = async (lines, discount = null) => {
  const body = { lines }
  if (discount) body.discount = discount
  const res = await api.post('/api/pricing/quote', body)
  return toObject(res.data)
}

// ── Dashboard aggregate (derived from orders, bills, tables, kots) ────────────
export const getDashboardStats = async () => {
  const [orders, bills, tables, kots] = await Promise.allSettled([
    getOrders({ limit: MAX_LIMIT }),
    getBills({ limit: MAX_LIMIT }),
    getTables({ limit: MAX_LIMIT }),
    getKots({ limit: MAX_LIMIT }),
  ])
  const safeValue = (settled) => (settled.status === 'fulfilled' ? settled.value : [])
  const ordersData = safeValue(orders)
  const billsData  = safeValue(bills)
  const tablesData = safeValue(tables)
  const kotsData   = safeValue(kots)

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayOrders = ordersData.filter((o) => (o.CreatedOn || o.createdAt || '').slice(0, 10) === todayStr)
  const todayBills  = billsData.filter((b) => (b.CreatedOn || b.createdAt || '').slice(0, 10) === todayStr)
  const revenue     = todayBills.reduce((sum, b) => sum + (Number(b.Total) || 0), 0)
  const occupied    = tablesData.filter((t) => t.Status === 'Occupied').length
  const pendingKots = kotsData.filter((k) => k.Status !== 'Ready' && k.Status !== 'Delivered').length

  return {
    todayOrders: todayOrders.length,
    todayRevenue: revenue,
    totalTables: tablesData.length,
    occupiedTables: occupied,
    pendingKots,
    recentOrders: ordersData.slice(0, 5),
  }
}

const posService = {
  getFloors, createFloor, updateFloor, deleteFloor,
  getTables, createTable, updateTable, deleteTable,
  getItemMeta, createItemMeta, updateItemMeta, deleteItemMeta,
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getOrders, getOrder, createOrder, updateOrder, deleteOrder, transferOrder, fireKot,
  getKots, createKot, updateKot, markKotReady, deleteKot,
  getBills, getBill, createBill, updateBill, settleBill, deleteBill,
  getOnlineOrders, createOnlineOrder, updateOnlineOrder, deleteOnlineOrder,
  getFeedback, createFeedback, updateFeedback, deleteFeedback,
  getTokens, createToken, updateToken, deleteToken,
  getExpenses, createExpense, updateExpense, deleteExpense,
  getStaff, createStaff, updateStaff, deleteStaff,
  getVariants,
  quotePricing,
  getDashboardStats,
  getReports,
  genericGet, genericPost, genericPut, genericDelete,
  getAdminRoles, getAdminUsers, getItemDetail, getInventoryEndpoint,
}

export default posService
