import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import Billing from '../Billing'
import posService from '../../../services/posService'

// Kitchen notes at the till: a note on each dish ("less spicy"), a note on the
// whole order, and — for a takeaway — no cutlery. Each has to reach the order
// the kitchen ticket is printed from.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getTables: jest.fn(), getFloors: jest.fn(), getItemMeta: jest.fn(),
    getOrders: jest.fn(), getItemDetail: jest.fn(), getVariants: jest.fn(),
    getAddonGroups: jest.fn(), getAddons: jest.fn(),
    getPaymentModes: jest.fn(), getBranchPaymentMethods: jest.fn(), getKots: jest.fn(), quotePricing: jest.fn(),
    createOrder: jest.fn(), updateOrder: jest.fn(), updateTable: jest.fn(),
    transferOrder: jest.fn(), deleteOrder: jest.fn(),
    fireKot: jest.fn(), createBill: jest.fn(), settleBill: jest.fn(),
    previewOffers: jest.fn(),
    getPosSettings: jest.fn(), getReceiptFormat: jest.fn(),
  },
}))
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}))
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }))
const { useAuth } = require('../../../context/AuthContext')

const BRANCH = 'bbbbbbbb-0000-0000-0000-000000000001'
const TAX = { netAmount: 100, taxAmount: 0, grossAmount: 100, effectiveRate: 0, components: [], isTaxIncluded: false }
const MENU = [
  {
    Id: 'm1', ItemDetailId: 'item-m1', ItemName: 'Masala Dosa', CostInfoId: 'ci-1', CostInfoAmount: 100,
    FoodTypeName: 'Veg', FoodTypeIsVeg: 1, VariantIds: [], BranchDetailId: BRANCH, TaxBreakdown: TAX,
  },
  {
    Id: 'm2', ItemDetailId: 'item-m2', ItemName: 'Veg Triple Fried Rice', CostInfoId: 'ci-2', CostInfoAmount: 239,
    FoodTypeName: 'Veg', FoodTypeIsVeg: 1, VariantIds: ['v-half'], BranchDetailId: BRANCH, TaxBreakdown: TAX,
  },
]

beforeEach(() => {
  useAuth.mockReturnValue({
    user: { tid: 't1', onboardingStatus: 'APPROVED', scopes: ['POS_ORDER:READ', 'POS_ORDER:WRITE', 'POS_BILLING:READ', 'POS_BILLING:WRITE'] },
  })
  jest.clearAllMocks()
  posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'free' }])
  posService.getFloors.mockResolvedValue([])
  posService.getOrders.mockResolvedValue([])
  posService.getItemMeta.mockResolvedValue(MENU)
  posService.getVariants.mockResolvedValue([{ Id: 'v-half', Name: 'Half portion', Code: 'half', Price: 170 }])
  posService.getAddonGroups.mockResolvedValue([])
  posService.getAddons.mockResolvedValue([])
  posService.getKots.mockResolvedValue([])
  // The till reads the branch-resolved list; these suites are not about
  // payment methods, so it simply echoes whatever the catalogue mock holds.
  posService.getBranchPaymentMethods.mockImplementation(async () => ({
    methods: (await posService.getPaymentModes()).map((m) => ({
      paymentModeId: m.Id, type: m.Type, accountName: m.AccountName ?? null,
      accountKind: null, requiresReference: !!m.RequiresReference,
      active: true, enabled: true, enabledByDefault: true, source: 'default',
    })),
  }));
  posService.getPaymentModes.mockResolvedValue([{ Id: 'mode-cash', Type: 'Cash' }])
  posService.getItemDetail.mockResolvedValue({ Id: 'item-m1', Name: 'Masala Dosa' })
  posService.quotePricing.mockImplementation(async (lines) => ({
    lines: lines.map((l) => ({
      ref: l.ref, costInfoId: l.costInfoId, quantity: l.quantity,
      unitAmount: 100, netAmount: 100, taxAmount: 0, grossAmount: 100 * (l.quantity || 1),
    })),
    totals: { netAmount: 100, taxAmount: 0, grossAmount: 100, discountAmount: 0, taxByComponent: [] },
  }))
  posService.createOrder.mockResolvedValue({ id: 'o-counter' })
  posService.fireKot.mockResolvedValue({ KotNo: 'KOT-0001' })
  // This branch's own quick picks — "Well done" is not one of the defaults.
  posService.getPosSettings.mockResolvedValue({
    'kot.auto_print': 'off', 'kitchen.note_presets': '["Less oil","Well done"]',
  })
  posService.getReceiptFormat.mockResolvedValue(null)
  posService.previewOffers.mockResolvedValue({ applied: [] })
})

