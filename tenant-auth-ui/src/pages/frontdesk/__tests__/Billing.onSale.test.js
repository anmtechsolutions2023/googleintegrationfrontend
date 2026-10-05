import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import Billing from '../Billing'
import { toast } from 'react-toastify'
import posService from '../../../services/posService'

// A dish turned off in Menu Master stays on the till's grid but cannot be added —
// even though its section is open.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getTables: jest.fn(), getFloors: jest.fn(), getItemMeta: jest.fn(),
    getOrders: jest.fn(), getItemDetail: jest.fn(), getVariants: jest.fn(),
    getAddonGroups: jest.fn(), getAddons: jest.fn(),
    getPaymentModes: jest.fn(), getBranchPaymentMethods: jest.fn(), getKots: jest.fn(), quotePricing: jest.fn(),
    createOrder: jest.fn(), updateOrder: jest.fn(), updateTable: jest.fn(), setTableOccupancy: jest.fn(),
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
    Active: 1, CategoryAvailableNow: true,
  },
  {
    Id: 'm2', ItemDetailId: 'item-m2', ItemName: 'Chilly Garlic Paneer', CostInfoId: 'ci-2', CostInfoAmount: 269,
    FoodTypeName: 'Veg', FoodTypeIsVeg: 1, VariantIds: [], BranchDetailId: BRANCH, TaxBreakdown: TAX,
    Active: 0, CategoryAvailableNow: true,
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

describe('a dish turned off in Menu Master', () => {
  test('stays visible, says Not on sale, and refuses the tap', async () => {
    await openCounter()
    const card = screen.getByRole('button', { name: /^Chilly Garlic Paneer, .*Not on sale$/ })
    expect(card).toHaveAttribute('aria-disabled', 'true')
    expect(within(card).getByText('Not on sale')).toBeInTheDocument()

    fireEvent.click(card)
    expect(toast.info).toHaveBeenCalledWith('Chilly Garlic Paneer is not on sale. Turn it on in Menu Master.')
    expect(posService.quotePricing).not.toHaveBeenCalled()
  })

  test('a dish that is on sale still adds', async () => {
    await openCounter()
    tapDish('Masala Dosa')
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled())
  })
})
