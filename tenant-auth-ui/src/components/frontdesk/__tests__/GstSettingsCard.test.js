import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import GstSettingsCard from '../GstSettingsCard'
import posService from '../../../services/posService'

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { getTaxSettings: jest.fn(), updateTaxSettings: jest.fn(), updateBranchGstin: jest.fn() },
}))
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}))

const ON = { gstCharging: true, offReason: null, taxMode: 'gst', history: [], openOrders: [] }
const OFF = { ...ON, gstCharging: false, offReason: 'composition', taxMode: 'composition' }

beforeEach(() => jest.clearAllMocks())

describe('GST settings card', () => {
  test('shows the switch on by default', async () => {
    posService.getTaxSettings.mockResolvedValue(ON)
    render(<GstSettingsCard canWrite />)
    expect(await screen.findByRole('checkbox', { name: /Charge GST on sales/i })).toBeChecked()
  })

  test('turning it off asks first, and saves the chosen reason', async () => {
    posService.getTaxSettings.mockResolvedValue(ON)
    posService.updateTaxSettings.mockResolvedValue(OFF)
    render(<GstSettingsCard canWrite />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Charge GST on sales/i }))

    const dialog = await screen.findByRole('dialog', { name: /Stop charging GST/i })
    expect(posService.updateTaxSettings).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('radio', { name: /Not registered/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /^Stop charging GST$/i }))

    await waitFor(() => expect(posService.updateTaxSettings)
      .toHaveBeenCalledWith({ gstCharging: false, offReason: 'unregistered' }))
  })

  test('with orders open it explains, and does not offer the change', async () => {
    posService.getTaxSettings.mockResolvedValue({
      ...ON,
      openOrders: [{ id: 'o1', orderNo: 'ORD-12', orderType: 'dinein', tableName: 'T-4', total: 1062 }],
    })
    render(<GstSettingsCard canWrite />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Charge GST on sales/i }))

    const dialog = await screen.findByRole('dialog', { name: /Settle open orders first/i })
    expect(within(dialog).getByText(/ORD-12/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Stop charging/i })).not.toBeInTheDocument()
  })

  test('while off, the reason can be changed straight away', async () => {
    posService.getTaxSettings.mockResolvedValue(OFF)
    posService.updateTaxSettings.mockResolvedValue({ ...OFF, offReason: 'unregistered' })
    render(<GstSettingsCard canWrite />)
    fireEvent.click(await screen.findByRole('radio', { name: /Not registered/i }))
    await waitFor(() => expect(posService.updateTaxSettings)
      .toHaveBeenCalledWith({ gstCharging: false, offReason: 'unregistered' }))
  })

  test('a reader sees the switch but cannot move it', async () => {
    posService.getTaxSettings.mockResolvedValue(ON)
    render(<GstSettingsCard canWrite={false} />)
    expect(await screen.findByRole('checkbox', { name: /Charge GST on sales/i })).toBeDisabled()
  })
})

describe('GSTIN by branch', () => {
  const branch = (over = {}) => ({ id: 'b1', name: 'Balagere', gstin: null, valid: true, placeOfSupply: null, ...over })

  test('lists each branch, and warns while GST is on and one has no GSTIN', async () => {
    posService.getTaxSettings.mockResolvedValue({
      ...ON, branches: [branch(), branch({ id: 'b2', name: 'Indiranagar', gstin: '29ABCDE1234F1Z5' })],
    })
    render(<GstSettingsCard canWrite />)
    expect(await screen.findByLabelText('Balagere')).toHaveValue('')
    expect(screen.getByLabelText('Indiranagar')).toHaveValue('29ABCDE1234F1Z5')
    expect(screen.getByText(/GST is on, but Balagere has no GSTIN/)).toBeInTheDocument()
  })

  test('a saved GSTIN replaces what the card shows, and the warning goes', async () => {
    posService.getTaxSettings.mockResolvedValue({ ...ON, branches: [branch()] })
    posService.updateBranchGstin.mockResolvedValue({ ...ON, branches: [branch({ gstin: '29ABCDE1234F1Z5' })] })
    render(<GstSettingsCard canWrite />)
    fireEvent.change(await screen.findByLabelText('Balagere'), { target: { value: '29abcde1234f1z5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByText(/has no GSTIN/)).not.toBeInTheDocument())
    expect(posService.updateBranchGstin).toHaveBeenCalledWith('b1', '29ABCDE1234F1Z5')
    expect(screen.getByLabelText('Balagere')).toHaveValue('29ABCDE1234F1Z5')
  })

  test('with GST off a missing GSTIN is not a warning', async () => {
    posService.getTaxSettings.mockResolvedValue({ ...OFF, branches: [branch()] })
    render(<GstSettingsCard canWrite />)
    expect(await screen.findByLabelText('Balagere')).toBeInTheDocument()
    expect(screen.queryByText(/has no GSTIN/)).not.toBeInTheDocument()
  })

  test('without write access the GSTINs are shown, not editable', async () => {
    posService.getTaxSettings.mockResolvedValue({ ...ON, branches: [branch({ gstin: '29ABCDE1234F1Z5' })] })
    render(<GstSettingsCard canWrite={false} />)
    expect(await screen.findByText('29ABCDE1234F1Z5')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
