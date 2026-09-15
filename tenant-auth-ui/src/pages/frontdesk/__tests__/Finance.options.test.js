import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Finance from '../Finance'
import posService from '../../../services/posService'

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getPosBranches: jest.fn(), getFloors: jest.fn(), getTables: jest.fn(),
    getFinanceOverview: jest.fn(), getProductReport: jest.fn(), getOptionsReport: jest.fn(),
  },
}))
jest.mock('../../../services/crudService', () => ({ __esModule: true, default: { getAll: jest.fn() } }))
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() } }))

const RANGE = { from: '2026-09-08', to: '2026-09-14', bucket: 'day', weekendOnly: false }

const PRODUCTS = {
  range: RANGE,
  products: [
    { ItemId: 'rice', ItemName: 'Veg Triple Fried Rice', CategoryName: 'Special Fried Rice', QuantitySold: 26, NetAmount: 10975.24, DiscountAmount: 0, TaxAmount: 548.76, GrossAmount: 11524, Documents: 21, OptionsAmount: 4630, AddonsAmount: 680 },
    { ItemId: 'egg', ItemName: 'Egg Chilli', CategoryName: 'Non Veg Starter', QuantitySold: 22, NetAmount: 4588.57, DiscountAmount: 0, TaxAmount: 229.43, GrossAmount: 4818, Documents: 17, OptionsAmount: 0, AddonsAmount: 0 },
  ],
}

const RICE = {
  ItemId: 'rice', ItemName: 'Veg Triple Fried Rice', CategoryName: 'Special Fried Rice', Plates: 26,
  GrossAmount: 11524, OptionsAmount: 4630, AddonsAmount: 680, PlatesWithoutOption: 3,
  OfferedVariantIds: ['v-half', 'v-full'], OfferedGroupIds: ['g-extra', 'g-dip'],
  variants: [
    { VariantId: 'v-half', Name: 'Half portion', Price: 170, Plates: 14, Revenue: 2380, TakeRate: 53.8 },
    { VariantId: 'v-full', Name: 'Full portion', Price: 250, Plates: 9, Revenue: 2250, TakeRate: 34.6 },
  ],
  addonGroups: [{
    GroupId: 'g-extra', GroupName: 'Extra', MaxSelection: 1, Plates: 8, Revenue: 460, TakeRate: 30.8,
    addons: [
      { AddonId: 'a-paneer', Name: 'Paneer', Price: 50, Plates: 6, Revenue: 300, TakeRate: 23.1 },
      { AddonId: 'a-chicken', Name: 'Chicken', Price: 80, Plates: 2, Revenue: 160, TakeRate: 7.7 },
    ],
  }],
}
const ROLL = {
  ItemId: 'roll', ItemName: 'Chicken Spring Roll', CategoryName: 'Spring Rolls', Plates: 12,
  GrossAmount: 2488, OptionsAmount: 0, AddonsAmount: 100, PlatesWithoutOption: null,
  OfferedVariantIds: [], OfferedGroupIds: ['g-dip'], variants: [],
  addonGroups: [{
    GroupId: 'g-dip', GroupName: 'Extra dip', MaxSelection: 1, Plates: 5, Revenue: 100, TakeRate: 41.7,
    addons: [{ AddonId: 'a-raita', Name: 'Raita', Price: 20, Plates: 5, Revenue: 100, TakeRate: 41.7 }],
  }],
}
const OPTIONS = {
  range: RANGE,
  totals: { OptionsAmount: 4630, AddonsAmount: 780, GrossAmount: 24752, Plates: 78, ShareOfRevenue: 21.9 },
  variants: [], addonGroups: [],
  products: { rice: RICE, roll: ROLL },
}

beforeEach(() => {
  jest.clearAllMocks()
  posService.getPosBranches.mockResolvedValue([])
  posService.getFloors.mockResolvedValue([])
  posService.getTables.mockResolvedValue([])
  posService.getProductReport.mockResolvedValue(PRODUCTS)
  posService.getOptionsReport.mockResolvedValue(OPTIONS)
})

const open = async (tab) => {
  render(<MemoryRouter initialEntries={[`/frontdesk/finance?tab=${tab}`]}><Finance /></MemoryRouter>)
  await waitFor(() => expect(screen.queryByText('Loading report…')).not.toBeInTheDocument())
}

describe('Products — what options and add-ons added', () => {
  test('columns and a KPI for options and extras', async () => {
    await open('products')
    expect(screen.getByText('Options & extras')).toBeInTheDocument()
    expect(screen.getByText('₹5,310.00')).toBeInTheDocument()
    const row = screen.getByRole('row', { name: /Veg Triple Fried Rice/ })
    expect(within(row).getByText('₹4,630.00')).toBeInTheDocument()
    expect(within(row).getByText('₹680.00')).toBeInTheDocument()
  })

  test('a dish with choices opens to show which sold and how often', async () => {
    await open('products')
    const toggle = screen.getByRole('button', { name: /Veg Triple Fried Rice/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('region', { name: /Options sold on Veg Triple Fried Rice/ })
    expect(within(panel).getByText('Half portion')).toBeInTheDocument()
    expect(within(panel).getByText('14 of 26')).toBeInTheDocument()
    expect(within(panel).getByText('3 of 26')).toBeInTheDocument()
    const addons = screen.getByRole('region', { name: /Add-ons taken on Veg Triple Fried Rice/ })
    expect(within(addons).getByText('6 · 23.1%')).toBeInTheDocument()
  })

  test('a plain dish is not a button', async () => {
    await open('products')
    expect(screen.getByText('Egg Chilli')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Egg Chilli/ })).toBeNull()
  })

  test('the product table still loads when the option breakdown fails', async () => {
    posService.getOptionsReport.mockRejectedValue(new Error('boom'))
    await open('products')
    expect(screen.getByText('Veg Triple Fried Rice')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Veg Triple Fried Rice/ })).toBeNull()
  })
})

describe('Options & Add-ons tab', () => {
  test('ranks options and add-on groups with their take rates', async () => {
    await open('options')
    expect(screen.getByRole('tab', { name: /Options & Add-ons/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('21.9%')).toBeInTheDocument()
    const half = screen.getByRole('row', { name: /^Half portion/ })
    expect(within(half).getByText('53.8%')).toBeInTheDocument()
    expect(within(half).getByText('₹2,380.00')).toBeInTheDocument()
    // Rice offers Extra dip too, so it is offered on 26 + 12 plates.
    const dip = screen.getByRole('row', { name: /^Extra dip/ })
    expect(within(dip).getByText('38 plates')).toBeInTheDocument()
  })

  test('narrowing to a category recomputes over those dishes', async () => {
    await open('options')
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Spring Rolls' } })
    expect(screen.queryByText('Half portion')).toBeNull()
    expect(screen.getByText('No options sold on these dishes in this period.')).toBeInTheDocument()
    expect(screen.getByText('Raita')).toBeInTheDocument()
  })

  test('says so when nothing sold with a choice', async () => {
    posService.getOptionsReport.mockResolvedValue({ ...OPTIONS, products: {} })
    await open('options')
    expect(screen.getByText('No dish sold with an option or add-on in this period.')).toBeInTheDocument()
  })
})
