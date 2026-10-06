import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dues from '../Dues'
import posService from '../../../services/posService'

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getDues: jest.fn(),
    collectLedgerPayment: jest.fn(),
    writeOffLedgerBalance: jest.fn(),
    setLedgerDebtor: jest.fn(),
    getBranchPaymentMethods: jest.fn(),
    getPaymentModes: jest.fn(),
    getWriteOffs: jest.fn(),
    getLedgerDocument: jest.fn(),
    getPosBranches: jest.fn(),
  },
}))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() } }))
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }))
const { useAuth } = require('../../../context/AuthContext')
const asUser = (scopes) => useAuth.mockReturnValue({ user: { tid: 't1', onboardingStatus: 'APPROVED', scopes } })

const DUES = {
  summary: {
    outstanding: 408, count: 2, oldestDays: 23, oldestNo: 'INV-0412', oldestName: 'P. Nair',
    buckets: { all: 2, today: 1, week: 0, month: 1, older: 0 },
  },
  documents: [
    {
      Id: 'a', TransactionNo: 'INV-0412', TransactionDate: '2026-09-10', AgeDays: 23, AgeBucket: 'month',
      CustomerName: 'P. Nair', CustomerMobile: '97000 05532', GrossAmount: 1520, Collected: 1200, Due: 320,
      BranchId: 'br-1', Source: { kind: 'table', label: 'Garden 1' },
    },
    {
      Id: 'c', TransactionNo: 'INV-0002', TransactionDate: '2026-10-03', AgeDays: 0, AgeBucket: 'today',
      CustomerName: null, CustomerMobile: null, HasGuest: false, GrossAmount: 288, Collected: 200, Due: 88,
      BranchId: 'br-1', Source: { kind: 'table', label: 'Marble Table 2' },
    },
  ],
}

beforeEach(() => {
  asUser(['POS_BILLING:READ', 'POS_BILLING:WRITE'])
  posService.getDues.mockResolvedValue(DUES)
  posService.getBranchPaymentMethods.mockResolvedValue({
    methods: [{ paymentModeId: 'pm-cash', type: 'Cash', accountName: 'Cash', enabled: true, active: true }],
  })
  posService.getPaymentModes.mockResolvedValue([])
})

const renderDues = async () => {
  render(<MemoryRouter><Dues /></MemoryRouter>)
  await screen.findAllByText('INV-0412')
}

test('leads with what is owed in total, how many, and the oldest', async () => {
  await renderDues()
  expect(screen.getByText('₹408.00')).toBeInTheDocument()
  expect(screen.getByText('23 days', { selector: '.fd-dues-kpi b' })).toBeInTheDocument()
  expect(screen.getByText('INV-0412 · P. Nair')).toBeInTheDocument()
})

test('filters by how long it has been owed', async () => {
  await renderDues()
  fireEvent.click(screen.getByRole('button', { name: /Today/ }))
  await waitFor(() => expect(posService.getDues).toHaveBeenLastCalledWith({ age: 'today' }))
})

test('collects from a row and reloads', async () => {
  posService.collectLedgerPayment.mockResolvedValue({ transactionNo: 'INV-0002', collected: 88, due: 0, status: 'SETTLED' })
  await renderDues()
  const row = screen.getAllByText('INV-0002')[0].closest('tr')
  fireEvent.click(within(row).getByRole('button', { name: 'Collect' }))
  const sheet = await screen.findByRole('dialog', { name: 'Collect payment' })
  fireEvent.click(await within(sheet).findByRole('button', { name: 'Record ₹88.00 by Cash' }))
  await waitFor(() => expect(posService.collectLedgerPayment).toHaveBeenCalledWith('c', [
    { paymentModeId: 'pm-cash', amount: 88, refNo: null },
  ]))
  await waitFor(() => expect(posService.getDues).toHaveBeenCalledTimes(2))
})

test('a walk-in due can be given a name', async () => {
  posService.setLedgerDebtor.mockResolvedValue({ CustomerName: 'Rahul M.' })
  await renderDues()
  const row = screen.getAllByText('INV-0002')[0].closest('tr')
  fireEvent.click(within(row).getByRole('button', { name: 'Add name' }))
  const dialog = await screen.findByRole('dialog', { name: /Who owes/ })
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Rahul M.' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save name' }))
  await waitFor(() => expect(posService.setLedgerDebtor).toHaveBeenCalledWith('c', { Name: 'Rahul M.', Mobile: null }))
})

