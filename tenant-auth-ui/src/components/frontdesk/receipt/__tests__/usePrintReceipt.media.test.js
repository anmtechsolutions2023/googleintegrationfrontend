import React from 'react'
import { render, waitFor } from '@testing-library/react'
import usePrintReceipt from '../usePrintReceipt'
import posService from '../../../../services/posService'

jest.mock('../../../../services/posService', () => ({
  __esModule: true,
  default: { getReceiptFormat: jest.fn(), getBranchMedia: jest.fn() },
}))

const QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='

const Harness = ({ onReady }) => {
  const api = usePrintReceipt('b1')
  onReady(api)
  return null
}

const mount = async () => {
  let api
  render(<Harness onReady={(a) => { api = a }} />)
  await waitFor(() => expect(api.ready).toBe(true))
  return () => api
}

beforeEach(() => {
  jest.clearAllMocks()
  posService.getReceiptFormat.mockResolvedValue({
    shop: {
      name: 'Sarjapura Foods',
      // What shopOf emits: an API PATH, which is not something an <img> can draw.
      paymentQrUrl: '/api/pos/media/paymentQr?branchId=b1',
      logoUrl: '',
    },
    documents: { bill: { copies: '1', paperWidth: '80' } },
  })
  posService.getBranchMedia.mockResolvedValue({ kind: 'paymentQr', dataUri: QR })
})

describe('the images a bill carries', () => {
  // The bug: the QR was configured, "Scan to pay" printed, and the bill had a
  // blank gap where the code should be. The path is relative, authenticated and
  // answers JSON — an <img> pointed at it can never load.
  test('the API path is exchanged for bytes the renderer can actually draw', async () => {
    const api = await mount()

    await waitFor(() => expect(api().shop.paymentQrUrl).toBe(QR))
    expect(posService.getBranchMedia).toHaveBeenCalledWith('b1', 'paymentQr')
    expect(api().shop.paymentQrUrl).not.toMatch(/^\/api\//)
    // The rest of the masthead is untouched.
    expect(api().shop.name).toBe('Sarjapura Foods')
  })

  test('a kind the branch does not hold is never fetched', async () => {
    const api = await mount()

    await waitFor(() => expect(api().shop.paymentQrUrl).toBe(QR))
    expect(posService.getBranchMedia).toHaveBeenCalledTimes(1)
    expect(api().shop.logoUrl).toBe('')
  })

  test('an image that fails to load costs the bill nothing', async () => {
    posService.getBranchMedia.mockRejectedValue(new Error('offline'))
    const api = await mount()

    await waitFor(() => expect(posService.getBranchMedia).toHaveBeenCalled())
    // Empty, never the unusable path: the renderers gate on the value, so this
    // prints a bill with no QR rather than a broken image under "Scan to pay".
    await waitFor(() => expect(api().shop.paymentQrUrl).toBe(''))
    expect(api().shop.name).toBe('Sarjapura Foods')
  })
})
