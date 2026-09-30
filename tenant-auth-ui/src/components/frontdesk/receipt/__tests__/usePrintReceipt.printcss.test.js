import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import usePrintReceipt from '../usePrintReceipt'
import posService from '../../../../services/posService'

jest.mock('../../../../services/posService', () => ({
  __esModule: true,
  default: { getReceiptFormat: jest.fn(), getBranchMedia: jest.fn() },
}))

// Every print rule in receipt.css is scoped under body.rc-printing, and
// .rc-root is `display: none` without it. If the class is gone when the dialog
// opens, the browser prints a blank sheet at the default page size — which is
// exactly what a user sees as "1 page", empty.
const FORMAT = (n) => ({
  shop: { name: 'Sarjapura Foods' },
  documents: { bill: { paperWidth: '80', copies: '1' } },
  _v: n,
})

const Harness = ({ onReady }) => {
  const api = usePrintReceipt('b1')
  onReady(api)
  // The receipt the print effect waits for before calling window.print().
  return api.job ? <div className="rc-root"><div className="rc-paper">BILL</div></div> : null
}

const mount = async () => {
  let api
  render(<Harness onReady={(a) => { api = a }} />)
  await waitFor(() => expect(api.ready).toBe(true))
  return () => api
}

beforeEach(() => {
  jest.clearAllMocks()
  document.body.classList.remove('rc-printing')
  document.getElementById('rc-page-size')?.remove()
  posService.getReceiptFormat.mockResolvedValue(FORMAT(1))
  posService.getBranchMedia.mockResolvedValue({ dataUri: '' })
  window.print = jest.fn()
})

describe('the print stylesheet survives until the dialog is done', () => {
  test('the class and the page size are in place when print() is called', async () => {
    const api = await mount()
    await act(async () => { await api().print('bill', { TransactionNo: 'INV-1' }) })

    await waitFor(() => expect(window.print).toHaveBeenCalled())
    expect(document.body.classList.contains('rc-printing')).toBe(true)
    expect(document.getElementById('rc-page-size').textContent).toContain('80mm')
  })

  // THE REGRESSION. The hook refreshes the format on window focus, and opening
  // the print dialog moves focus — so setFormat landed mid-dialog, the effect
  // re-ran on the new object identity, and its cleanup stripped the print CSS.
  test('a format refresh while the dialog is open does not strip it', async () => {
    const api = await mount()
    await act(async () => { await api().print('bill', { TransactionNo: 'INV-1' }) })
    await waitFor(() => expect(window.print).toHaveBeenCalled())

    // A new format object arrives, exactly as the focus listener delivers one.
    posService.getReceiptFormat.mockResolvedValue(FORMAT(2))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })
    await waitFor(() => expect(posService.getReceiptFormat).toHaveBeenCalledTimes(2))

    // Still printable: without the class the sheet is blank at A4.
    expect(document.body.classList.contains('rc-printing')).toBe(true)
    expect(document.getElementById('rc-page-size')).not.toBeNull()
  })

  test('afterprint clears it, so the app is not left hidden', async () => {
    const api = await mount()
    await act(async () => { await api().print('bill', { TransactionNo: 'INV-1' }) })
    await waitFor(() => expect(window.print).toHaveBeenCalled())

    await act(async () => { window.dispatchEvent(new Event('afterprint')) })
    await waitFor(() => expect(document.body.classList.contains('rc-printing')).toBe(false))
  })
})
