import * as posService from '../posService'

// Mock the axios instance so posService never hits network
jest.mock('../../api/api', () => ({
  get:    jest.fn(),
  post:   jest.fn(),
  put:    jest.fn(),
  patch:  jest.fn(),
  delete: jest.fn(),
}))

import api from '../../api/api'

const ok = (data) => Promise.resolve({ data })

beforeEach(() => jest.clearAllMocks())

// ── getFloors ────────────────────────────────────────────────────────────────
describe('posService.getFloors', () => {
  test('returns array when data.data is array', async () => {
    api.get.mockResolvedValue({ data: { data: [{ Id: '1', Name: 'Ground' }] } })
    const result = await posService.getFloors()
    expect(result).toEqual([{ Id: '1', Name: 'Ground' }])
    expect(api.get).toHaveBeenCalledWith('/api/pos/floors', { params: {} })
  })

  test('returns array when data.message is array', async () => {
    api.get.mockResolvedValue({ data: { message: [{ Id: '2', Name: 'Rooftop' }] } })
    const result = await posService.getFloors()
    expect(result).toEqual([{ Id: '2', Name: 'Rooftop' }])
  })

  test('returns empty array when response is empty', async () => {
    api.get.mockResolvedValue({ data: {} })
    const result = await posService.getFloors()
    expect(result).toEqual([])
  })
})

// ── getTables ─────────────────────────────────────────────────────────────────
describe('posService.getTables', () => {
  test('passes params to GET /api/pos/tables', async () => {
    api.get.mockResolvedValue({ data: { data: [] } })
    await posService.getTables({ limit: 50 })
    expect(api.get).toHaveBeenCalledWith('/api/pos/tables', { params: { limit: 50 } })
  })
})

// ── createOrder ───────────────────────────────────────────────────────────────
describe('posService.createOrder', () => {
  test('POSTs to /api/pos/orders and returns object', async () => {
    const created = { Id: 'ord-1', OrderNo: 'ORD-001' }
    api.post.mockResolvedValue({ data: { data: created } })
    const result = await posService.createOrder({ OrderNo: 'ORD-001' })
    expect(api.post).toHaveBeenCalledWith('/api/pos/orders', { OrderNo: 'ORD-001' })
    expect(result).toEqual(created)
  })
})

// ── fireKot ───────────────────────────────────────────────────────────────────
describe('posService.fireKot', () => {
  test('POSTs to /api/pos/orders/:id/fire-kot', async () => {
    api.post.mockResolvedValue({ data: { data: { KotId: 'k1' } } })
    await posService.fireKot('ord-1')
    expect(api.post).toHaveBeenCalledWith('/api/pos/orders/ord-1/fire-kot')
  })
})

// ── markKotReady ──────────────────────────────────────────────────────────────
describe('posService.markKotReady', () => {
  test('PATCHes to /api/pos/kots/:id/ready', async () => {
    api.patch.mockResolvedValue({ data: { data: { Status: 'Ready' } } })
    await posService.markKotReady('kot-1')
    expect(api.patch).toHaveBeenCalledWith('/api/pos/kots/kot-1/ready')
  })
})

// ── settleBill ────────────────────────────────────────────────────────────────
describe('posService.settleBill', () => {
  test('POSTs to /api/pos/bills/:id/settle with payload', async () => {
    api.post.mockResolvedValue({ data: { data: { Status: 'Settled' } } })
    const payload = { Payments: [{ method: 'Cash', amount: 500 }] }
    await posService.settleBill('bill-1', payload)
    expect(api.post).toHaveBeenCalledWith('/api/pos/bills/bill-1/settle', payload)
  })
})

// ── getReports ────────────────────────────────────────────────────────────────
describe('posService.getReports', () => {
  test('GETs /api/pos/reports and returns object', async () => {
    const report = { today: { orders: 5, revenue: 2500 } }
    api.get.mockResolvedValue({ data: { data: report } })
    const result = await posService.getReports({ days: 7 })
    expect(api.get).toHaveBeenCalledWith('/api/pos/reports', { params: { days: 7 } })
    expect(result).toEqual(report)
  })
})

