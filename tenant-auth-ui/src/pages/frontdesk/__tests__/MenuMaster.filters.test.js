import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import MenuMaster from '../MenuMaster'
import * as posService from '../../../services/posService'
import crudService from '../../../services/crudService'

// Menu Master narrows the menu the way the till does: search, category, diet
// and menu tags — including tags a dish only inherits from its category.

jest.mock('../../../services/posService', () => ({
  genericGet: jest.fn(),
  genericPost: jest.fn(),
  genericPut: jest.fn(),
  genericDelete: jest.fn(),
}))
jest.mock('../../../services/crudService', () => ({
  __esModule: true,
  default: { getReferenceData: jest.fn() },
}))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { tid: 't-1', scopes: ['TENANT:ADMIN'] } }),
}))

const CHINESE = { id: 'tag-chinese', name: 'Chinese', type: 'CUISINE' }
const BREAKFAST = { id: 'tag-breakfast', name: 'Breakfast', type: 'CATEGORY' }

const row = (id, name, over) => ({
  Id: `meta-${id}`, ItemDetailId: `item-${id}`, ItemName: name, FoodTypeId: 'ft',
  BranchDetailId: 'br', CostInfoAmount: '100', ChannelIds: [], VariantIds: [], AddonGroupIds: [],
  Active: true, OwnTags: [], CategoryTags: [], ...over,
})

const ROWS = [
  row('dosa', 'Masala Dosa', {
    CategoryId: 'cat-south', CategoryName: 'South Indian', FoodTypeName: 'Veg', FoodTypeIsVeg: 1,
    OwnTags: [BREAKFAST],
  }),
  row('c65', 'Chicken 65', {
    CategoryId: 'cat-starters', CategoryName: 'Starters', FoodTypeName: 'Non-Veg', FoodTypeIsVeg: 0,
    CategoryTags: [CHINESE],
  }),
  row('paneer', 'Paneer Chilli', {
    CategoryId: 'cat-starters', CategoryName: 'Starters', FoodTypeName: 'Veg', FoodTypeIsVeg: 1,
    CategoryTags: [CHINESE],
  }),
]

const ITEMS = ROWS.map((r) => ({ Id: r.ItemDetailId, Name: r.ItemName }))

beforeEach(() => {
  posService.genericGet.mockResolvedValue(ROWS)
  crudService.getReferenceData.mockImplementation(async (ref) => (ref === 'itemDetails' ? ITEMS : []))
})
afterEach(() => jest.clearAllMocks())

const table = () => within(screen.getByRole('table'))
const shown = () => ['Masala Dosa', 'Chicken 65', 'Paneer Chilli'].filter((n) => table().queryByText(n))

const open = async () => {
  render(<MenuMaster />)
  await screen.findByRole('button', { name: /Starters/ })
  await table().findByText('Masala Dosa')
}

test('offers the till\'s category rail and diet row, with counts', async () => {
  await open()
  const rail = screen.getByRole('group', { name: 'Filter by category' })
  expect(within(rail).getByRole('button', { name: /All\s*3/ })).toBeInTheDocument()
  expect(within(rail).getByRole('button', { name: /Starters\s*2/ })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Filter by food type' })).toBeInTheDocument()
})

test('a category narrows the list, and combines with diet', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: /Starters/ }))
  expect(shown()).toEqual(['Chicken 65', 'Paneer Chilli'])

  fireEvent.click(within(screen.getByRole('group', { name: 'Filter by food type' })).getByRole('button', { name: /^Veg/ }))
  expect(shown()).toEqual(['Paneer Chilli'])
})

test('a tag finds dishes that only inherit it from their category', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: /^Tags/ }))
  const sheet = screen.getByRole('group', { name: 'Filter by menu tag' })
  fireEvent.click(within(sheet).getByRole('button', { name: /Chinese/ }))
  expect(shown()).toEqual(['Chicken 65', 'Paneer Chilli'])
})

test('search matches a name, a category or a tag, and offers the tag as a filter', async () => {
  await open()
  fireEvent.change(screen.getByPlaceholderText(/Search dishes/), { target: { value: 'chinese' } })
  expect(shown()).toEqual(['Chicken 65', 'Paneer Chilli'])
  expect(screen.getByRole('button', { name: /\+ Chinese/ })).toBeInTheDocument()

  fireEvent.change(screen.getByPlaceholderText(/Search dishes/), { target: { value: 'dosa' } })
  expect(shown()).toEqual(['Masala Dosa'])
})

test('says when nothing matches, and Clear all brings everything back', async () => {
  await open()
  fireEvent.change(screen.getByPlaceholderText(/Search dishes/), { target: { value: 'pizza' } })
  expect(screen.getByText('Nothing matches these filters.')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(shown()).toEqual(['Masala Dosa', 'Chicken 65', 'Paneer Chilli'])
})

test('the list shows each dish\'s category and its tags, inherited ones marked', async () => {
  await open()
  const c65 = table().getByRole('row', { name: /Chicken 65/ })
  expect(within(c65).getByText('Starters')).toBeInTheDocument()
  expect(within(c65).getByText('Chinese')).toHaveClass('fd-item-tag', 'is-inherited')
  const dosa = table().getByRole('row', { name: /Masala Dosa/ })
  expect(within(dosa).getByText('Breakfast')).not.toHaveClass('is-inherited')
})

test('the generic search box gives way to the menu filters', async () => {
  await open()
  expect(screen.queryByPlaceholderText(/Search menu items\.\.\./)).toBeNull()
  expect(screen.getByRole('button', { name: /Refresh/ })).toBeInTheDocument()
})
