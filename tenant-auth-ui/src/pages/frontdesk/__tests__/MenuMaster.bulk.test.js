import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { toast } from 'react-toastify'
import MenuMaster from '../MenuMaster'
import * as posService from '../../../services/posService'
import crudService from '../../../services/crudService'

// Menu Master: turning a dish off, and changing many dishes at once.

jest.mock('../../../services/posService', () => ({
  genericGet: jest.fn(),
  genericPost: jest.fn(),
  genericPut: jest.fn(),
  genericPatch: jest.fn(),
  genericDelete: jest.fn(),
}))
jest.mock('../../../services/crudService', () => ({
  __esModule: true,
  default: { getReferenceData: jest.fn() },
}))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))
let mockScopes = ['TENANT:ADMIN']
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { tid: 't-1', scopes: mockScopes } }),
}))

const BULK = '/api/pos/item-meta/bulk'
const CHINESE = { id: 'tag-chn', name: 'Chinese', type: 'CUISINE' }

const row = (id, name, over) => ({
  Id: id, ItemDetailId: `item-${id}`, ItemName: name, FoodTypeId: 'ft', FoodTypeName: 'Veg',
  BranchDetailId: 'br', CostInfoAmount: '100', ChannelIds: [], VariantIds: [], AddonGroupIds: [],
  TagIds: [], OwnTags: [], CategoryTags: [], Active: 1, ...over,
})
const ROWS = () => [
  row('m1', 'Chicken 65'),
  row('m2', 'Gobi Manchurian', { TagIds: [CHINESE.id], OwnTags: [CHINESE] }),
  row('m3', 'Lemon Chicken', { Active: 0 }),
]

beforeEach(() => {
  mockScopes = ['TENANT:ADMIN']
  posService.genericGet.mockImplementation(async () => ROWS())
  posService.genericPatch.mockResolvedValue({ data: { updated: 1 } })
  crudService.getReferenceData.mockImplementation(async (ref) => ({
    itemDetails: ROWS().map((r) => ({ Id: r.ItemDetailId, Name: r.ItemName })),
    posMenuTags: [{ Id: CHINESE.id, Name: 'Chinese', TagType: 'CUISINE' }],
  })[ref] || [])
})
afterEach(() => jest.clearAllMocks())

const open = async () => {
  render(<MenuMaster />)
  await within(await screen.findByRole('table')).findByText('Lemon Chicken')
}
const toggle = (name) => screen.getByRole('switch', { name: `${name} on sale` })
const tick = (name) => fireEvent.click(screen.getByRole('checkbox', { name: `Select ${name}` }))

describe('Active, one dish at a time', () => {
  test('flipping a dish off saves it straight away, and the toast can undo it', async () => {
    await open()
    expect(toggle('Chicken 65')).toBeChecked()
    expect(toggle('Lemon Chicken')).not.toBeChecked()

    fireEvent.click(toggle('Chicken 65'))
    await waitFor(() => expect(posService.genericPatch).toHaveBeenCalledWith(BULK, { ids: ['m1'], changes: { Active: false } }))
    expect(toggle('Chicken 65')).not.toBeChecked()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())

    render(toast.success.mock.calls[0][0])
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(posService.genericPatch).toHaveBeenLastCalledWith(BULK, { ids: ['m1'], changes: { Active: true } }))
  })

  test('a failed save puts the switch back and says why', async () => {
    posService.genericPatch.mockRejectedValueOnce({ response: { data: { message: 'You cannot change the menu.' } } })
    await open()
    fireEvent.click(toggle('Chicken 65'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('You cannot change the menu.'))
    expect(toggle('Chicken 65')).toBeChecked()
  })
})

describe('many dishes at once', () => {
  test('ticking dishes brings up the bar, and Turn off asks before saving them together', async () => {
    await open()
    expect(screen.getByText(/Tick dishes to change them together/)).toBeInTheDocument()
    tick('Chicken 65')
    tick('Gobi Manchurian')
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Turn off/ }))
    const dialog = screen.getByRole('dialog', { name: 'Turn off 2 items?' })
    expect(within(dialog).getByText('Gobi Manchurian')).toBeInTheDocument()
    expect(posService.genericPatch).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off 2 items' }))
    await waitFor(() => expect(posService.genericPatch).toHaveBeenCalledWith(BULK, { ids: ['m1', 'm2'], changes: { Active: false } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toggle('Chicken 65')).not.toBeChecked()
    expect(toggle('Gobi Manchurian')).not.toBeChecked()
  })

  test('Select all shown takes every dish the filters show', async () => {
    await open()
    tick('Chicken 65')
    fireEvent.click(screen.getByRole('button', { name: 'Select all 3 shown' }))
    expect(screen.getByText('3 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByText(/selected$/)).toBeNull()
  })

  test('Change a field adds a tag only to the dishes that lack it', async () => {
    await open()
    tick('Chicken 65')
    tick('Gobi Manchurian')
    fireEvent.click(screen.getByRole('button', { name: /Change a field/ }))
    const dialog = screen.getByRole('dialog', { name: 'Change a field for 2 items' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Chinese' }))
    expect(within(dialog).getByText('Adds Chinese to 1 of 2 items.')).toBeInTheDocument()
    expect(within(dialog).getByText('Gobi Manchurian already has it.')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply to 1 item' }))
    await waitFor(() => expect(posService.genericPatch).toHaveBeenCalledWith(BULK, {
      ids: ['m1'], changes: { TagIds: { mode: 'add', ids: ['tag-chn'] } },
    }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Menu Tags updated on 1 item'))
    // Tags come back with their names, so the list is read again.
    await waitFor(() => expect(posService.genericGet).toHaveBeenCalledTimes(2))
  })

  test('the On sale filter narrows the list to dishes that are off', async () => {
    await open()
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by on sale' })).getByRole('button', { name: /^Off/ }))
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Lemon Chicken')).toBeInTheDocument()
    expect(table.queryByText('Chicken 65')).toBeNull()
  })
})

test('someone who cannot change the menu sees On and Off, with no switches or checkboxes', async () => {
  mockScopes = []
  await open()
  expect(screen.queryByRole('switch')).toBeNull()
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  expect(within(screen.getByRole('table')).getByText('Off')).toBeInTheDocument()
})
