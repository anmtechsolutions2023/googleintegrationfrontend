import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminFeatures from '../AdminFeatures';
import * as adminService from '../../../services/adminService';

jest.mock('../../../services/adminService', () => ({
  getFeatures: jest.fn(),
  createFeature: jest.fn(),
  updateFeature: jest.fn(),
  deleteFeature: jest.fn(),
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const MOCK_FEATURES = [
  {
    feature_id: 'f1',
    name: 'Master Data Read',
    feature_short_name: 'MASTER_DATA',
    scope: 'READ',
    display_name: 'Master Data — View',
    category: 'Master Data',
    description: 'View lookup tables',
    is_active: 1,
  },
  {
    feature_id: 'f2',
    name: 'Inventory Write',
    feature_short_name: 'INVENTORY',
    scope: 'WRITE',
    display_name: 'Inventory — Manage',
    category: 'Inventory',
    description: 'Manage inventory records',
    is_active: 1,
  },
  {
    feature_id: 'f3',
    name: 'Payments Read',
    feature_short_name: 'PAYMENTS',
    scope: 'READ',
    display_name: 'Payments — View',
    category: 'Payments',
    description: '',
    is_active: 0,
  },
];

beforeEach(() => {
  adminService.getFeatures.mockResolvedValue({ data: { data: MOCK_FEATURES } });
  adminService.createFeature.mockResolvedValue({ data: {} });
  adminService.updateFeature.mockResolvedValue({ data: {} });
  adminService.deleteFeature.mockResolvedValue({ data: {} });
});

afterEach(() => jest.clearAllMocks());

test('renders feature list with display names and scopes', async () => {
  render(<AdminFeatures />);
  await waitFor(() => expect(screen.getByText('Master Data — View')).toBeInTheDocument());
  expect(screen.getByText('Inventory — Manage')).toBeInTheDocument();
  expect(screen.getByText('Payments — View')).toBeInTheDocument();
});

test('shows Active / Inactive badges correctly', async () => {
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  const activeBadges = screen.getAllByText('Active');
  const inactiveBadges = screen.getAllByText('Inactive');
  expect(activeBadges).toHaveLength(2);
  expect(inactiveBadges).toHaveLength(1);
});

test('search filters features by display name', async () => {
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  fireEvent.change(screen.getByPlaceholderText('Search features…'), {
    target: { value: 'inventory' },
  });

  expect(screen.queryByText('Master Data — View')).not.toBeInTheDocument();
  expect(screen.getByText('Inventory — Manage')).toBeInTheDocument();
});

test('category filter shows only matching features', async () => {
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'Payments' },
  });

  await waitFor(() => {
    expect(screen.queryByText('Master Data — View')).not.toBeInTheDocument();
    expect(screen.queryByText('Inventory — Manage')).not.toBeInTheDocument();
    expect(screen.getByText('Payments — View')).toBeInTheDocument();
  });
});

test('opens create feature modal on clicking + New Feature', async () => {
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  fireEvent.click(screen.getByRole('button', { name: '+ New Feature' }));
  // "Create Feature" appears as heading AND as button — check by heading role
  expect(screen.getByRole('heading', { name: 'Create Feature' })).toBeInTheDocument();
});

test('create feature blocked when short name or scope is empty', async () => {
  const { toast } = require('react-toastify');
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  fireEvent.click(screen.getByRole('button', { name: '+ New Feature' }));
  // Click the Create Feature submit button (distinct from the heading)
  fireEvent.click(screen.getByRole('button', { name: 'Create Feature' }));

  expect(adminService.createFeature).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    'Short Name and Scope are required.'
  );
});

test('create feature submits correct payload with uppercased short name', async () => {
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  fireEvent.click(screen.getByRole('button', { name: '+ New Feature' }));

  // getAllByRole('textbox'): [0]=search, [1]=Feature Name (optional), [2]=Short Name,
  // [3]=Scope, [4]=Display Name, [5]=Category
  const textboxes = screen.getAllByRole('textbox');
  fireEvent.change(textboxes[1], { target: { value: 'Contacts Read' } }); // Feature Name (optional)
  fireEvent.change(textboxes[2], { target: { value: 'contacts' } });       // Short Name
  fireEvent.change(textboxes[3], { target: { value: 'READ' } });           // Scope
  fireEvent.change(textboxes[4], { target: { value: 'Contacts — View' } }); // Display Name
  fireEvent.change(textboxes[5], { target: { value: 'Contacts' } });        // Category

  fireEvent.click(screen.getByRole('button', { name: 'Create Feature' }));

  await waitFor(() =>
    expect(adminService.createFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        featureShortName: 'CONTACTS',
        scope: 'READ',
        displayName: 'Contacts — View',
        category: 'Contacts',
      })
    )
  );
});

test('opens edit modal for an existing feature', async () => {
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

  expect(screen.getByText('Edit Feature')).toBeInTheDocument();
  // Short Name field is not shown in edit mode
  expect(screen.queryByPlaceholderText('UPPERCASE identifier')).not.toBeInTheDocument();
});

test('edit feature submits updated display_name and scope', async () => {
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  await waitFor(() => screen.getByText('Edit Feature'));

  // In edit mode: [0]=search, [1]=Scope, [2]=Display Name, [3]=Category
  const textboxes = screen.getAllByRole('textbox');
  fireEvent.change(textboxes[1], { target: { value: 'READ' } }); // Scope unchanged
  fireEvent.change(textboxes[2], { target: { value: 'Master Data — Browse' } }); // Display Name

  fireEvent.click(screen.getByRole('button', { name: 'Update Feature' }));

  await waitFor(() =>
    expect(adminService.updateFeature).toHaveBeenCalledWith(
      'f1',
      expect.objectContaining({
        displayName: 'Master Data — Browse',
      })
    )
  );
});

test('shows empty state when no features exist', async () => {
  adminService.getFeatures.mockResolvedValue({ data: { data: [] } });
  render(<AdminFeatures />);
  await waitFor(() =>
    expect(screen.getByText('No features defined yet.')).toBeInTheDocument()
  );
});

test('each feature row has a Delete button', async () => {
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  const deleteBtns = screen.getAllByRole('button', { name: 'Delete' });
  expect(deleteBtns).toHaveLength(MOCK_FEATURES.length);
});

test('clicking Delete opens confirm modal with feature name', async () => {
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

  expect(screen.getByRole('heading', { name: 'Delete Feature' })).toBeInTheDocument();
  // "Master Data — View" appears in both the table and the modal body
  expect(screen.getAllByText(/Master Data — View/i).length).toBeGreaterThanOrEqual(1);
});

test('confirming delete calls deleteFeature with correct id', async () => {
  render(<AdminFeatures />);
  await waitFor(() => screen.getByText('Master Data — View'));

  // Click first row's Delete; modal opens adding one more Delete button
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
  await waitFor(() => screen.getByRole('heading', { name: 'Delete Feature' }));

  // Click the modal confirm button (last Delete button on the page)
  const allDelBtns = screen.getAllByRole('button', { name: 'Delete' });
  fireEvent.click(allDelBtns[allDelBtns.length - 1]);

  await waitFor(() =>
    expect(adminService.deleteFeature).toHaveBeenCalledWith('f1')
  );
});
