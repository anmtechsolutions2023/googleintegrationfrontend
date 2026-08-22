import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Assets from '../Assets';
import posService from '../../../services/posService';
import crudService from '../../../services/crudService';
import { useAuth } from '../../../context/AuthContext';

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getPosBranches: jest.fn(),
    getAssets: jest.fn(),
    getAssetSummary: jest.fn(),
    createAsset: jest.fn(),
    updateAsset: jest.fn(),
    deleteAsset: jest.fn(),
    getAssetCategories: jest.fn(),
  },
}));
jest.mock('../../../services/crudService', () => ({
  __esModule: true,
  default: { getAll: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const ASSETS = [
  { Id: 'a1', Name: 'Deep Fryer', CategoryName: 'Kitchen Equipment', AssetCategoryId: 'c1',
    BranchName: 'Koramangala', BranchDetailId: 'b1', SerialNo: 'SN-1',
    PurchaseDate: '2026-01-15', PurchaseCost: 45000, Status: 'in_use' },
  { Id: 'a2', Name: 'POS Terminal', CategoryName: 'IT Equipment', AssetCategoryId: 'c2',
    BranchName: 'Indiranagar', BranchDetailId: 'b2', SerialNo: null,
    PurchaseDate: null, PurchaseCost: 25000, Status: 'under_repair' },
];

const SUMMARY = {
  groups: [
    { BranchName: 'Koramangala', CategoryName: 'Kitchen Equipment', Assets: 1, PurchaseCost: 45000 },
    { BranchName: 'Indiranagar', CategoryName: 'IT Equipment', Assets: 1, PurchaseCost: 25000 },
  ],
  totalAssets: 2,
  totalValue: 70000,
};

beforeEach(() => {
  useAuth.mockReturnValue({ user: { scopes: ['TENANT:ADMIN'] } });
  posService.getAssets.mockResolvedValue(ASSETS);
  posService.getAssetSummary.mockResolvedValue(SUMMARY);
  posService.getAssetCategories.mockResolvedValue([
    { Id: 'c1', Name: 'Kitchen Equipment' }, { Id: 'c2', Name: 'IT Equipment' },
  ]);
  posService.createAsset.mockResolvedValue({ id: 'new' });
  posService.getPosBranches.mockResolvedValue([{ Id: 'b1', BranchName: 'Koramangala' }, { Id: 'b2', BranchName: 'Indiranagar' }]);
});

afterEach(() => jest.clearAllMocks());

const renderPage = async () => {
  render(<Assets />);
  await screen.findByText('Deep Fryer');
};

describe('the register', () => {
  test('lists assets with branch, cost and status', async () => {
    await renderPage();
    const row = screen.getByText('Deep Fryer').closest('tr');
    expect(within(row).getByText('Koramangala')).toBeInTheDocument();
    expect(within(row).getByText('₹45,000')).toBeInTheDocument();
    expect(within(row).getByText('In use')).toBeInTheDocument();
  });

  test('totals the register value', async () => {
    await renderPage();
    expect(screen.getByText('₹70,000')).toBeInTheDocument();
  });

  test('breaks value down by branch and category', async () => {
    await renderPage();
    expect(screen.getByText(/Value by branch and category/i)).toBeInTheDocument();
  });

  test('reads under_repair as a human label, not the raw enum', async () => {
    await renderPage();
    // The filter dropdown carries the same label, so read the row's own cell.
    const row = screen.getByText('POS Terminal').closest('tr');
    expect(within(row).getByText('Under repair')).toBeInTheDocument();
    expect(within(row).queryByText('under_repair')).not.toBeInTheDocument();
  });
});

describe('filters', () => {
  test('narrows to one branch', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Branch filter'), { target: { value: 'b1' } });
    expect(screen.getByText('Deep Fryer')).toBeInTheDocument();
    expect(screen.queryByText('POS Terminal')).not.toBeInTheDocument();
  });

  test('narrows to one status', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'under_repair' } });
    expect(screen.getByText('POS Terminal')).toBeInTheDocument();
    expect(screen.queryByText('Deep Fryer')).not.toBeInTheDocument();
  });
});

describe('registering an asset', () => {
  const fillAndSubmit = async (overrides = {}) => {
    fireEvent.click(screen.getByRole('button', { name: /Register asset/i }));
    await screen.findByRole('dialog', { name: 'Asset' });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: overrides.name ?? 'Griddle' } });
    if (overrides.category !== null) {
      fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'c1' } });
    }
    if (overrides.branch !== null) {
      fireEvent.change(screen.getByLabelText(/^Branch \*/), { target: { value: 'b1' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Register asset' }));
  };

  test('requires a branch — an asset always belongs to an outlet', async () => {
    await renderPage();
    await fillAndSubmit({ branch: null });
    await waitFor(() => expect(posService.createAsset).not.toHaveBeenCalled());
  });

  test('sends a blank serial as null, not an empty string', async () => {
    // Empty strings would collide under the unique serial key for every
    // asset that does not have one.
    await renderPage();
    await fillAndSubmit();
    await waitFor(() => expect(posService.createAsset).toHaveBeenCalled());
    expect(posService.createAsset.mock.calls[0][0].SerialNo).toBeNull();
  });

  test('defaults a new asset to in use', async () => {
    await renderPage();
    await fillAndSubmit();
    await waitFor(() => expect(posService.createAsset).toHaveBeenCalled());
    expect(posService.createAsset.mock.calls[0][0].Status).toBe('in_use');
  });
});

describe('permissions', () => {
  test('hides every write control from a read-only user', async () => {
    useAuth.mockReturnValue({ user: { scopes: ['ASSET:READ'] } });
    await renderPage();
    expect(screen.queryByRole('button', { name: /Register asset/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
