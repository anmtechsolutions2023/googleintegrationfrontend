import React from 'react'
import { render, screen, within } from '@testing-library/react'
import BillSummary from '../BillSummary'

// The settle screen billed a ₹219 dish at ₹239 with nothing to say why. The
// item-wise table has to name each option and add-on and what it added.

const round = (items) => ({
  round: 1, orderId: 'o1', orderNo: 'ORD-1', time: null, items, order: { Id: 'o1' },
})

const friedRice = {
  name: 'Veg Korean Fried Rice', qty: 1, taxPct: 5, isTaxIncluded: true,
  netAmount: 227.62, taxAmount: 11.38, grossAmount: 239,
  basePrice: 199, variantAmount: 20, addonAmount: 20, price: 239,
  variants: [{ id: 'v-large', name: 'Large', price: 20 }],
  addons: [{ id: 'a-egg', name: 'Fried egg', price: 20, groupName: 'Extras' }],
  note: 'Less spicy',
  taxComponents: [{ name: 'SGST', rate: 2.5, amount: 5.69 }, { name: 'CGST', rate: 2.5, amount: 5.69 }],
}

describe('BillSummary — options on the bill', () => {
  test('names each option and add-on with what it added', () => {
    render(<BillSummary rounds={[round([friedRice])]} defaultOpenBreakup />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('Large +₹20.00')).toBeInTheDocument()
    expect(within(table).getByText(/Fried egg \+₹20\.00/)).toBeInTheDocument()
  })

  test('shows how the plate price was built', () => {
    render(<BillSummary rounds={[round([friedRice])]} defaultOpenBreakup />)
    expect(screen.getByText('₹199.00 + options ₹20.00 + extras ₹20.00')).toBeInTheDocument()
  })

  test('keeps the kitchen note off the bill', () => {
    render(<BillSummary rounds={[round([friedRice])]} defaultOpenBreakup />)
    expect(screen.queryByText('Less spicy')).not.toBeInTheDocument()
  })

  test('shows the item table on a zero-rated bill when plates are customised', () => {
    const untaxed = { ...friedRice, taxPct: 0, taxAmount: 0, netAmount: 239, taxComponents: [] }
    render(<BillSummary rounds={[round([untaxed])]} defaultOpenBreakup />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Large +₹20.00')).toBeInTheDocument()
  })

  test('an untaxed bill shows one Total and no GST columns', () => {
    const untaxed = {
      ...friedRice, taxPct: 0, taxAmount: 0, netAmount: 239, taxComponents: [], taxCharged: false,
    }
    render(<BillSummary rounds={[round([untaxed])]} defaultOpenBreakup />)
    expect(screen.queryByText('Tax')).not.toBeInTheDocument()
    expect(screen.queryByText('Subtotal')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /GST %/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Items/ })).toBeInTheDocument()
  })

  test('draws no item table for a plain, untaxed bill', () => {
    const water = {
      name: 'Water', qty: 1, taxPct: 0, netAmount: 20, taxAmount: 0, grossAmount: 20,
    }
    render(<BillSummary rounds={[round([water])]} defaultOpenBreakup />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
