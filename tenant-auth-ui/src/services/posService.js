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
// The round PLUS its token, kitchen tickets and invoice — assembled server-side
// so every screen that links an order number opens the same view of it.
export const getOrderDetail = async (id) => {
  const res = await api.get(`/api/pos/orders/${id}/detail`)
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
// `params` accepts { branchId, date, status } — one branch's queue on one day.
// The screen used to pull every token the tenant had ever issued and keep
// today's in the browser, which stops working on the first busy week.
export const getTokens = async (params = {}) => {
  const res = await api.get('/api/pos/tokens', { params })
  return toArray(res.data)
}
// Only BranchDetailId (and optionally OrderId) is sent: the number itself is
// minted server-side from the branch's numbering mode.
export const createToken = async (data) => {
  const res = await api.post('/api/pos/tokens', data)
  return toObject(res.data)
}
export const updateToken = async (id, data) => {
  const res = await api.put(`/api/pos/tokens/${id}`, data)
  return toObject(res.data)
}
// Domain actions rather than status PUTs — each stamps its own timestamp on the
// server, so the queue's clock is the same one the ledger runs on.
export const callToken = async (id) => {
  const res = await api.post(`/api/pos/tokens/${id}/call`)
  return toObject(res.data)
}
export const serveToken = async (id) => {
  const res = await api.post(`/api/pos/tokens/${id}/serve`)
  return toObject(res.data)
}
export const deleteToken = async (id) => api.delete(`/api/pos/tokens/${id}`)

// ── Branches, for POS screens ────────────────────────────────────────────────
// NOT crudService.getAll('branchDetails') — that endpoint is governed by
// ORGANIZATION_READ, which a cashier does not hold, so it 403s and every branch
// picker on a POS screen silently reads "No branches". This one is admitted on
// any POS read scope and returns only Id + BranchName.
export const getPosBranches = async () => {
  const res = await api.get('/api/pos/branches')
  return toArray(res.data)
}

// ── POS settings (per branch) ────────────────────────────────────────────────
export const getPosSettings = async (branchId) => {
  const res = await api.get('/api/pos/settings', { params: { branchId } })
  return toObject(res.data) || {}
}
export const updatePosSettings = async (branchId, patch) => {
  const res = await api.put('/api/pos/settings', patch, { params: { branchId } })
  return toObject(res.data) || {}
}

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

// Expense lifecycle: draft --approve--> approved --settle--> settled.
// These are state MOVES, not field edits, which is why each is its own POST
// rather than a Status on the update body — the server refuses a Status sent
// through the CRUD path precisely so the approval gate cannot be skipped.
export const approveExpense = async (id) => {
  const res = await api.post(`/api/pos/expenses/${id}/approve`)
  return toObject(res.data)
}
export const rejectExpense = async (id) => {
  const res = await api.post(`/api/pos/expenses/${id}/reject`)
  return toObject(res.data)
}
/** Settling is the only step that posts to the ledger. */
export const settleExpense = async (id, PaymentModeId) => {
  const res = await api.post(`/api/pos/expenses/${id}/settle`, PaymentModeId ? { PaymentModeId } : {})
  return toObject(res.data)
}

// ── Expense categories (master) ─────────────────────────────────────────────
// Spend reports group by category id, never by whatever spelling was typed.
export const getExpenseCategories = async (params = {}) => {
  const res = await api.get('/api/expense-categories', { params: { limit: MAX_LIMIT, ...params } })
  return toArray(res.data)
}

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

// ── Payment modes (tender types) ────────────────────────────────────────────
export const getPaymentModes = async () => {
  const res = await api.get('/api/paymentmodes', { params: { limit: MAX_LIMIT } })
  return toArray(res.data)
}

// ── Accounting ledger ───────────────────────────────────────────────────────
// Settled bills as numbered documents. Read-only: a settled document is
// corrected by refund, never by editing.
export const getLedgerDocuments = async (params = {}) => {
  const res = await api.get('/api/ledger/documents', { params })
  return toArray(res.data)
}
export const getLedgerDocument = async (id) => {
  const res = await api.get(`/api/ledger/documents/${id}`)
  return toObject(res.data)
}
export const refundLedgerDocument = async (id, Reason) => {
  const res = await api.post(`/api/ledger/documents/${id}/refund`, { Reason })
  return toObject(res.data)
}

// ── Financial reports ───────────────────────────────────────────────────────
// Every report shares ONE query contract — preset | fromDate/toDate, bucket,
// branchId — because daily, last-3, weekend-only and custom are the same query
// with different bounds, not seven different reports. Mirrors the server's
// utils/dateRange resolver exactly; sending anything outside its whitelist is
// rejected by Joi rather than silently ignored.
//
// @param {Object} range - { preset, fromDate, toDate, bucket, branchId, ... }
const ledgerReport = (name) => async (range = {}) => {
  const res = await api.get(`/api/ledger/reports/${name}`, { params: range })
  return toObject(res.data)
}

/** Earned, collected, spent and what is left — the daily cash-flow question. */
export const getFinanceOverview = ledgerReport('overview')
/** Invoiced vs collected vs outstanding, plus a bucketed trend. */
export const getSalesReport = ledgerReport('sales')
/** Quantity sold, revenue and discount PER PRODUCT. */
export const getProductReport = ledgerReport('products')
/** Unbilled rounds (operational) and unpaid documents (financial). */
export const getPendingReport = ledgerReport('pending')
/** Tender mix — the Z-report. Refunds and expenses net out. */
export const getTenderReport = ledgerReport('tenders')
/** Money in / out / net per asset account. */
export const getCashFlowReport = ledgerReport('cashflow')
/** Spend by category, from settled expense documents only. */
export const getExpenseReport = ledgerReport('expenses')
// Revenue by floor and by table, read from the venue snapshot frozen on each
// round — so a rearranged floor plan cannot rewrite last month's numbers.
export const getVenueReport = ledgerReport('venue')
// What was given away, split into per-dish decisions and bill-wide reductions.
export const getDiscountReport = ledgerReport('discounts')
/** Revenue by where the sale happened: dine-in, counter, delivery. */
const getChannelRevenue = ledgerReport('channels')

/** How the counter queue performed — issued, served, and how long people waited. */
export const getTokenStats = async (range = {}) => {
  const res = await api.get('/api/pos/tokens/stats', { params: range })
  return toObject(res.data)
}

/**
 * The Channels tab: revenue by channel, with counter queue performance beside it.
 *
 * Two sources on purpose. Revenue comes from the ledger, because that is where
 * money is true; wait times come from pos_token, because a token is operational
 * state and the reporting engine does not read operational tables. Composing
 * them here keeps that separation on the server while the screen still asks one
 * question.
 *
 * The queue half degrades to null rather than failing the tab: it is gated on
 * POS scopes, and a finance user without them should still see the money.
 */
export const getChannelReport = async (range = {}) => {
  const [channels, queue] = await Promise.all([
    getChannelRevenue(range),
    getTokenStats(range).catch(() => null),
  ])
  return { ...channels, queue }
}

// ── Cash sessions (till shifts) ─────────────────────────────────────────────
// One session per cashier per shift. Expected cash is DERIVED by the server
// from the ledger — the client never computes or sends it, or the variance
// would mean nothing.
export const getCashSessions = async (params = {}) => {
  const res = await api.get('/api/pos/cash-sessions', { params })
  return toArray(res.data)
}
export const getCashSession = async (id) => {
  const res = await api.get(`/api/pos/cash-sessions/${id}`)
  return toObject(res.data)
}
/** Live expected cash for an open till — the mid-shift check. */
export const getCashSessionSummary = async (id) => {
  const res = await api.get(`/api/pos/cash-sessions/${id}/summary`)
  return toObject(res.data)
}
export const openCashSession = async (data) => {
  const res = await api.post('/api/pos/cash-sessions/open', data)
  return toObject(res.data)
}
/** Only CountedCash is sent. Expected and Variance come back from the server. */
export const closeCashSession = async (id, data) => {
  const res = await api.post(`/api/pos/cash-sessions/${id}/close`, data)
  return toObject(res.data)
}

// ── Asset register ──────────────────────────────────────────────────────────
export const getAssets = async (params = {}) => {
  const res = await api.get('/api/assets', { params })
  return toArray(res.data)
}
export const getAssetSummary = async () => {
  const res = await api.get('/api/assets/summary')
  return toObject(res.data)
}
export const createAsset = async (data) => {
  const res = await api.post('/api/assets', data)
  return toObject(res.data)
}
export const updateAsset = async (id, data) => {
  const res = await api.put(`/api/assets/${id}`, data)
  return toObject(res.data)
}
export const deleteAsset = async (id) => api.delete(`/api/assets/${id}`)

export const getAssetCategories = async (params = {}) => {
  const res = await api.get('/api/asset-categories', { params: { limit: MAX_LIMIT, ...params } })
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

// ── Dashboard aggregate ──────────────────────────────────────────────────────
// Reads the server's aggregation (GET /api/pos/reports) and flattens it for the
// KPI cards, rather than re-deriving the numbers in the browser.
//
// The old implementation fanned out to four list endpoints and aggregated here,
// and every one of its figures was wrong in a different way:
//   - Pending KOTs compared `k.Status !== 'Ready'` with strict !== against a
//     server that only ever writes 'ready', so the count only ever went up.
//   - Every KPI was computed over a single page capped at 100 rows.
//   - "Today" was a UTC date boundary, off by 5h30m for an IST outlet.
//   - Revenue summed pos_bill.Total, the source the backend abandoned as
//     unreliable in favour of the ledger.
//   - Promise.allSettled turned a 403 into "₹0" with no error shown at all.
// Sharing the Reports page's endpoint also means the two screens cannot disagree.
export const getDashboardStats = async () => {
  const summary = await getReports()
  const today = summary?.today || {}
  const tables = summary?.tables || {}

  return {
    todayOrders: Number(today.orders) || 0,
    todayRevenue: Number(today.revenue) || 0,
    totalTables: Number(tables.total) || 0,
    occupiedTables: Number(tables.occupied) || 0,
    pendingKots: Number(today.pendingKots) || 0,
    recentOrders: (summary?.recentOrders || []).slice(0, 5),
  }
}

const posService = {
  getFloors, createFloor, updateFloor, deleteFloor,
  getTables, createTable, updateTable, deleteTable,
  getItemMeta, createItemMeta, updateItemMeta, deleteItemMeta,
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getOrders, getOrder, getOrderDetail, createOrder, updateOrder, deleteOrder, transferOrder, fireKot,
  getKots, createKot, updateKot, markKotReady, deleteKot,
  getBills, getBill, createBill, updateBill, settleBill, deleteBill,
  getOnlineOrders, createOnlineOrder, updateOnlineOrder, deleteOnlineOrder,
  getFeedback, createFeedback, updateFeedback, deleteFeedback,
  getTokens, createToken, updateToken, deleteToken, callToken, serveToken,
  getPosBranches, getPosSettings, updatePosSettings,
  getExpenses, createExpense, updateExpense, deleteExpense,
  approveExpense, rejectExpense, settleExpense, getExpenseCategories,
  getStaff, createStaff, updateStaff, deleteStaff,
  getVariants,
  getPaymentModes,
  getLedgerDocuments, getLedgerDocument, refundLedgerDocument,
  getFinanceOverview, getSalesReport, getProductReport, getPendingReport,
  getTenderReport, getCashFlowReport, getExpenseReport,
  getVenueReport, getDiscountReport, getChannelReport, getTokenStats,
  getCashSessions, getCashSession, getCashSessionSummary,
  openCashSession, closeCashSession,
  getAssets, getAssetSummary, createAsset, updateAsset, deleteAsset, getAssetCategories,
  quotePricing,
  getDashboardStats,
  getReports,
  genericGet, genericPost, genericPut, genericDelete,
  getAdminRoles, getAdminUsers, getItemDetail, getInventoryEndpoint,
}

export default posService
