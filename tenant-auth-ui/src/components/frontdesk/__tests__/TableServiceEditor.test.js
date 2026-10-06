import React from 'react'
import { render, screen } from '@testing-library/react'
import TableServiceEditor from '../TableServiceEditor'

const WAITERS = [
  { Id: 'w1', Name: 'Ravi Kumar', BranchDetailId: 'b1' },
  // A member with no name is listed by mobile — the server does the fallback.
  { Id: 'w2', Name: '+919876543210', BranchDetailId: 'b1' },
]

const show = (props) => render(
  <TableServiceEditor guests={2} waiters={WAITERS} branchId="b1" onSave={jest.fn()} onCancel={jest.fn()} {...props} />,
)

test('lists the members the server offers, by name or by mobile', () => {
  show({ waiterId: null })
  const options = screen.getAllByRole('option').map((o) => o.textContent)
  expect(options).toEqual(['Not assigned', 'Ravi Kumar', '+919876543210'])
})

test('keeps showing a table\'s waiter who no longer takes orders, rather than "Not assigned"', () => {
  show({ waiterId: 'gone', waiterName: 'Asha P' })
  expect(screen.getByLabelText('Waiter')).toHaveValue('gone')
  expect(screen.getByRole('option', { name: 'Asha P (no longer takes orders)' })).toBeInTheDocument()
})
