import api from '../../api/api'
import { getAllItemMeta } from '../posService'

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }))

const page = (n, count, totalPages) => ({
  data: { data: Array.from({ length: count }, (_, i) => ({ Id: `m${n}-${i}` })), pagination: { page: n, totalPages } },
})

test('loads every page of the menu, not just the first 100', async () => {
  api.get
    .mockResolvedValueOnce(page(1, 100, 5))
    .mockResolvedValueOnce(page(2, 100, 5))
    .mockResolvedValueOnce(page(3, 100, 5))
    .mockResolvedValueOnce(page(4, 100, 5))
    .mockResolvedValueOnce(page(5, 67, 5))
  const menu = await getAllItemMeta()
  expect(menu).toHaveLength(467)
  expect(api.get).toHaveBeenCalledTimes(5)
  expect(api.get).toHaveBeenLastCalledWith('/api/pos/item-meta', { params: { page: 5, limit: 100 } })
})

test('stops after one request for a small menu', async () => {
  api.get.mockResolvedValueOnce(page(1, 31, 1))
  expect(await getAllItemMeta()).toHaveLength(31)
  expect(api.get).toHaveBeenCalledTimes(1)
})
