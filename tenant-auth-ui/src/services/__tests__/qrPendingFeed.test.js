import qrService from '../qrService'
import { subscribe, reset, POLL_MS } from '../qrPendingFeed'

jest.mock('../qrService', () => ({ __esModule: true, default: { getPendingOrders: jest.fn() } }))

beforeEach(() => {
  jest.useFakeTimers()
  reset()
  qrService.getPendingOrders.mockResolvedValue([{ id: 'o1', tableId: 't1' }])
})
afterEach(() => jest.useRealTimers())

test('the banner and the till share one poll', async () => {
  const banner = jest.fn()
  const till = jest.fn()
  const offBanner = subscribe(banner)
  const offTill = subscribe(till)
  await Promise.resolve(); await Promise.resolve()
  expect(qrService.getPendingOrders).toHaveBeenCalledTimes(1)

  jest.advanceTimersByTime(POLL_MS)
  await Promise.resolve(); await Promise.resolve()
  expect(qrService.getPendingOrders).toHaveBeenCalledTimes(2)
  expect(till).toHaveBeenLastCalledWith([{ id: 'o1', tableId: 't1' }])
  expect(banner).toHaveBeenLastCalledWith([{ id: 'o1', tableId: 't1' }])

  offBanner(); offTill()
  jest.advanceTimersByTime(POLL_MS * 3)
  expect(qrService.getPendingOrders).toHaveBeenCalledTimes(2)
})
