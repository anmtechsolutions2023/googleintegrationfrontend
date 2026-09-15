import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PosSettings from '../PosSettings'
import posService from '../../../services/posService'

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { getPosBranches: jest.fn(), getPosSettings: jest.fn(), updatePosSettings: jest.fn() },
}))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { tid: 't1' } }) }))
jest.mock('../../../utils/permissions', () => ({ hasScope: () => true }))

const KEY = 'kitchen.note_presets'

beforeEach(() => {
  jest.clearAllMocks()
  posService.getPosBranches.mockResolvedValue([{ Id: 'b1', BranchName: 'Balagere' }])
  // Read back as JSON text, the way every stored setting comes back.
  posService.getPosSettings.mockResolvedValue({
    'token.numbering': 'daily', 'kot.auto_print': 'on', [KEY]: '["Less spicy","Extra spicy","Jain"]',
  })
  posService.updatePosSettings.mockImplementation(async (branchId, patch) => ({
    'token.numbering': 'daily', 'kot.auto_print': 'on', [KEY]: JSON.stringify(patch[KEY]),
  }))
})

test('lists the branch\'s quick notes and saves a change as a list', async () => {
  render(<PosSettings />)
  expect(await screen.findByText('Kitchen notes')).toBeInTheDocument()
  expect(await screen.findByText('Jain')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Remove Jain' }))
  await waitFor(() => expect(posService.updatePosSettings)
    .toHaveBeenCalledWith('b1', { [KEY]: ['Less spicy', 'Extra spicy'] }))
  await waitFor(() => expect(screen.queryByText('Jain')).toBeNull())
})

test('a branch that never saved the list sees the suggested one', async () => {
  posService.getPosSettings.mockResolvedValue({ 'token.numbering': 'daily' })
  render(<PosSettings />)
  expect(await screen.findByText('No garlic')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Restore the suggested list/ })).toBeNull()
})
