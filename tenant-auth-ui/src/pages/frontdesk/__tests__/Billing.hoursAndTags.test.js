import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Billing from '../Billing';
import posService from '../../../services/posService';
import { toast } from 'react-toastify';

// Two gaps this closes, both of which looked like working features:
//
//   1. Category schedules were configurable and enforced NOWHERE — the till
//      read none of it, so a breakfast-only dish sold at midnight.
//   2. Tags could be attached to a dish and to a category, and nothing read
//      either — the filter had category, diet and name only.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getTables: jest.fn(), getFloors: jest.fn(), getItemMeta: jest.fn(),
    getOrders: jest.fn(), getItemDetail: jest.fn(), getVariants: jest.fn(),
    getAddonGroups: jest.fn(), getAddons: jest.fn(),
    getPaymentModes: jest.fn(), getKots: jest.fn(), quotePricing: jest.fn(),
    createOrder: jest.fn(), updateOrder: jest.fn(), updateTable: jest.fn(),
    transferOrder: jest.fn(), deleteOrder: jest.fn(),
    fireKot: jest.fn(), createBill: jest.fn(), settleBill: jest.fn(),
    previewOffers: jest.fn(),
    getPosSettings: jest.fn(), getReceiptFormat: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
const { useAuth } = require('../../../context/AuthContext');

const BRANCH = 'bbbbbbbb-0000-0000-0000-000000000001';
const CI_A = 'aaaaaaaa-0000-0000-0000-000000000001';

const tag = (id, name, type) => ({ id, name, type });
const CHINESE = tag('t-chi', 'Chinese', 'CUISINE');
const STARTER = tag('t-sta', 'Starter', 'CATEGORY');

const dish = (id, name, extra = {}) => ({
  Id: id, ItemDetailId: `item-${id}`, ItemName: name,
  CostInfoId: CI_A, CostInfoAmount: 100, BranchDetailId: BRANCH,
  FoodTypeName: 'Veg', FoodTypeIsVeg: 1, VariantIds: [],
  CategoryId: 'c1', CategoryName: 'All Day',
  OwnTags: [], CategoryTags: [],
  CategoryAvailableNow: true, CategoryOpensAt: null,
  TaxBreakdown: {
    netAmount: 100, taxAmount: 0, grossAmount: 100,
    effectiveRate: 0, components: [], isTaxIncluded: false,
  },
  ...extra,
});

const MENU = [
  dish('m-rice', 'Veg Fried Rice', { CategoryTags: [CHINESE] }),
  dish('m-potato', 'Honey Chilli Potato', { OwnTags: [CHINESE, STARTER] }),
  dish('m-poha', 'Poha', {
    CategoryId: 'c2', CategoryName: 'Breakfast',
    CategoryAvailableNow: false, CategoryOpensAt: '07:00:00',
  }),
];

beforeEach(() => {
  useAuth.mockReturnValue({
    user: {
      tid: 't1', onboardingStatus: 'APPROVED',
      scopes: ['POS_ORDER:READ', 'POS_ORDER:WRITE', 'POS_BILLING:READ', 'POS_BILLING:WRITE'],
    },
  });
  jest.clearAllMocks();
  posService.getTables.mockResolvedValue([]);
  posService.getFloors.mockResolvedValue([]);
  posService.getOrders.mockResolvedValue([]);
  posService.getItemMeta.mockResolvedValue(MENU);
  posService.getVariants.mockResolvedValue([]);
  posService.getAddonGroups.mockResolvedValue([]);
  posService.getAddons.mockResolvedValue([]);
  posService.getKots.mockResolvedValue([]);
  posService.getPaymentModes.mockResolvedValue([{ Id: 'pm1', Type: 'Cash' }]);
  posService.getPosSettings.mockResolvedValue({ 'kot.auto_print': 'off' });
  posService.getReceiptFormat.mockResolvedValue(null);
  posService.quotePricing.mockResolvedValue({
    lines: [], totals: { netAmount: 0, taxAmount: 0, grossAmount: 0, discountAmount: 0, taxByComponent: [] },
  });
});

const openTill = async () => {
  render(<Billing />);
  fireEvent.click(await screen.findByRole('button', { name: /Counter takeaway/i }));
  await screen.findByText('Veg Fried Rice');
};

// The card carries a real accessible name, so it can be addressed the way a
// person would rather than by walking up the DOM.
const cardFor = (name) => screen.getByRole('button', { name: new RegExp('^' + name + ',') });

