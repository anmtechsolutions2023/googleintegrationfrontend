import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ExportButton from '../ExportButton'
import exportService, { getExports } from '../../../services/exportService'
import posService from '../../../services/posService'
import { toast } from 'react-toastify'

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { tid: 't1', scopes: ['TENANT:ADMIN'] } }),
}))
jest.mock('../../../services/exportService', () => {
  const api = {
    getExports: jest.fn(),
    previewExport: jest.fn(),
    downloadExport: jest.fn(),
    downloadErrorMessage: jest.fn(async (e, fallback) => fallback),
  }
  return { __esModule: true, default: api, ...api }
})
jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { getPosBranches: jest.fn() },
}))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const LEDGER = {
  key: 'ledger-documents', label: 'Ledger — documents', where: 'Money › Ledger',
  grain: 'one document', pii: false, dated: true, branchable: true, bucketed: false,
  filters: ['type', 'status'],
  groups: [{ key: 'tax', label: 'Tax breakup', default: true }, { key: 'buyer', label: 'Business buyer', default: true }],
  columns: [{ header: 'Date', group: null }, { header: 'Mobile', group: null }],
}
const LINES = { ...LEDGER, key: 'ledger-lines', label: 'Ledger — line items', grain: 'one line', groups: [] }
const CUSTOMERS = {
  ...LEDGER, key: 'customers', label: 'Customers', pii: true, dated: false,
  filters: ['segment'], groups: [], columns: [{ header: 'Mobile', group: 'contact' }],
}

const catalogue = (exports, canUnmask = true) => getExports.mockResolvedValue({ exports, canUnmask })
const PREVIEW = { rowCount: 142, fileName: 'ledger_all-branches_2026-09-07_to_2026-10-06.csv', range: { from: '2026-09-07', to: '2026-10-06' } }

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  posService.getPosBranches.mockResolvedValue([{ Id: 'b1', BranchName: 'Indiranagar' }])
  exportService.previewExport.mockResolvedValue(PREVIEW)
})
afterEach(() => jest.useRealTimers())

/** Lets the debounced preview fire and settle. */
const settle = async () => {
  await act(async () => { jest.advanceTimersByTime(350) })
  await act(async () => {})
}

test('is not drawn for an export the server does not offer', async () => {
  catalogue([LINES])
  const { container } = render(<ExportButton exportKey="customers" />)
  await act(async () => {})
  expect(container).toBeEmptyDOMElement()
})

test('opens the dialog with the screen\'s filters and counts the rows first', async () => {
  catalogue([LEDGER])
  render(
    <ExportButton
      exportKey="ledger-documents"
      context={{ preset: 'custom', fromDate: '2026-10-01', toDate: '2026-10-06', filters: { status: 'SETTLED', type: undefined }, filterLabels: ['Status: SETTLED'] }}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }))
  await settle()

  expect(exportService.previewExport).toHaveBeenLastCalledWith('ledger-documents', {
    preset: 'custom', fromDate: '2026-10-01', toDate: '2026-10-06', groups: 'tax,buyer', status: 'SETTLED',
  })
  expect(screen.getByText(PREVIEW.fileName)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Download 142 rows' })).toBeEnabled()
  expect(screen.getByText(/As filtered on screen/)).toHaveTextContent('Status: SETTLED')
})

test('can export the whole period instead of the filtered rows, and drop a column group', async () => {
  catalogue([LEDGER])
  render(<ExportButton exportKey="ledger-documents" context={{ preset: 'month', filters: { status: 'SETTLED' } }} />)
  fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }))
  await settle()

  fireEvent.click(screen.getByLabelText('Everything in the period'))
  fireEvent.click(screen.getByLabelText('Business buyer'))
  await settle()
  expect(exportService.previewExport).toHaveBeenLastCalledWith('ledger-documents', { preset: 'month', groups: 'tax' })
})

test('downloads with the same query, then closes', async () => {
  catalogue([LEDGER])
  exportService.downloadExport.mockResolvedValue('ledger.csv')
  render(<ExportButton exportKey="ledger-documents" context={{ preset: 'month' }} />)
  fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }))
  await settle()

  fireEvent.click(screen.getByRole('button', { name: 'Download 142 rows' }))
  await waitFor(() => expect(exportService.downloadExport).toHaveBeenCalledWith('ledger-documents', { preset: 'month', groups: 'tax,buyer' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Downloaded ledger.csv'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

test('will not offer a download of nothing', async () => {
  catalogue([LEDGER])
  exportService.previewExport.mockResolvedValue({ ...PREVIEW, rowCount: 0 })
  render(<ExportButton exportKey="ledger-documents" />)
  fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }))
  await settle()
  expect(screen.getByRole('button', { name: 'No rows to export' })).toBeDisabled()
})

test('masks mobiles unless an allowed person turns it off', async () => {
  catalogue([LEDGER], true)
  render(<ExportButton exportKey="ledger-documents" />)
  fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }))
  await settle()
  const mask = screen.getByLabelText(/Mask mobile numbers/)
  expect(mask).toBeChecked()
  fireEvent.click(mask)
  await settle()
  expect(exportService.previewExport.mock.calls.at(-1)[1]).toMatchObject({ unmask: true })
})

test('tells someone who cannot un-mask that mobiles are masked, with no switch', async () => {
  catalogue([LEDGER], false)
  render(<ExportButton exportKey="ledger-documents" />)
  fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }))
  await settle()
  expect(screen.queryByLabelText(/Mask mobile numbers/)).toBeNull()
  expect(screen.getByText(/Mobile numbers are masked/)).toBeInTheDocument()
})

test('warns before personal data leaves', async () => {
  catalogue([CUSTOMERS])
  render(<ExportButton exportKey="customers" />)
  fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }))
  await settle()
  expect(screen.getByRole('note')).toHaveTextContent('This file holds personal data')
  // Undated: no period to pick.
  expect(screen.queryByText('Last 30 days')).toBeNull()
})

test('offers several files as a menu, limited to the ones allowed', async () => {
  catalogue([LEDGER, LINES])
  render(<ExportButton exportKey={['ledger-documents', 'ledger-lines', 'payments']} />)
  fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }))
  const items = screen.getAllByRole('menuitem')
  expect(items.map((i) => i.querySelector('b').textContent)).toEqual(['Ledger — documents', 'Ledger — line items'])
  fireEvent.click(items[1])
  await settle()
  expect(screen.getByRole('dialog')).toHaveTextContent('Export Ledger — line items')
})
