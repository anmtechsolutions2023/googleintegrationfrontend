import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MenuMaster from '../MenuMaster';
import * as posService from '../../../services/posService';
import crudService from '../../../services/crudService';

jest.mock('../../../services/posService', () => ({
  genericGet: jest.fn(),
  genericPost: jest.fn(),
  genericPut: jest.fn(),
  genericDelete: jest.fn(),
}));
jest.mock('../../../services/crudService', () => ({
  __esModule: true,
  default: { getReferenceData: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { tid: 't-1', scopes: ['TENANT:ADMIN'] } }),
}));

const ITEM_CHEAP = 'aaaaaaaa-0000-0000-0000-000000000001';
const ITEM_PRICEY = 'aaaaaaaa-0000-0000-0000-000000000002';
const ITEM_NO_PRICE = 'aaaaaaaa-0000-0000-0000-000000000003';
const COST_CHEAP = 'bbbbbbbb-0000-0000-0000-000000000001';
const COST_PRICEY = 'bbbbbbbb-0000-0000-0000-000000000002';
const FOOD_VEG = 'cccccccc-0000-0000-0000-000000000001';
const BRANCH = 'dddddddd-0000-0000-0000-000000000001';

// itemDetails is fetched with expand=true, so options carry the joined cost
// fields (CostAmount + tax group + tax-included flag) alongside the item's
// own CostInfoId.
const ITEM_OPTIONS = [
  { Id: ITEM_CHEAP, Name: 'Masala Dosa', CostInfoId: COST_CHEAP, CostAmount: '120', CostTaxGroupName: 'GST5', CostIsTaxIncluded: 0 },
  { Id: ITEM_PRICEY, Name: 'Paneer Tikka', CostInfoId: COST_PRICEY, CostAmount: '250', CostTaxGroupName: 'GST18', CostIsTaxIncluded: 1 },
  { Id: ITEM_NO_PRICE, Name: 'Water', CostInfoId: null, CostAmount: null, CostTaxGroupName: null, CostIsTaxIncluded: null },
];

const REFERENCE_DATA = {
  itemDetails: ITEM_OPTIONS,
  posFoodType: [{ Id: FOOD_VEG, Name: 'Veg' }],
  // The branch picker reads /api/pos/branches, not /api/branchdetails — the
  // latter needs ORGANIZATION:READ, which a POS role has no reason to hold.
  posBranches: [{ Id: BRANCH, Name: 'Main', BranchName: 'Main' }],
  posChannel: [],
  posVariant: [],
};

// Required labels render as "Item *", so anchor on the start of the label text.
const itemSelect = () => screen.getByLabelText(/^Item\b/i);
const selectItem = (id) => fireEvent.change(itemSelect(), { target: { value: id } });
// Cost Info is a read-only summary card, not a form control.
const costSummary = () => document.querySelector('.derived-summary');

const openCreateForm = async () => {
  render(<MenuMaster />);
  await waitFor(() => expect(crudService.getReferenceData).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole('button', { name: /Add Menu Items/i }));
  await screen.findByLabelText(/^Item\b/i);
};

const fillRequired = () => {
  fireEvent.change(itemSelect(), { target: { value: ITEM_CHEAP } });
  fireEvent.change(screen.getByLabelText(/Food Type/i), { target: { value: FOOD_VEG } });
  fireEvent.change(screen.getByLabelText(/Branch/i), { target: { value: BRANCH } });
};

beforeEach(() => {
  posService.genericGet.mockResolvedValue([]);
  posService.genericPost.mockResolvedValue({});
  posService.genericPut.mockResolvedValue({});
  crudService.getReferenceData.mockImplementation(
    async (ref) => REFERENCE_DATA[ref] ?? [],
  );
});

afterEach(() => jest.clearAllMocks());

describe('Menu Item form — cost info is read-only', () => {
  test('renders Cost Info as a summary card, with no editable price control', async () => {
    await openCreateForm();
    selectItem(ITEM_CHEAP);
    const card = costSummary();
    expect(card).toBeInTheDocument();
    // No input/select/textarea inside — it is display-only.
    expect(card.querySelector('input, select, textarea')).toBeNull();
  });

  test('no longer loads the costInfos reference at all', async () => {
    await openCreateForm();
    const refsRequested = crudService.getReferenceData.mock.calls.map(([r]) => r);
    expect(refsRequested).not.toContain('costInfos');
    expect(refsRequested).toContain('itemDetails');
    // And branches come from the POS-scoped source.
    expect(refsRequested).toContain('posBranches');
    expect(refsRequested).not.toContain('branchDetails');
  });

  test('explains where the cost comes from once an item is chosen', async () => {
    await openCreateForm();
    selectItem(ITEM_CHEAP);
    expect(screen.getByText(/Comes from the selected item/i)).toBeInTheDocument();
  });
});

