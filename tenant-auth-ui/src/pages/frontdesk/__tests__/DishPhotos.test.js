import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { matchPhotoFile, slug, preparePhoto, staffPhotoUrl } from '../../../utils/dishPhoto'
import AddPhotosDialog from '../AddPhotosDialog'
import Dishes from '../Dishes'
import DineMenu from '../../dine/DineMenu'
import menuService from '../../../services/menuService'
import { toast } from 'react-toastify'

jest.mock('../../../services/menuService', () => ({
  __esModule: true,
  default: { listDishes: jest.fn(), bulkDishes: jest.fn(), putDishPhoto: jest.fn() },
}))
jest.mock('../../../services/exportService', () => ({ downloadExport: jest.fn() }))
jest.mock('../../../utils/menuFile', () => ({ downloadSampleZip: jest.fn(), downloadTemplate: jest.fn() }))
jest.mock('../../../utils/dishPhoto', () => {
  const actual = jest.requireActual('../../../utils/dishPhoto')
  return {
    ...actual,
    preparePhoto: jest.fn(),
    staffPhotoUrl: jest.fn(),
  }
})
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() } }))
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { scopes: ['TENANT:ADMIN'] } }) }))

const DISHES = [
  { itemId: 'i1', code: 'MNS-01', name: 'Butter Chicken', photoVersion: 1791311669 },
  { itemId: 'i2', code: 'MNS-02', name: 'Veg Dum Biryani', photoVersion: null },
  { itemId: 'i3', code: 'SOP-01', name: 'Manchow Soup', photoVersion: null },
]

// The app's Jest config resets mocks before every test, so implementations go here.
beforeEach(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:preview')
  global.URL.revokeObjectURL = jest.fn()
  preparePhoto.mockImplementation(async (f) => ({ dataUri: `data:image/jpeg;base64,FULL-${f.name}`, thumbDataUri: `data:image/jpeg;base64,THUMB-${f.name}` }))
  staffPhotoUrl.mockImplementation(async (id) => `blob:${id}`)
  menuService.putDishPhoto.mockResolvedValue({})
})

describe('matching a photo file to a dish', () => {
  it('by code first, then by name, ignoring case, spaces and punctuation', () => {
    expect(matchPhotoFile('mns-02.JPG', DISHES)).toEqual({ dish: DISHES[1], by: 'code' })
    expect(matchPhotoFile('Manchow Soup.png', DISHES)).toEqual({ dish: DISHES[2], by: 'name' })
    expect(matchPhotoFile('manchow_soup.jpeg', DISHES).dish.itemId).toBe('i3')
    expect(matchPhotoFile('IMG_2041.jpg', DISHES)).toBeNull()
    expect(slug('Hot N Sour – Soup!')).toBe('hotnsoursoup')
  })
})

const file = (name) => new File(['x'], name, { type: 'image/jpeg' })

describe('Add photos', () => {
  it('matches each file, flags the unmatched one, and saves only the matched photos', async () => {
    const onSaved = jest.fn()
    render(<AddPhotosDialog dishes={DISHES} onClose={jest.fn()} onSaved={onSaved} />)
    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [file('MNS-01.jpg'), file('manchow-soup.jpg'), file('IMG_2041.jpg')] } })

    expect(screen.getByRole('heading', { name: 'Add photos — 3 files' })).toBeInTheDocument()
    expect(screen.getByLabelText('Dish for MNS-01.jpg')).toHaveValue('i1')
    expect(screen.getByLabelText('Dish for manchow-soup.jpg')).toHaveValue('i3')
    expect(screen.getByLabelText('Dish for IMG_2041.jpg')).toHaveValue('')
    expect(screen.getByText('Replaces photo')).toBeInTheDocument()
    expect(screen.getByText('No match')).toBeInTheDocument()
    expect(screen.getByText('1 file needs a dish.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save 2 photos' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(menuService.putDishPhoto).toHaveBeenCalledTimes(2)
    expect(menuService.putDishPhoto).toHaveBeenCalledWith('i1', 'data:image/jpeg;base64,FULL-MNS-01.jpg', 'data:image/jpeg;base64,THUMB-MNS-01.jpg')
    expect(toast.success).toHaveBeenCalledWith('2 photos saved')
  })

  it('a dish picked by hand counts, and a failed save stays on screen with why', async () => {
    menuService.putDishPhoto.mockRejectedValueOnce({ response: { data: { message: 'That image is too large' } } })
    render(<AddPhotosDialog dishes={DISHES} onClose={jest.fn()} onSaved={jest.fn()} />)
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file('IMG_2041.jpg')] } })
    fireEvent.change(screen.getByLabelText('Dish for IMG_2041.jpg'), { target: { value: 'i2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 photo' }))
    expect(await screen.findByText('That image is too large')).toBeInTheDocument()
  })
})

