import React from 'react'
import { render, screen } from '@testing-library/react'
import OrderDetailModal from '../OrderDetailModal'
import useOrderDetail from '../../../hooks/useOrderDetail'

jest.mock('../../../hooks/useOrderDetail', () => ({ __esModule: true, default: jest.fn() }))

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
