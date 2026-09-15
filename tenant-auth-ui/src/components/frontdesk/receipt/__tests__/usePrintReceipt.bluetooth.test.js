import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import usePrintReceipt from '../usePrintReceipt'
import posService from '../../../../services/posService'
import { getPrinterMode, sendToPrinter, PrinterError } from '../../../../utils/bluetoothPrinter'

jest.mock('../../../../services/posService', () => ({
  __esModule: true,
  default: { getReceiptFormat: jest.fn() },
}))
jest.mock('../../../../utils/bluetoothPrinter', () => ({
  ...jest.requireActual('../../../../utils/bluetoothPrinter'),
  getPrinterMode: jest.fn(),
  sendToPrinter: jest.fn(),
}))

const Harness = ({ onReady }) => {
  const api = usePrintReceipt('b1')
  onReady(api)
  return api.job ? <div className="rc-root"><div className="rc-paper">receipt</div></div> : null
}

// Prints only once the branch format has arrived, as the till does.
const mount = async () => {
  let api
  render(<Harness onReady={(a) => { api = a }} />)
  await waitFor(() => expect(api.ready).toBe(true))
  return () => api
}

const text = (bytes) => String.fromCharCode(...Array.from(bytes).filter((b) => b >= 0x20 && b < 0x7f))

beforeEach(() => {
  jest.clearAllMocks()
  posService.getReceiptFormat.mockResolvedValue({
    shop: { name: 'Sarjapura Foods', gstin: '29AABCS1429B1ZQ' },
    documents: { bill: { copies: '1', paperWidth: '58' } },
  })
})

describe('printing to a Bluetooth printer', () => {
  test('sends ESC/POS bytes built from the branch format, and never opens the dialog', async () => {
    getPrinterMode.mockReturnValue('bluetooth')
    sendToPrinter.mockResolvedValue()
    const api = await mount()

    let ok
    await act(async () => { ok = await api().print('bill', { TransactionNo: 'INV-0009', GrossAmount: 99, Lines: [] }) })

    expect(ok).toBe(true)
    expect(sendToPrinter).toHaveBeenCalledTimes(1)
    const sent = text(sendToPrinter.mock.calls[0][0])
    expect(sent).toContain('SARJAPURA FOODS')
    expect(sent).toContain('INV-0009')
    // No job means no receipt in the page and no print dialog.
    expect(api().job).toBeNull()
  })

  test('a serial printer is printed to the same way', async () => {
    getPrinterMode.mockReturnValue('serial')
    sendToPrinter.mockResolvedValue()
    const api = await mount()

    await act(async () => { await api().print('bill', { TransactionNo: 'INV-0010', GrossAmount: 10, Lines: [] }) })
    expect(sendToPrinter).toHaveBeenCalledTimes(1)
    expect(api().job).toBeNull()
  })

  test('a printer that cannot be reached is reported with the reason', async () => {
    getPrinterMode.mockReturnValue('bluetooth')
    sendToPrinter.mockRejectedValue(new PrinterError('notConnected', 'The Bluetooth printer is not connected.'))
    const api = await mount()

    await act(async () => { await api().print('kot', { KotNo: 'KOT-1', Lines: [] }) })
    expect(api().failed).toBe('kot')
    expect(api().failedReason).toBe('The Bluetooth printer is not connected.')

    act(() => api().clearFailed())
    expect(api().failed).toBeNull()
    expect(api().failedReason).toBeNull()
  })

  test('on a device set to the print dialog nothing changes', async () => {
    getPrinterMode.mockReturnValue('browser')
    const api = await mount()
    await act(async () => { api().print('bill', { TransactionNo: 'INV-1', Lines: [] }) })
    expect(sendToPrinter).not.toHaveBeenCalled()
    expect(api().job).toMatchObject({ doc: 'bill' })
  })
})
