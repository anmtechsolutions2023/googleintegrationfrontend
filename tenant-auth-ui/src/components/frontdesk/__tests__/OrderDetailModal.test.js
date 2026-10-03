import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import OrderDetailModal from '../OrderDetailModal'
import useOrderDetail from '../../../hooks/useOrderDetail'
import posService from '../../../services/posService'

jest.mock('../../../hooks/useOrderDetail', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { getBranchPaymentMethods: jest.fn(), getPaymentModes: jest.fn(), collectLedgerPayment: jest.fn() },
}))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() } }))
// Who is looking decides whether Collect is offered.
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }))
const { useAuth } = require('../../../context/AuthContext')

// ORD-0001 as it really sold: a ₹239 dish with a Half portion, Raita and Paneer.
// The order detail used to show only the Half portion.
const ORDER = {
  Id: 'o1', OrderNo: 'ORD-0001', OrderType: 'takeaway', Status: 'closed',
  CreatedOn: '2026-09-14T00:45:08', SubTotal: 456.19, TaxAmount: 22.81, Total: 479,
  CookingInstructions: 'Pack sauces separately', NoCutlery: 1,
  Items: [{
    name: 'Veg Triple Fried Rice', qty: 1, price: 479, basePrice: 239,
    variantAmount: 170, addonAmount: 70, grossAmount: 479,
    variants: [{ id: 'v1', name: 'Half portion', price: 170 }],
    addons: [
      { id: 'a1', name: 'Raita', price: 20, groupName: 'Extra dip' },
      { id: 'a2', name: 'Paneer', price: 50, groupName: 'Extra' },
    ],
    note: 'Less spicy',
  }],
}

beforeEach(() => {
  useOrderDetail.mockReturnValue({
    detail: { Order: ORDER, Source: { kind: 'token', label: '1' }, Token: { Status: 'served' }, Kots: [], Bill: null },
    loading: false,
    error: null,
  })
})

test('shows every add-on with its group, and how the rate was built', () => {
  render(<OrderDetailModal orderId="o1" onClose={() => {}} />)
  expect(screen.getByText('Half portion +₹170.00')).toBeInTheDocument()
  expect(screen.getByText('Raita +₹20.00')).toBeInTheDocument()
  expect(screen.getByText('Paneer +₹50.00')).toBeInTheDocument()
  expect(screen.getByText('₹239.00 + options ₹170.00 + extras ₹70.00')).toBeInTheDocument()
})

test('shows the dish note and the whole-order note', () => {
  render(<OrderDetailModal orderId="o1" onClose={() => {}} />)
  expect(screen.getByTitle('Kitchen note')).toHaveTextContent('Less spicy')
  expect(screen.getByText('Pack sauces separately')).toBeInTheDocument()
  expect(screen.getByText('NO CUTLERY')).toBeInTheDocument()
})

test('an order with no notes shows no note panel', () => {
  useOrderDetail.mockReturnValue({
    detail: { Order: { ...ORDER, CookingInstructions: null, NoCutlery: 0 }, Source: null, Kots: [], Bill: null },
    loading: false,
    error: null,
  })
  render(<OrderDetailModal orderId="o1" onClose={() => {}} />)
  expect(screen.queryByText('Whole order')).toBeNull()
})


// ── Billing: what is paid and what is still owed ──────────────────────────────
// ORD-0002 on Marble Table 2: ₹288.00 invoiced, ₹200.00 paid in cash, ₹88.00 due.
describe('a part-paid order', () => {
  const PART_PAID_BILL = {
    BillId: 'b2', BillNo: 'BILL-0002', BillStatus: 'partially_paid', SettledAt: '2026-10-03T15:34:32Z',
    TransactionDetailLogId: 'log-2', TransactionNo: 'INV-0002', LedgerStatus: 'PARTIALLY_PAID',
    BranchDetailId: 'br-1', InvoiceTotal: 288, Paid: 200, Due: 88, Returned: 0, WrittenOff: 0,
    CustomerName: 'Rahul M.', CustomerMobile: '98765 43210',
    Payments: [{ Id: 'p1', PaymentMode: 'Cash', Amount: 200, Timestamp: '2026-10-03T15:34:32Z', CreatedBy: 'front-desk' }],
  }
  const withBill = (bill, scopes = ['POS_BILLING:WRITE']) => {
    useAuth.mockReturnValue({ user: { tid: 't1', onboardingStatus: 'APPROVED', scopes } })
    useOrderDetail.mockReturnValue({
      detail: { Order: { ...ORDER, OrderNo: 'ORD-0002' }, Source: { kind: 'table', label: 'Marble Table 2' }, Kots: [], Bill: bill },
      loading: false, error: null, reload: jest.fn(),
    })
  }

  test('shows paid, due and every payment, and calls it Last payment', () => {
    withBill(PART_PAID_BILL)
    render(<OrderDetailModal orderId="o2" onClose={() => {}} />)
    expect(screen.getByText('₹88.00 due')).toBeInTheDocument()
    expect(screen.getByText('Last payment')).toBeInTheDocument()
    expect(screen.queryByText('Settled', { selector: 'dt' })).toBeNull()
    expect(screen.getByText('Owed by')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })

  test('a cashier can collect from the order', async () => {
    withBill(PART_PAID_BILL)
    posService.getBranchPaymentMethods.mockResolvedValue({
      methods: [{ paymentModeId: 'pm-cash', type: 'Cash', accountName: 'Cash', enabled: true, active: true }],
    })
    posService.getPaymentModes.mockResolvedValue([])
    render(<OrderDetailModal orderId="o2" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collect ₹88.00' }))
    const sheet = await screen.findByRole('dialog', { name: 'Collect payment' })
    expect(await within(sheet).findByText('INV-0002 will be marked Settled.')).toBeInTheDocument()
    expect(posService.getBranchPaymentMethods).toHaveBeenCalledWith('br-1')
  })

  test('someone who cannot take money sees the due but no Collect', () => {
    withBill(PART_PAID_BILL, ['POS_ORDER:READ'])
    render(<OrderDetailModal orderId="o2" onClose={() => {}} />)
    expect(screen.getByText('₹88.00 due')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Collect/ })).toBeNull()
  })

  test('a settled order says Paid in full and offers nothing to collect', () => {
    withBill({ ...PART_PAID_BILL, LedgerStatus: 'SETTLED', Paid: 288, Due: 0, InvoiceSettledAt: '2026-10-04T07:42:00Z' })
    render(<OrderDetailModal orderId="o2" onClose={() => {}} />)
    expect(screen.getByText('Paid in full')).toBeInTheDocument()
    expect(screen.getByText('Settled', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Collect/ })).toBeNull()
  })
})
