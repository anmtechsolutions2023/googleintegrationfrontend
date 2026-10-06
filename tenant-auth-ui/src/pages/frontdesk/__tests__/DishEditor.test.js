import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DishEditor from '../DishEditor'
import menuService from '../../../services/menuService'
import { toast } from 'react-toastify'

jest.mock('../../../services/menuService', () => ({
  __esModule: true,
  default: {
    getMenuOptions: jest.fn(), getDish: jest.fn(), createDish: jest.fn(), updateDish: jest.fn(),
    getDishPhoto: jest.fn(), putDishPhoto: jest.fn(), deleteDishPhoto: jest.fn(),
  },
}))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() } }))
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { scopes: ['TENANT:ADMIN'] } }) }))

const OPTIONS = {
  branches: [{ Id: 'b1', Name: 'Indiranagar' }, { Id: 'b2', Name: 'Koramangala' }],
  channels: [{ Id: 'c1', Name: 'Dine In' }, { Id: 'c2', Name: 'Online' }],
  portals: [{ Id: 'p1', Name: 'Zomato', ChannelId: 'c2' }],
  categories: [{ Id: 'cat1', Name: 'Mains' }],
  units: [{ Id: 'u1', Name: 'Plate' }],
  taxGroups: [{ Id: 't1', Name: 'GST 5%', Components: [{ name: 'CGST', value: '2.5' }, { name: 'SGST', value: '2.5' }] }],
  foodTypes: [{ Id: 'f1', Name: 'Veg', IsVeg: true }, { Id: 'f2', Name: 'Non-Veg', IsVeg: false }],
  meatTypes: [{ Id: 'm1', Name: 'Chicken' }],
  tags: [{ Id: 'tg1', Name: 'Main Course' }],
  variants: [{ Id: 'v1', Name: 'Regular', Price: 0 }, { Id: 'v2', Name: 'Large', Price: 40 }],
  addonGroups: [],
}

const renderNew = () => render(
  <MemoryRouter initialEntries={['/menu/dishes/new']}>
    <Routes>
      <Route path="/menu/dishes/new" element={<DishEditor />} />
      <Route path="/menu/dishes" element={<div>Dishes list</div>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  menuService.getMenuOptions.mockResolvedValue(OPTIONS)
  menuService.createDish.mockResolvedValue({ itemId: 'new-1', alsoCreated: { categories: ['Desserts'] } })
})

test('a new dish starts on every branch and every channel, with the 5% group', async () => {
  renderNew()
  expect(await screen.findByRole('heading', { name: 'New dish' })).toBeInTheDocument()
  expect(screen.getByLabelText('Sold at Indiranagar')).toBeChecked()
  expect(screen.getByLabelText('Sold at Koramangala')).toBeChecked()
  expect(screen.getByLabelText('Koramangala Online')).toBeChecked()
  expect(screen.getByLabelText('Tax group')).toHaveValue('GST 5%')
})

test('says what saving will also create, and asks the rates of a new tax group', async () => {
  renderNew()
  await screen.findByRole('heading', { name: 'New dish' })
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Desserts' } })
  fireEvent.change(screen.getByLabelText('Tax group'), { target: { value: 'GST 12%' } })
  expect(screen.getByText('Category Desserts')).toBeInTheDocument()
  expect(screen.getByText(/New tax group “GST 12%” — what are its rates/)).toBeInTheDocument()
  expect(screen.getByText(/Tax group GST 12%/)).toBeInTheDocument()
})

test('saves the dish as one object, with each variant\'s price for this dish', async () => {
  renderNew()
  await screen.findByRole('heading', { name: 'New dish' })
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Veg Biryani' } })
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Mains' } })
  fireEvent.change(screen.getByLabelText('Price (₹)'), { target: { value: '220' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Add a variant' }))
  fireEvent.click(screen.getByRole('button', { name: '+ Add a variant' }))
  const names = screen.getAllByRole('textbox').filter((el) => el.id && el.id.startsWith('d-var-'))
  fireEvent.change(names[1], { target: { value: 'Large' } })
  fireEvent.change(screen.getByLabelText('Large adds'), { target: { value: '60' } })
  fireEvent.click(screen.getByLabelText('Sold at Koramangala'))
  fireEvent.click(screen.getByLabelText('Listed on Zomato'))
  fireEvent.click(screen.getByRole('button', { name: /Use ₹255 \(\+15%\)/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save dish' }))

  await waitFor(() => expect(menuService.createDish).toHaveBeenCalled())
  const [dish] = menuService.createDish.mock.calls[0]
  expect(dish).toMatchObject({
    name: 'Veg Biryani', category: 'Mains', price: 220, taxGroup: 'GST 5%', diet: 'Veg',
    variants: [{ name: 'Regular', surcharge: 0 }, { name: 'Large', surcharge: 60 }],
    branches: [{ branchId: 'b1', channelIds: ['c1', 'c2'], price: null }],
    portals: [{ portalId: 'p1', listed: true, price: 255, name: null }],
  })
  expect(dish.taxComponents).toBeUndefined()
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved. Also created: Desserts'))
  expect(screen.getByText('Dishes list')).toBeInTheDocument()
})

test('will not save without a name, category and price', async () => {
  renderNew()
  await screen.findByRole('heading', { name: 'New dish' })
  fireEvent.click(screen.getByRole('button', { name: 'Save dish' }))
  expect(menuService.createDish).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/name, category, price/))
})