// ── genericGet / genericPost / genericPut / genericDelete ─────────────────────
describe('posService generic helpers', () => {
  test('genericGet calls api.get with endpoint and params', async () => {
    api.get.mockResolvedValue({ data: { data: [] } })
    await posService.genericGet('/api/pos/floors', { page: 1 })
    expect(api.get).toHaveBeenCalledWith('/api/pos/floors', { params: { page: 1 } })
  })

  test('genericPost calls api.post', async () => {
    api.post.mockResolvedValue({ data: { data: { Id: 'x' } } })
    await posService.genericPost('/api/pos/floors', { Name: 'A' })
    expect(api.post).toHaveBeenCalledWith('/api/pos/floors', { Name: 'A' })
  })

  test('genericPut calls api.put', async () => {
    api.put.mockResolvedValue({ data: { data: {} } })
    await posService.genericPut('/api/pos/floors/x', { Name: 'B' })
    expect(api.put).toHaveBeenCalledWith('/api/pos/floors/x', { Name: 'B' })
  })

  test('genericDelete calls api.delete', async () => {
    api.delete.mockResolvedValue({ data: { message: 'deleted' } })
    await posService.genericDelete('/api/pos/floors/x')
    expect(api.delete).toHaveBeenCalledWith('/api/pos/floors/x')
  })
})

// ── getDashboardStats ─────────────────────────────────────────────────────────
// The dashboard reads the server's aggregation instead of re-deriving the
// numbers from four list endpoints in the browser. That old approach got every
// figure wrong in a different way — most visibly Pending KOTs, which compared
// `Status !== 'Ready'` against a server that only writes 'ready', so the count
// went up forever and never came back down.
describe('posService.getDashboardStats', () => {
  const summary = {
    today: { orders: 4, revenue: 2500, pendingKots: 1 },
    tables: { total: 2, occupied: 1 },
    recentOrders: [
      { Id: 'o1', OrderNo: 'ORD-0002', Status: 'fired', TableName: 'T1' },
      { Id: 'o2', OrderNo: 'ORD-0001', Status: 'closed', TableName: 'T1' },
    ],
  }

  test('reads the aggregate off /api/pos/reports', async () => {
    api.get.mockResolvedValue({ data: { data: summary } })
    const stats = await posService.getDashboardStats()

    expect(api.get).toHaveBeenCalledWith('/api/pos/reports', expect.anything())
    expect(stats.todayOrders).toBe(4)
    expect(stats.todayRevenue).toBe(2500)
    expect(stats.totalTables).toBe(2)
    expect(stats.occupiedTables).toBe(1)
    expect(stats.pendingKots).toBe(1)
    expect(stats.recentOrders).toHaveLength(2)
  })

  test('does not fan out to the paginated list endpoints', async () => {
    // Those pages are capped at 100 rows, so counting over them under-reported
    // the moment an outlet passed 100 orders in a day.
    api.get.mockResolvedValue({ data: { data: summary } })
    await posService.getDashboardStats()

    expect(api.get.mock.calls.map(([url]) => url)).toEqual(['/api/pos/reports'])
  })

  test('surfaces a failure rather than rendering zeroes', async () => {
    // Promise.allSettled used to turn a 403 into "Today's Revenue: ₹0" with no
    // error at all — a number that looks like a fact but is an outage.
    api.get.mockRejectedValue(new Error('network error'))
    await expect(posService.getDashboardStats()).rejects.toThrow('network error')
  })

  test('zeroes only what the server genuinely omitted', async () => {
    api.get.mockResolvedValue({ data: { data: {} } })
    const stats = await posService.getDashboardStats()
    expect(stats.todayOrders).toBe(0)
    expect(stats.todayRevenue).toBe(0)
    expect(stats.pendingKots).toBe(0)
    expect(stats.recentOrders).toEqual([])
  })
})