describe('Menu Item form — cost summary follows the selected item', () => {
  test('shows price, tax group and tax-included for the selected item', async () => {
    await openCreateForm();
    selectItem(ITEM_PRICEY);
    const card = costSummary();
    expect(within(card).getByText('250')).toBeInTheDocument();
    expect(within(card).getByText('GST18')).toBeInTheDocument();
    expect(within(card).getByText(/Included/)).toBeInTheDocument();
  });

  test('reflects a tax-exclusive item as "Not included"', async () => {
    await openCreateForm();
    selectItem(ITEM_CHEAP);
    const card = costSummary();
    expect(within(card).getByText('120')).toBeInTheDocument();
    expect(within(card).getByText('GST5')).toBeInTheDocument();
    expect(within(card).getByText(/Not included/)).toBeInTheDocument();
  });

  test('updates when a different item is selected', async () => {
    await openCreateForm();
    selectItem(ITEM_CHEAP);
    expect(within(costSummary()).getByText('120')).toBeInTheDocument();

    selectItem(ITEM_PRICEY);
    expect(within(costSummary()).getByText('250')).toBeInTheDocument();
  });

  test('prompts to pick an item before any is chosen', async () => {
    await openCreateForm();
    expect(costSummary()).toHaveTextContent(/Select Item first/i);
  });

  test('shows a dash for an item that has no price configured', async () => {
    await openCreateForm();
    selectItem(ITEM_NO_PRICE);
    const card = costSummary();
    expect(within(card).getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(within(card).getByText(/Not included/)).toBeInTheDocument();
  });
});

describe('Menu Item submit payload', () => {
  test('does not send CostInfoId — the server derives it from the item', async () => {
    await openCreateForm();
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(posService.genericPost).toHaveBeenCalledTimes(1));
    const [, payload] = posService.genericPost.mock.calls[0];
    expect(payload).not.toHaveProperty('CostInfoId');
    expect(payload).not.toHaveProperty('CostInfoAmount');
    // The item — which is what the price is derived from — is still sent.
    expect(payload.ItemDetailId).toBe(ITEM_CHEAP);
  });

  test('form still submits without the price field being fillable', async () => {
    await openCreateForm();
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    // Price is not required, so validation must not block on it.
    await waitFor(() => expect(posService.genericPost).toHaveBeenCalled());
  });
});

describe('Menu Item edit', () => {
  // A row as returned by GET: carries the joined read-only columns.
  const EXISTING_ROW = {
    Id: 'eeeeeeee-0000-0000-0000-000000000001',
    ItemDetailId: ITEM_CHEAP,
    FoodTypeId: FOOD_VEG,
    BranchDetailId: BRANCH,
    CostInfoId: COST_CHEAP,
    CostInfoAmount: '120',
    FoodTypeName: 'Veg',
    FoodTypeIsVeg: 1,
    ChannelIds: [],
    VariantIds: [],
    Active: true,
    TenantId: 't-1',
    CreatedOn: '2026-07-01 10:00:00',
  };

  const openEditForm = async () => {
    posService.genericGet.mockResolvedValue([EXISTING_ROW]);
    render(<MenuMaster />);
    await screen.findByText('Masala Dosa');
    fireEvent.click(screen.getAllByTitle(/edit/i)[0]);
    await screen.findByLabelText(/^Item\b/i);
  };

  test('shows the existing price read-only', async () => {
    await openEditForm();
    expect(within(costSummary()).getByText('120')).toBeInTheDocument();
  });

  test('drops the stale CostInfoId so switching item re-prices the entry', async () => {
    await openEditForm();
    fireEvent.change(itemSelect(), { target: { value: ITEM_PRICEY } });
    expect(within(costSummary()).getByText('250')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(posService.genericPut).toHaveBeenCalledTimes(1));
    const [, payload] = posService.genericPut.mock.calls[0];
    // Keeping the old id would pin the entry to the previous item's price.
    expect(payload).not.toHaveProperty('CostInfoId');
    expect(payload.ItemDetailId).toBe(ITEM_PRICEY);
  });

  test('does not echo joined read-only columns back to the API', async () => {
    // These are rejected as unknown keys by the write schema.
    await openEditForm();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(posService.genericPut).toHaveBeenCalled());
    const [, payload] = posService.genericPut.mock.calls[0];
    ['CostInfoAmount', 'FoodTypeName', 'FoodTypeIsVeg', 'Id', 'TenantId', 'CreatedOn']
      .forEach((k) => expect(payload).not.toHaveProperty(k));
  });
});

describe('Menu Item list', () => {
  test('shows the price column instead of a cost-info id', async () => {
    posService.genericGet.mockResolvedValue([
      {
        Id: 'eeeeeeee-0000-0000-0000-000000000001',
        ItemDetailId: ITEM_CHEAP,
        FoodTypeId: FOOD_VEG,
        BranchDetailId: BRANCH,
        CostInfoId: COST_CHEAP,
        CostInfoAmount: '120',
        ChannelIds: [],
        VariantIds: [],
        Active: true,
      },
    ]);
    render(<MenuMaster />);

    const row = (await screen.findByText('Masala Dosa')).closest('tr');
    expect(within(row).getByText('120')).toBeInTheDocument();
    // The raw cost-info GUID is not surfaced.
    expect(within(row).queryByText(COST_CHEAP)).not.toBeInTheDocument();
  });
});