describe('a section outside its hours', () => {
  it('still shows the dish — findable, not hidden', async () => {
    await openTill();
    expect(screen.getByText('Poha')).toBeInTheDocument();
  });

  it('marks it unavailable rather than only greying it', async () => {
    await openTill();
    expect(cardFor('Poha')).toHaveClass('is-unavailable');
    expect(cardFor('Poha')).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled says a control is inert; the name says why.
    expect(cardFor('Poha')).toHaveAccessibleName(/Opens 07:00/);
  });

  it('says when it comes back', async () => {
    await openTill();
    expect(screen.getByText('Opens 07:00')).toBeInTheDocument();
  });

  it('refuses the tap instead of adding it to the order', async () => {
    await openTill();
    fireEvent.click(cardFor('Poha'));
    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(posService.quotePricing).not.toHaveBeenCalled();
  });

  // A card that does nothing when tapped is a broken card, not a closed one.
  it('says WHY, and when, in the message', async () => {
    await openTill();
    fireEvent.click(cardFor('Poha'));
    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(toast.info.mock.calls[0][0]).toMatch(/Poha.*off the menu.*opens 07:00/i);
  });

  it('still adds a dish whose section is open', async () => {
    await openTill();
    fireEvent.click(cardFor('Veg Fried Rice'));
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
  });
});

describe('tags on the grid', () => {
  it('shows a tag inherited from the section', async () => {
    await openTill();
    const chip = within(cardFor('Veg Fried Rice')).getByText('Chinese');
    expect(chip).toHaveClass('fd-item-tag', 'is-inherited');
  });

  it('shows a tag set on the dish differently from an inherited one', async () => {
    await openTill();
    const chip = within(cardFor('Honey Chilli Potato')).getByText('Chinese');
    expect(chip).toHaveClass('fd-item-tag');
    expect(chip).not.toHaveClass('is-inherited');
  });
});

describe('filtering by tag', () => {
  const openSheet = async () => {
    await openTill();
    fireEvent.click(screen.getByRole('button', { name: /^Tags/i }));
  };

  it('groups the tags by vocabulary', async () => {
    await openSheet();
    expect(screen.getByText('CUISINE')).toBeInTheDocument();
    expect(screen.getByText('COURSE')).toBeInTheDocument();
  });

  it('one tap finds dishes tagged directly AND by their section', async () => {
    await openSheet();
    // A menu card is itself role=button and now carries its tags in its
    // accessible name, so 'Chinese' matches two things. The chip is the one
    // with a pressed state.
    fireEvent.click(screen.getByRole('button', { name: /Chinese/i, pressed: false }));
    expect(screen.getByText('Veg Fried Rice')).toBeInTheDocument();
    expect(screen.getByText('Honey Chilli Potato')).toBeInTheDocument();
    expect(screen.queryByText('Poha')).not.toBeInTheDocument();
  });

  it('searching a tag name works without opening the sheet', async () => {
    await openTill();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'chinese' } });
    expect(screen.getByText('Veg Fried Rice')).toBeInTheDocument();
    expect(screen.queryByText('Poha')).not.toBeInTheDocument();
  });
});

describe('the till reads as time-dependent', () => {
  it('shows the clock, so a greyed card has something to be read against', async () => {
    await openTill();
    expect(screen.getByTitle(/kitchen schedule/i)).toHaveTextContent(/^\d{2}:\d{2}$/);
  });

  it('marks a closed section on the rail, before it is tapped', async () => {
    await openTill();
    expect(screen.getByRole('button', { name: /Breakfast, closed right now/i })).toBeInTheDocument();
  });
});

describe('the typing reaches the tag vocabulary', () => {
  const type = (v) => fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: v } });

  it('offers the facet that means what was typed', async () => {
    await openTill();
    type('chin');
    expect(screen.getByRole('button', { name: /\+ Chinese/i })).toBeInTheDocument();
  });

  it('taking it swaps the text for the facet', async () => {
    await openTill();
    type('chin');
    fireEvent.click(screen.getByRole('button', { name: /\+ Chinese/i }));
    expect(screen.getByPlaceholderText(/search/i)).toHaveValue('');
    expect(screen.getByText('Veg Fried Rice')).toBeInTheDocument();
    expect(screen.queryByText('Poha')).not.toBeInTheDocument();
  });
});

describe('what is narrowing the grid is visible and removable', () => {
  it('shows nothing while nothing is filtered', async () => {
    await openTill();
    expect(screen.queryByText('Filtering')).not.toBeInTheDocument();
  });

  it('names every active filter', async () => {
    await openTill();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'poha' } });
    expect(screen.getByText('Filtering')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove filter/i })).toBeInTheDocument();
  });

  // Three taps deep, the chips that did the filtering are on rails the cashier
  // has scrolled past — without this an empty grid has no visible cause.
  it('one tap removes a filter', async () => {
    await openTill();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'poha' } });
    expect(screen.queryByText('Veg Fried Rice')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove filter/i }));
    expect(screen.getByText('Veg Fried Rice')).toBeInTheDocument();
  });

  it('Clear all drops every one of them', async () => {
    await openTill();
    fireEvent.click(screen.getByRole('button', { name: /^Tags/i }));
    fireEvent.click(screen.getByRole('button', { name: /Chinese/i, pressed: false }));
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'veg' } });
    fireEvent.click(screen.getByRole('button', { name: /Clear all/i }));
    expect(screen.queryByText('Filtering')).not.toBeInTheDocument();
    expect(screen.getByText('Poha')).toBeInTheDocument();
  });
});
