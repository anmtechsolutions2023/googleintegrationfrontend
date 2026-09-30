// The guest's journey at a QR table, end to end against a mocked API:
// scan → number → code → name → menu → cart → placed.

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DineApp from '../DineApp'
import dineService from '../../../services/dineService'

jest.mock('react-router-dom', () => ({
  useParams: () => ({ token: 'a'.repeat(32) }),
}))

jest.mock('../../../services/dineService', () => ({
  __esModule: true,
  default: {
    resolve: jest.fn(),
    getLogo: jest.fn(() => Promise.resolve(null)),
    requestCode: jest.fn(),
    verifyCode: jest.fn(),
    getSessionState: jest.fn(),
    setName: jest.fn(),
    getMenu: jest.fn(),
    quote: jest.fn(),
    placeOrder: jest.fn(),
    getOrders: jest.fn(),
    messageOf: (e, f = 'Something went wrong.') => e?.response?.data?.message || f,
    isSessionEnded: (e) => e?.response?.status === 401,
  },
}))

const venue = {
  businessName: 'Saffron House', branchName: 'Indiranagar', tableName: 'T4',
  floorName: 'Ground floor', mode: 'order', canOrder: true,
}
const menu = {
  canOrder: true,
  categories: [{
    id: 'c1', name: 'Breads',
    items: [{
      id: 'naan', name: 'Butter Naan', description: null, isVeg: true, price: 60,
      available: true, opensAt: null, variants: [], addonGroups: [],
    }],
  }],
}

beforeEach(() => {
  jest.clearAllMocks()
  window.sessionStorage.clear()
  dineService.resolve.mockResolvedValue(venue)
  dineService.getLogo.mockResolvedValue(null)
  dineService.getMenu.mockResolvedValue(menu)
  dineService.getOrders.mockResolvedValue([])
  dineService.quote.mockResolvedValue({ lines: [], subTotal: 60, taxAmount: 3, total: 63 })
})

test('shows "not active" for a code the server does not recognise', async () => {
  dineService.resolve.mockRejectedValue({ response: { status: 404 } })
  render(<DineApp />)
  expect(await screen.findByText('This QR code isn’t active')).toBeInTheDocument()
})

test('checks the number as it is typed before any code is spent', async () => {
  render(<DineApp />)
  fireEvent.click(await screen.findByText('Continue with mobile number'))
  const input = screen.getByLabelText('Mobile number')
  const send = screen.getByRole('button', { name: 'Send code on WhatsApp' })

  fireEvent.change(input, { target: { value: '12345' } })
  expect(screen.getByText(/start with 6, 7, 8 or 9/)).toBeInTheDocument()
  expect(send).toBeDisabled()

  fireEvent.change(input, { target: { value: '9876543210' } })
  expect(send).toBeEnabled()
  expect(dineService.requestCode).not.toHaveBeenCalled()
})

test('a first-time guest verifies, names themselves, orders, and sees it waiting for staff', async () => {
  dineService.requestCode.mockResolvedValue({ challengeId: 'ch-1', expiresInSeconds: 300, resendInSeconds: 60 })
  dineService.verifyCode.mockResolvedValue({
    token: 'diner-session', expiresInSeconds: 10800,
    customer: { name: null, isNew: true }, venue,
  })
  dineService.setName.mockResolvedValue({ name: 'Priya' })
  dineService.placeOrder.mockResolvedValue({ id: 'o1', orderNo: 'ORD-1', status: 'waiting', total: 63 })

  render(<DineApp />)
  fireEvent.click(await screen.findByText('Continue with mobile number'))
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '98765 43210' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send code on WhatsApp' }))

  const code = await screen.findByLabelText('6-digit code')
  expect(dineService.requestCode).toHaveBeenCalledWith('a'.repeat(32), '98765 43210')
  fireEvent.change(code, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify and see menu' }))

  // First visit: asked for a name.
  fireEvent.change(await screen.findByLabelText(/Your name/), { target: { value: 'Priya' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to menu' }))
  await waitFor(() => expect(dineService.setName).toHaveBeenCalledWith('diner-session', 'Priya'))

  fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
  fireEvent.click(screen.getByText(/View order/))

  expect(await screen.findByText('₹63')).toBeInTheDocument() // the server's quote, not the estimate
  dineService.getOrders.mockResolvedValue([{
    id: 'o1', orderNo: 'ORD-1', status: 'waiting', placedAt: new Date().toISOString(),
    items: [{ name: 'Butter Naan', quantity: 1, variants: [], addons: [], note: null }],
    subTotal: 60, taxAmount: 3, total: 63, rejection: null,
  }])
  fireEvent.click(screen.getByRole('button', { name: /Place order/ }))

  expect(await screen.findByText('Waiting for staff to confirm')).toBeInTheDocument()
  const [, sentCart] = dineService.placeOrder.mock.calls[0]
  expect(sentCart).toEqual([expect.objectContaining({ id: 'naan', quantity: 1 })])
})

test('a session the server has ended sends the guest back to scan again', async () => {
  window.sessionStorage.setItem(`dine:${'a'.repeat(32)}`, JSON.stringify({
    session: { token: 'old', expiresAt: Date.now() + 60000 },
  }))
  dineService.getMenu.mockResolvedValue(menu)
  dineService.quote.mockRejectedValue({ response: { status: 401 } })
  render(<DineApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
  fireEvent.click(screen.getByText(/View order/))
  expect(await screen.findByText('Your session has ended')).toBeInTheDocument()
})
