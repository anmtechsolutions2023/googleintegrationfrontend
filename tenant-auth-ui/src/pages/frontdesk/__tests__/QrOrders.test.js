// The staff review queue for orders guests placed from a QR table.
// Nothing a guest orders is cooked until someone here presses Accept.

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QrOrders from '../QrOrders'
import qrService from '../../../services/qrService'
import { useAuth } from '../../../context/AuthContext'

jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../../../services/qrService', () => ({
  __esModule: true,
  default: {
    getPendingOrders: jest.fn(),
    getRejectionReasons: jest.fn(),
    acceptOrder: jest.fn(),
    rejectOrder: jest.fn(),
  },
}))

const order = {
  id: 'o1', orderNo: 'ORD-0142', tableName: 'T4', floorName: 'Ground floor',
  items: [{ name: 'Paneer Tikka', quantity: 1, grossAmount: 300 }],
  total: 300, cookingInstructions: 'serve starters first',
  placedAt: new Date().toISOString(),
  customer: { id: 'c1', name: 'Priya', phone: '+919876543210', visits: 2, totalSpent: 2840 },
}

const asCashier = () => useAuth.mockReturnValue({ user: { scopes: ['POS_ORDER:WRITE'] } })

beforeEach(() => {
  qrService.getPendingOrders.mockResolvedValue([order])
  qrService.getRejectionReasons.mockResolvedValue([{ id: 'r1', name: 'Item out of stock', code: 'OOS' }])
  qrService.acceptOrder.mockResolvedValue({ orderId: 'o1', kot: { KotNo: 'K-218' } })
  qrService.rejectOrder.mockResolvedValue({ orderId: 'o1', status: 'cancelled' })
})

test('shows who ordered, verified, with their visit count', async () => {
  asCashier()
  render(<QrOrders />)
  fireEvent.click(await screen.findByText(/Table T4 · Priya/))
  expect(screen.getByText('WhatsApp verified')).toBeInTheDocument()
  expect(screen.getByText(/3rd visit/)).toBeInTheDocument()
  expect(screen.getByText(/serve starters first/)).toBeInTheDocument()
})

test('a cashier with order-taking access accepts — it goes to the kitchen', async () => {
  asCashier()
  render(<QrOrders />)
  fireEvent.click(await screen.findByText(/Table T4 · Priya/))
  fireEvent.click(screen.getByRole('button', { name: 'Accept and send to kitchen' }))
  await waitFor(() => expect(qrService.acceptOrder).toHaveBeenCalledWith('o1'))
})

test('rejecting needs a reason, which is sent for the guest to see', async () => {
  asCashier()
  render(<QrOrders />)
  fireEvent.click(await screen.findByText(/Table T4 · Priya/))
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
  fireEvent.change(screen.getByPlaceholderText(/Optional note/), { target: { value: 'Out of paneer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reject order' }))
  await waitFor(() => expect(qrService.rejectOrder).toHaveBeenCalledWith('o1', { reasonId: 'r1', note: 'Out of paneer' }))
})

test('someone who can only read the queue sees the order but no decision buttons', async () => {
  useAuth.mockReturnValue({ user: { scopes: ['POS_QR:READ'] } })
  render(<QrOrders />)
  fireEvent.click(await screen.findByText(/Table T4 · Priya/))
  expect(screen.queryByRole('button', { name: 'Accept and send to kitchen' })).not.toBeInTheDocument()
  expect(screen.getByText(/needs order-taking access/)).toBeInTheDocument()
})
