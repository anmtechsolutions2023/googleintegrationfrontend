import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'react-toastify'
import BranchGstinList from '../BranchGstinList'
import posService from '../../../services/posService'

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { updateBranchGstin: jest.fn() },
}))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const BRANCHES = [
  { id: 'b1', name: 'Balagere', gstin: null },
  { id: 'b2', name: 'Indiranagar', gstin: '29ABCDE1234F1Z5' },
]

beforeEach(() => jest.clearAllMocks())

describe('BranchGstinList', () => {
  test('shows each branch with its GSTIN and where it is registered', () => {
    render(<BranchGstinList branches={BRANCHES} canWrite />)
    expect(screen.getByLabelText('Balagere')).toHaveValue('')
    expect(screen.getByText(/No GSTIN yet/)).toBeInTheDocument()
    expect(screen.getByLabelText('Indiranagar')).toHaveValue('29ABCDE1234F1Z5')
    expect(screen.getByText('Registered in Karnataka')).toBeInTheDocument()
  })

  test('upper-cases, holds Save until it is valid, then saves and hands back the status', async () => {
    const onSaved = jest.fn()
    posService.updateBranchGstin.mockResolvedValue({ branches: [] })
    render(<BranchGstinList branches={[BRANCHES[0]]} canWrite onSaved={onSaved} />)
    const input = screen.getByLabelText('Balagere')
    const save = screen.getByRole('button', { name: 'Save' })

    fireEvent.change(input, { target: { value: '29abcde 1234f1z' } })
    expect(input).toHaveValue('29ABCDE1234F1Z')
    expect(save).toBeDisabled()
    expect(screen.queryByText(/15 characters/)).not.toBeInTheDocument()
    fireEvent.blur(input)
    expect(screen.getByText('A GSTIN is 15 characters — this has 14.')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '29abcde1234f1z5' } })
    expect(save).toBeEnabled()
    fireEvent.click(save)

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ branches: [] }))
    expect(posService.updateBranchGstin).toHaveBeenCalledWith('b1', '29ABCDE1234F1Z5')
    expect(toast.success).toHaveBeenCalledWith('GSTIN saved for Balagere')
  })

  test('refuses an unknown state code', () => {
    render(<BranchGstinList branches={[BRANCHES[0]]} canWrite />)
    fireEvent.change(screen.getByLabelText('Balagere'), { target: { value: '99ABCDE1234F1Z5' } })
    expect(screen.getByText('99 is not a GST state code.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  test('clearing a saved GSTIN offers Remove and sends it blank', async () => {
    posService.updateBranchGstin.mockResolvedValue({})
    render(<BranchGstinList branches={[BRANCHES[1]]} canWrite />)
    fireEvent.change(screen.getByLabelText('Indiranagar'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(posService.updateBranchGstin).toHaveBeenCalledWith('b2', ''))
    expect(toast.success).toHaveBeenCalledWith('GSTIN removed from Indiranagar')
  })

  test('says what the server said when it refuses', async () => {
    posService.updateBranchGstin.mockRejectedValue({ response: { data: { message: 'Branch not found.' } } })
    render(<BranchGstinList branches={[BRANCHES[0]]} canWrite />)
    fireEvent.change(screen.getByLabelText('Balagere'), { target: { value: '29ABCDE1234F1Z5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Branch not found.'))
  })

  test('read-only shows the values without fields', () => {
    render(<BranchGstinList branches={BRANCHES} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('No GSTIN')).toBeInTheDocument()
    expect(screen.getByText('29ABCDE1234F1Z5')).toBeInTheDocument()
  })
})
