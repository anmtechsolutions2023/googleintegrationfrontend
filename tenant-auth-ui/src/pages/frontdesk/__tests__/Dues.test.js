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
