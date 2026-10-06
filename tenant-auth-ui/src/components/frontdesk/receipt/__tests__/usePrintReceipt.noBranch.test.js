import React from 'react'
import { render, waitFor } from '@testing-library/react'
import usePrintReceipt from '../usePrintReceipt'
import posService from '../../../../services/posService'

jest.mock('../../../../services/posService', () => ({
  __esModule: true,
  default: { getReceiptFormat: jest.fn(), getBranchMedia: jest.fn() },
}))

// No format means no masthead, never a null one: every renderer reads fields
// straight off `shop`, and a null crashed the till on Print.
const mount = async (branchId) => {
  let api
  const Harness = () => { api = usePrintReceipt(branchId); return null }
  render(<Harness />)
  await waitFor(() => expect(api.ready).toBe(true))
  return () => api
}

beforeEach(() => jest.clearAllMocks())

test('with no branch to read a format for, shop is an empty masthead', async () => {
  const api = await mount(null)
  expect(api().shop).toEqual({})
  expect(posService.getReceiptFormat).not.toHaveBeenCalled()
})

test('when the format cannot be read, shop is still an empty masthead', async () => {
  posService.getReceiptFormat.mockRejectedValue(new Error('down'))
  const api = await mount('b1')
  expect(api().shop).toEqual({})
})

test('the empty masthead is the same object every render', async () => {
  const api = await mount(null)
  const first = api().shop
  expect(api().shop).toBe(first)
})
