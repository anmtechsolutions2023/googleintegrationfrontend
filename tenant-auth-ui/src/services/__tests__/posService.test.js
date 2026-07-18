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
describe('posService.getDashboardStats', () => {
  test('returns zeroed stats when all endpoints fail', async () => {
    api.get.mockRejectedValue(new Error('network error'))
    const stats = await posService.getDashboardStats()
    expect(stats.todayOrders).toBe(0)
    expect(stats.todayRevenue).toBe(0)
    expect(stats.pendingKots).toBe(0)
  })

  test('counts today orders correctly', async () => {
    const today = new Date().toISOString()
    api.get.mockImplementation((url) => {
      if (url === '/api/pos/orders')
        return ok({ data: [{ CreatedOn: today, Status: 'Active' }] })
      if (url === '/api/pos/bills')
        return ok({ data: [{ CreatedOn: today, SettledAt: today, Total: 500, Status: 'Settled' }] })
      if (url === '/api/pos/tables')
        return ok({ data: [{ Status: 'Occupied' }, { Status: 'Available' }] })
      if (url === '/api/pos/kots')
        return ok({ data: [{ Status: 'Pending' }] })
      return ok({ data: [] })
    })
    const stats = await posService.getDashboardStats()
    expect(stats.todayOrders).toBe(1)
    expect(stats.totalTables).toBe(2)
    expect(stats.occupiedTables).toBe(1)
    expect(stats.pendingKots).toBe(1)
  })
})