describe('Dishes list', () => {
  const dish = (o) => ({
    category: 'Mains', diet: 'Veg', price: 100, status: 'Active', tags: [], variants: [], addonGroups: [], portals: [],
    branchCount: 1, channelCount: 3, branchPrices: 0, ...o,
  })

  it('shows thumbnails, a + photo box where one is missing, and filters to dishes without one', async () => {
    menuService.listDishes.mockResolvedValue({ dishes: DISHES.map(dish), portals: [] })
    render(<MemoryRouter><Dishes /></MemoryRouter>)
    await screen.findByText('Butter Chicken')
    await waitFor(() => expect(document.querySelector('img[src="blob:i1"]')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Add a photo of Veg Dum Biryani' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /No photo 2/ }))
    expect(screen.queryByText('Butter Chicken')).not.toBeInTheDocument()
    expect(screen.getByText('Manchow Soup')).toBeInTheDocument()
  })
})

describe('guest QR menu', () => {
  const item = (o) => ({ description: null, isVeg: true, price: 280, available: true, variants: [], addonGroups: [], ...o })
  const menu = { categories: [{ id: 'c1', name: 'Mains', items: [
    item({ id: 'm1', name: 'Butter Chicken', photoVersion: 1791311669 }),
    item({ id: 'm2', name: 'Chicken Chettinad', photoVersion: null }),
  ] }] }
  const photoUrl = (i, size = 'thumb') => (i.photoVersion ? `https://api/p/${i.id}?size=${size}&v=${i.photoVersion}` : null)

  it('shows a photo only for dishes that have one; tapping it opens the dish', () => {
    const onOpenItem = jest.fn()
    render(<DineMenu venue={{ businessName: 'Cafe' }} menu={menu} cart={[]} canOrder onAdd={jest.fn()} onOpenItem={onOpenItem}
      onChangeQty={jest.fn()} onOpenCart={jest.fn()} onOpenOrders={jest.fn()} photoUrl={photoUrl} />)
    const withPhoto = screen.getByText('Butter Chicken').closest('article')
    const without = screen.getByText('Chicken Chettinad').closest('article')
    expect(within(withPhoto).getByRole('button', { name: 'See Butter Chicken' }).querySelector('img'))
      .toHaveAttribute('src', 'https://api/p/m1?size=thumb&v=1791311669')
    expect(without.querySelector('img')).toBeNull()
    expect(within(without).getByRole('button', { name: 'Add' })).toBeInTheDocument()
    fireEvent.click(within(withPhoto).getByRole('button', { name: 'See Butter Chicken' }))
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))
  })
})

describe('bulk channels', () => {
  it('adds a channel to the selected dishes', async () => {
    menuService.listDishes.mockResolvedValue({
      dishes: [{ ...DISHES[0], category: 'Mains', diet: 'Veg', price: 1, status: 'Active', tags: [], variants: [], addonGroups: [], portals: [], branchCount: 1, channelCount: 1, branchPrices: 0 }],
      portals: [], channels: [{ Id: 'ch-take', Name: 'Takeaway' }],
    })
    menuService.bulkDishes.mockResolvedValue({ updated: 1 })
    render(<MemoryRouter><Dishes /></MemoryRouter>)
    fireEvent.click(await screen.findByLabelText('Select Butter Chicken'))
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'ch-take' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add channel' }))
    await waitFor(() => expect(menuService.bulkDishes).toHaveBeenCalledWith({ itemIds: ['i1'], action: 'addChannel', channelId: 'ch-take' }))
  })
})