test('someone who can only look sees the dues without Collect', async () => {
  asUser(['TRANSACTIONS:READ'])
  await renderDues()
  expect(screen.queryByRole('button', { name: 'Collect' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Add name' })).toBeNull()
})

test('says so when nothing is owed', async () => {
  posService.getDues.mockResolvedValue({ summary: { outstanding: 0, count: 0, buckets: {} }, documents: [] })
  render(<MemoryRouter><Dues /></MemoryRouter>)
  expect(await screen.findByText(/Nothing is owed/)).toBeInTheDocument()
})

// ── Written off ─────────────────────────────────────────────────────────────
// A write-off settles the bill, so it leaves the list above at once. The second
// view keeps the record — for the books and for admins, never for a cashier.

const WO_ROW = (over) => ({
  Id: 'log-x', TransactionNo: 'INV-0000', TransactionDate: '2026-10-04', GrossAmount: 100, Collected: 50,
  Returned: 0, WrittenOff: 50, Reason: 'OTHER', ReasonLabel: 'Other', Note: null,
  WrittenOffAt: '2026-10-04T07:42:00.000Z', WrittenOffByKey: 'm-karan', WrittenOffByName: 'Karan S.',
  OnEarlierBill: false, CustomerName: null, CustomerMobile: null, BranchName: 'Main',
  Source: { kind: 'table', label: 'T3' },
  ...over,
})
const WRITE_OFFS = {
  range: { from: '2026-10-01', to: '2026-10-06', bucket: 'day' },
  summary: {
    WrittenOff: 1305.08, Bills: 5, Average: 261.02, Largest: 1000, LargestNo: 'INV-0006',
    LargestReason: "Staff or owner's guest", OnEarlierBills: 200, EarlierBills: 1,
    OnThisPeriodBills: 1105.08, Invoiced: 184250, ShareOfInvoiced: 0.71,
  },
  byReason: [
    { Code: 'STAFF_GUEST', Label: "Staff or owner's guest", Bills: 1, Amount: 1000, Share: 76.62 },
    { Code: 'CUSTOMER_LEFT', Label: 'Customer left without paying', Bills: 2, Amount: 205.08, Share: 15.71 },
    { Code: 'DISPUTED', Label: 'Disputed item', Bills: 1, Amount: 60, Share: 4.6 },
    { Code: 'OTHER', Label: 'Other', Bills: 1, Amount: 40, Share: 3.06 },
  ],
  byUser: [
    { Key: 'm-karan', Name: 'Karan S.', Bills: 4, Amount: 1105.08, Share: 84.68 },
    { Key: 'former-2', Name: '•••• 2222', Bills: 1, Amount: 200, Share: 15.32 },
  ],
  byDay: [],
  repeats: [],
  documents: [
    WO_ROW({ Id: 'log-9', TransactionNo: 'INV-0009', WrittenOff: 60, Reason: 'DISPUTED', ReasonLabel: 'Disputed item', Note: 'Sent back cold' }),
    WO_ROW({ Id: 'log-6', TransactionNo: 'INV-0006', WrittenOff: 1000, Reason: 'STAFF_GUEST', ReasonLabel: "Staff or owner's guest" }),
    WO_ROW({
      Id: 'log-3', TransactionNo: 'INV-0003', GrossAmount: 15, Collected: 9.92, WrittenOff: 5.08,
      Reason: 'CUSTOMER_LEFT', ReasonLabel: 'Customer left without paying', CustomerName: 'slef',
    }),
    WO_ROW({
      Id: 'log-1', TransactionNo: 'INV-0001', TransactionDate: '2026-09-29', WrittenOff: 200,
      Reason: 'CUSTOMER_LEFT', ReasonLabel: 'Customer left without paying', OnEarlierBill: true,
      WrittenOffByKey: 'former-2', WrittenOffByName: '•••• 2222',
    }),
    WO_ROW({ Id: 'log-2', TransactionNo: 'INV-0002', WrittenOff: 40 }),
  ],
  truncated: false,
}

// Waits for the dues read rather than a row: on the register view the owed
// list is not on screen at all.
const renderAt = async (path = '/money/dues') => {
  render(<MemoryRouter initialEntries={[path]}><Dues /></MemoryRouter>)
  await waitFor(() => expect(posService.getDues).toHaveBeenCalled())
}

describe('written off', () => {
  beforeEach(() => {
    posService.getWriteOffs.mockResolvedValue(WRITE_OFFS)
    posService.getPosBranches.mockResolvedValue([])
    posService.getLedgerDocument.mockResolvedValue({
      Id: 'log-3', Tenders: [{ Id: 'b1', Amount: 9.92, PaymentMode: 'UPI', Timestamp: '2026-10-04T07:32:00.000Z' }],
    })
  })

  test('a cashier sees no write-off figures, and never asks for them', async () => {
    await renderDues()
    expect(screen.queryByRole('button', { name: /Written off/ })).toBeNull()
    expect(screen.queryByText('See every write-off →')).toBeNull()
    expect(posService.getWriteOffs).not.toHaveBeenCalled()
  })

  test('the address cannot open the register for a cashier', async () => {
    await renderAt('/money/dues?view=written-off')
    expect(await screen.findByText('₹408.00')).toBeInTheDocument()
    expect(posService.getWriteOffs).not.toHaveBeenCalled()
  })

  test('the books see this month\'s write-offs beside what is owed', async () => {
    asUser(['TRANSACTIONS:READ'])
    await renderDues()
    const card = (await screen.findByText('See every write-off →')).closest('button')
    expect(within(card).getByText('₹1,305.08')).toBeInTheDocument()
    expect(within(card).getByText('5 invoices this month')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Written off\s*5 this month/ })).toBeInTheDocument()
    // The calendar month so far, from the 1st.
    const [range] = posService.getWriteOffs.mock.calls[0]
    expect(range).toMatchObject({ preset: 'custom' })
    expect(range.fromDate).toMatch(/-01$/)
  })

  test('the card opens the register; a reason narrows the list but never the totals', async () => {
    asUser(['TRANSACTIONS:READ'])
    await renderDues()
    fireEvent.click(await screen.findByText('See every write-off →'))
    expect(await screen.findByRole('button', { name: 'Open write-off on INV-0003' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Open write-off on/ })).toHaveLength(5)

    fireEvent.click(within(screen.getByRole('region', { name: 'By reason' })).getByRole('button', { name: /Disputed item/ }))
    expect(screen.getAllByRole('button', { name: /^Open write-off on/ })).toHaveLength(1)
    expect(screen.getByText(/Showing 1 of 5/)).toBeInTheDocument()
    // Still the whole period's total.
    expect(screen.getByText('₹1,305.08', { selector: '.fd-dues-kpi b' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getAllByRole('button', { name: /^Open write-off on/ })).toHaveLength(5)
  })

  test('says how much of it is on bills from before the period', async () => {
    asUser(['TRANSACTIONS:READ'])
    await renderAt('/money/dues?view=written-off')
    expect(await screen.findByText(/₹200.00 of it is on a bill from before this period/)).toBeInTheDocument()
    expect(screen.getAllByText('earlier bill').length).toBeGreaterThan(0)
  })

  test('a row opens the whole story of that write-off', async () => {
    asUser(['TRANSACTIONS:READ'])
    await renderAt('/money/dues?view=written-off')
    fireEvent.click(await screen.findByRole('button', { name: 'Open write-off on INV-0003' }))
    const panel = await screen.findByRole('dialog', { name: /INV-0003/ })
    expect(within(panel).getByText('₹5.08 written off')).toBeInTheDocument()
    expect(within(panel).getAllByText('Customer left without paying').length).toBeGreaterThan(0)
    expect(within(panel).getByText('Karan S.')).toBeInTheDocument()
    expect(await within(panel).findByText('Paid ₹9.92 by UPI')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Open invoice in Ledger' })).toHaveAttribute('href', '/money/ledger?doc=log-3')
    expect(posService.getLedgerDocument).toHaveBeenCalledWith('log-3')

    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: /INV-0003/ })).toBeNull()
  })

  test('the detail stands without its payments when the invoice cannot be read', async () => {
    asUser(['TRANSACTIONS:READ'])
    posService.getLedgerDocument.mockRejectedValue(new Error('boom'))
    await renderAt('/money/dues?view=written-off')
    fireEvent.click(await screen.findByRole('button', { name: 'Open write-off on INV-0003' }))
    const panel = await screen.findByRole('dialog', { name: /INV-0003/ })
    await waitFor(() => expect(within(panel).queryByText(/Loading the payments/)).toBeNull())
    expect(within(panel).getByText('₹5.08 written off')).toBeInTheDocument()
  })

  test('a period with nothing written off says so', async () => {
    asUser(['TRANSACTIONS:READ'])
    posService.getWriteOffs.mockResolvedValue({
      ...WRITE_OFFS, summary: { WrittenOff: 0, Bills: 0 }, byReason: [], byUser: [], documents: [],
    })
    await renderAt('/money/dues?view=written-off')
    expect(await screen.findByText('Nothing was written off in this period.')).toBeInTheDocument()
  })

  test('the owed list carries on when write-offs cannot be read', async () => {
    asUser(['TRANSACTIONS:READ'])
    posService.getWriteOffs.mockRejectedValue(new Error('403'))
    await renderDues()
    expect(screen.getByText('₹408.00')).toBeInTheDocument()
    await waitFor(() => expect(posService.getWriteOffs).toHaveBeenCalled())
    expect(screen.queryByText('See every write-off →')).toBeNull()
  })
})