const openCounter = async () => {
  render(<Billing />)
  await screen.findByText(/Pick a table to start/i)
  fireEvent.click(screen.getByRole('button', { name: /Counter takeaway/i }))
}
const tapDish = (name) => {
  fireEvent.click(screen.getAllByText(name).find((el) => el.className === 'item-name'))
}
const placeAndPay = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Place & Pay/i }))
  await waitFor(() => expect(posService.createOrder).toHaveBeenCalled())
  return posService.createOrder.mock.calls[0][0]
}

describe('a note on one dish', () => {
  test('a plain dish takes its note in the cart, from the branch\'s own quick picks', async () => {
    await openCounter()
    tapDish('Masala Dosa')
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /Add kitchen note/ }))
    expect(await screen.findByRole('button', { name: 'Well done' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Less oil' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.getByTitle('Kitchen note')).toHaveTextContent('Less oil')
    expect(screen.getByRole('button', { name: /Edit kitchen note/ })).toBeInTheDocument()

    const payload = await placeAndPay()
    expect(payload.Items[0]).toMatchObject({ name: 'Masala Dosa', note: 'Less oil' })
  })

  test('a note chosen in the customise sheet goes with the dish and its option', async () => {
    await openCounter()
    tapDish('Veg Triple Fried Rice')
    const sheet = await screen.findByRole('dialog', { name: 'Customise item' })
    fireEvent.click(within(sheet).getByLabelText(/Half portion/))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Less oil' }))
    fireEvent.click(within(sheet).getByRole('button', { name: /Add to Order/ }))
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled())

    expect(screen.getByTitle('Kitchen note')).toHaveTextContent('Less oil')
    const payload = await placeAndPay()
    expect(payload.Items[0]).toMatchObject({ note: 'Less oil', variantIds: ['v-half'] })
  })

  test('the same dish with a different note is its own line', async () => {
    await openCounter()
    tapDish('Masala Dosa')
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /Add kitchen note/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Well done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    tapDish('Masala Dosa')
    await waitFor(() => expect(screen.getAllByRole('button', { name: /kitchen note/i })).toHaveLength(2))
    await waitFor(() => {
      const refs = posService.quotePricing.mock.calls.at(-1)[0].map((l) => l.ref)
      expect(refs).toEqual(['m1', 'm1|n2'])
    })
  })
})

describe('a note on the whole order', () => {
  test('the note and no cutlery go with a counter order', async () => {
    await openCounter()
    tapDish('Masala Dosa')
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText(/Note for the kitchen · whole order/), {
      target: { value: 'Pack sauces separately' },
    })
    fireEvent.click(screen.getByRole('switch'))

    const payload = await placeAndPay()
    expect(payload).toMatchObject({ CookingInstructions: 'Pack sauces separately', NoCutlery: true })
  })

  test('an order with no note sends none', async () => {
    await openCounter()
    tapDish('Masala Dosa')
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled())
    const payload = await placeAndPay()
    expect(payload).toMatchObject({ CookingInstructions: null, NoCutlery: false })
    expect(payload.Items[0].note).toBeUndefined()
  })

  test('clearing the cart clears the notes with it', async () => {
    await openCounter()
    tapDish('Masala Dosa')
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText(/Note for the kitchen/), { target: { value: 'Ring the bell' } })

    fireEvent.click(screen.getByRole('button', { name: 'Clear cart' }))
    tapDish('Masala Dosa')
    expect(await screen.findByLabelText(/Note for the kitchen/)).toHaveValue('')
  })
})
