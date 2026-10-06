import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Dishes from '../Dishes'
import menuService from '../../../services/menuService'
import { downloadSampleZip } from '../../../utils/menuFile'
import { toast } from 'react-toastify'

jest.mock('../../../services/menuService', () => ({
  __esModule: true,
  default: {
    listDishes: jest.fn(), bulkDishes: jest.fn(),
    backupMenu: jest.fn(), previewClearMenu: jest.fn(), clearMenu: jest.fn(),
  },
}))
jest.mock('../../../services/exportService', () => ({ downloadExport: jest.fn() }))
jest.mock('../../../utils/menuFile', () => ({ downloadSampleZip: jest.fn(), downloadTemplate: jest.fn() }))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() } }))

let mockScopes = ['TENANT:ADMIN']
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { scopes: mockScopes } }) }))

const dish = (o) => ({
  itemId: o.itemId, name: o.name, code: o.code, category: 'Mains', diet: 'Veg', price: 100, status: o.status || 'Active',
  tags: [], variants: [], addonGroups: [], portals: [], branchCount: 1, channelCount: 3, branchPrices: 0, hasPhoto: false,
})
const MENU = { dishes: [dish({ itemId: 'i1', name: 'Veg Biryani', code: 'MNS-01' }), dish({ itemId: 'i2', name: 'Butter Chicken', code: 'MNS-02' })], portals: [] }
const AFTER = { dishes: [dish({ itemId: 'i2', name: 'Butter Chicken', code: 'MNS-02', status: 'Hidden' })], portals: [] }
const PREVIEW = {
  mode: 'empty', dishes: 2, deleted: 1, hidden: 1, keptBecause: { sold: 1, offers: 0, openOrders: 0 },
  listingsRemoved: 2, hoursCleared: 12, countsCleared: 0, removed: { categories: 1, tags: 0, variants: 2, addonGroups: 1 },
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/menu/dishes']}>
    <Routes>
      <Route path="/menu/dishes" element={<Dishes />} />
      <Route path="/menu/dishes/import" element={<div>Import page</div>} />
    </Routes>
  </MemoryRouter>,
)

const openClearDialog = async () => {
  await screen.findByText('Veg Biryani')
  fireEvent.click(screen.getByRole('button', { name: /Menu file/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Clear the menu/ }))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  jest.clearAllMocks()
  mockScopes = ['TENANT:ADMIN']
  menuService.listDishes.mockResolvedValue(MENU)
  menuService.previewClearMenu.mockResolvedValue(PREVIEW)
  menuService.backupMenu.mockResolvedValue('menu-backup_2026-10-06.zip')
  menuService.clearMenu.mockResolvedValue({ ...PREVIEW })
})

test('Menu file lists the file actions in order, with clearing last for an admin', async () => {
  renderPage()
  await screen.findByText('Veg Biryani')
  fireEvent.click(screen.getByRole('button', { name: /Menu file/ }))
  const items = screen.getAllByRole('menuitem').map((b) => b.querySelector('b').textContent)
  expect(items).toEqual(['Import menu file…', 'Download sample menu', 'Download blank template', 'Add photos…',
    'Export menu file', 'Export add-ons', 'Export hours', 'Clear the menu…'])
})

test('a menu manager who is not an admin never sees Clear the menu', async () => {
  mockScopes = ['POS_CONFIG:WRITE']
  renderPage()
  await screen.findByText('Veg Biryani')
  fireEvent.click(screen.getByRole('button', { name: /Menu file/ }))
  expect(screen.getByRole('menuitem', { name: /Import menu file/ })).toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: /Clear the menu/ })).not.toBeInTheDocument()
})

test('Download sample menu saves the zip', async () => {
  downloadSampleZip.mockResolvedValue('menu-sample.zip')
  renderPage()
  await screen.findByText('Veg Biryani')
  fireEvent.click(screen.getByRole('button', { name: /Menu file/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Download sample menu/ }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved menu-sample.zip'))
})

test('starting empty: counts from the server, the typed phrase, backup first, then the empty menu', async () => {
  menuService.listDishes.mockResolvedValueOnce(MENU).mockResolvedValue(AFTER)
  renderPage()
  const dialog = await openClearDialog()
  fireEvent.click(within(dialog).getByLabelText(/Start from an empty menu/))
  // An empty menu always takes a backup.
  expect(within(dialog).getByLabelText(/Download a backup first/)).toBeChecked()
  expect(within(dialog).getByLabelText(/Download a backup first/)).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Next — review' }))

  expect(await within(dialog).findByText(/nothing else points at/)).toBeInTheDocument()
  expect(menuService.previewClearMenu).toHaveBeenCalledWith({ mode: 'empty', removeUnused: true })
  expect(within(dialog).getByText(/1 on past bills/)).toBeInTheDocument()

  const go = within(dialog).getByRole('button', { name: 'Back up and clear' })
  expect(go).toBeDisabled()
  fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: 'clear menu' } })
  expect(go).toBeEnabled()
  fireEvent.click(go)

  await waitFor(() => expect(menuService.clearMenu).toHaveBeenCalledWith({ mode: 'empty', removeUnused: true, confirm: 'clear menu' }))
  expect(menuService.backupMenu.mock.invocationCallOrder[0]).toBeLessThan(menuService.clearMenu.mock.invocationCallOrder[0])
  expect(await screen.findByText('Your menu is empty')).toBeInTheDocument()
  expect(screen.getByText(/1 dish deleted, 1 hidden/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Load the sample menu' })).toHaveAttribute('href', '/menu/dishes/import?sample=1')
  expect(screen.getByRole('link', { name: 'Import the backup' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Show the 1 hidden dish' }))
  expect(await screen.findByText('Butter Chicken')).toBeInTheDocument()
})

test('if the backup cannot be saved, nothing is cleared', async () => {
  menuService.backupMenu.mockRejectedValue(new Error('network'))
  renderPage()
  const dialog = await openClearDialog()
  fireEvent.click(within(dialog).getByLabelText(/Start from an empty menu/))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Next — review' }))
  fireEvent.change(await within(dialog).findByLabelText(/to confirm/), { target: { value: 'CLEAR MENU' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Back up and clear' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Nothing was cleared/)))
  expect(menuService.clearMenu).not.toHaveBeenCalled()
})

test('taking dishes off the menu can skip the backup and keeps hours', async () => {
  menuService.previewClearMenu.mockResolvedValue({ ...PREVIEW, mode: 'hide', deleted: 0, hidden: 2, hoursCleared: 0 })
  renderPage()
  const dialog = await openClearDialog()
  fireEvent.click(within(dialog).getByLabelText(/Download a backup first/))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Next — review' }))
  expect(await within(dialog).findByText(/Keep category hours and portion counts/)).toBeInTheDocument()
  expect(menuService.previewClearMenu).toHaveBeenCalledWith({ mode: 'hide', removeUnused: false })
  fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: 'CLEAR MENU' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear the menu' }))
  await waitFor(() => expect(menuService.clearMenu).toHaveBeenCalled())
  expect(menuService.backupMenu).not.toHaveBeenCalled()
})
