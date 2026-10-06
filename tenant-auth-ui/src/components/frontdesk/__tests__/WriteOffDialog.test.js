import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WriteOffDialog from '../WriteOffDialog'
import posService from '../../../services/posService'
import { toast } from 'react-toastify'

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { writeOffLedgerBalance: jest.fn(), getWriteOffs: jest.fn() },
}))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

// The bill from the screenshots: slef paid ₹9.92 of ₹15.00.
const DOC = { Id: 'log-3', TransactionNo: 'INV-0003', GrossAmount: 15, Paid: 9.92, Due: 5.08, CustomerName: 'slef' }

const show = (props = {}) => render(
  <MemoryRouter>
    <WriteOffDialog doc={DOC} onClose={jest.fn()} onDone={jest.fn()} {...props} />
  </MemoryRouter>,
)

beforeEach(() => jest.clearAllMocks())

test('puts this month\'s running total in front of whoever is about to add to it', async () => {
  posService.getWriteOffs.mockResolvedValue({ summary: { WrittenOff: 240, Bills: 2 } })
  show()
  expect(await screen.findByText(/Written off this month so far/)).toHaveTextContent('₹240.00 on 2 bills')
  expect(screen.getByRole('link', { name: 'See them' })).toHaveAttribute('href', '/money/dues?view=written-off')
  // The calendar month so far.
  expect(posService.getWriteOffs.mock.calls[0][0]).toMatchObject({ preset: 'custom', fromDate: expect.stringMatching(/-01$/) })
})

test('the dialog stands without the line when the month cannot be read', async () => {
  posService.getWriteOffs.mockRejectedValue(new Error('403'))
  show()
  await waitFor(() => expect(posService.getWriteOffs).toHaveBeenCalled())
  expect(screen.queryByText(/so far/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Write off ₹5.08' })).toBeEnabled()
})

test('after writing off, the toast leads to the register', async () => {
  posService.getWriteOffs.mockResolvedValue({ summary: { WrittenOff: 0, Bills: 0 } })
  posService.writeOffLedgerBalance.mockResolvedValue({ writtenOff: 5.08, transactionNo: 'INV-0003' })
  const onDone = jest.fn()
  show({ onDone })
  fireEvent.click(screen.getByRole('button', { name: 'Write off ₹5.08' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(posService.writeOffLedgerBalance).toHaveBeenCalledWith('log-3', { Reason: 'CUSTOMER_LEFT', Note: null })

  render(<MemoryRouter>{toast.success.mock.calls[0][0]}</MemoryRouter>)
  expect(screen.getByText(/₹5.08 written off\. INV-0003 is closed\./)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'See it in Written off' })).toHaveAttribute('href', '/money/dues?view=written-off')
})
