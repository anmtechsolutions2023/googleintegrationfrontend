import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MasterDataSetup from '../MasterDataSetup';
import * as masterSetupService from '../../services/masterSetupService';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../services/masterSetupService', () => ({
  bootstrapMasterData: jest.fn(),
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));

// <Navigate> needs a Router; record where the page tried to send the user.
const mockNavigate = jest.fn();
let navigatedTo = null;
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Navigate: ({ to }) => {
    navigatedTo = to;
    return <div data-testid="navigate">{to}</div>;
  },
}));

const applyToken = jest.fn();

// The wizard is only reachable while setup is outstanding, so that is the
// default state for these tests.
const setUser = (overrides = {}) =>
  useAuth.mockReturnValue({
    applyToken,
    user: {
      tid: 'tenant-1',
      email: 'admin@test.com',
      onboardingStatus: 'APPROVED',
      scopes: ['TENANT:ADMIN'],
      setupCompleted: false,
      ...overrides,
    },
  });

const typeInto = (labelText, value) => {
  const input = screen.getByLabelText(labelText, { exact: false });
  fireEvent.change(input, { target: { value } });
};

beforeEach(() => {
  navigatedTo = null;
  setUser();
});

afterEach(() => jest.clearAllMocks());

test('renders the first (Organization) step', () => {
  render(<MasterDataSetup />);
  expect(screen.getByRole('heading', { name: /Master Data Setup/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
});

test('blocks Next and shows a Required error when a mandatory field is empty', () => {
  render(<MasterDataSetup />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // still on Organization step, and the required marker error is shown
  expect(screen.getByText('Required')).toBeInTheDocument();
  expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
});

test('advances to the Branch step once the required field is filled', () => {
  render(<MasterDataSetup />);
  typeInto('Organization Name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // Branch step shows the Branch Name field and the Address group
  expect(screen.getByLabelText(/Branch Name/i)).toBeInTheDocument();
  expect(screen.getByText('Address', { selector: 'legend' })).toBeInTheDocument();
});

test('item step can be skipped via the toggle', () => {
  render(<MasterDataSetup />);
  // Step 1 → 2
  typeInto('Organization Name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // Fill the minimum required branch fields (Address Tag / Config Tag are hidden
  // and auto-filled with 'Onboarding', so they aren't typed here).
  typeInto('Branch Name', 'Main');
  typeInto('Address Line 1', '12 MG Road');
  typeInto('First Name', 'Ravi');
  typeInto('Last Name', 'K');
  typeInto('Start Counter No', '1');
  typeInto('Format', 'INV-{0000}');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // On Item step — uncheck "Add a starter item"
  const toggle = screen.getByRole('checkbox');
  fireEvent.click(toggle);
  expect(screen.getByText(/Item creation skipped/i)).toBeInTheDocument();
  // Advancing to Review works even though item fields are empty
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: /Review/i })).toBeInTheDocument();
});

test('does not collect location details and omits locationMapper from the payload', async () => {
  masterSetupService.bootstrapMasterData.mockResolvedValue({
    data: { data: { organization: 'org-1', branch: 'br-1' } },
  });
  render(<MasterDataSetup />);
  typeInto('Organization Name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  // The Branch step no longer renders any location fields or a location toggle.
  expect(screen.queryByLabelText(/Provider Name/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Latitude/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Location Tag/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Add location details/i)).not.toBeInTheDocument();

  // The Address Tag, Config Tag and Address Type inputs are hidden
  // (hardcoded — Address Type is fixed to 'Onboarding').
  expect(screen.queryByLabelText(/Address Tag/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Config Tag/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Address Type/i)).not.toBeInTheDocument();

  // Fill the (now shorter) set of required branch fields
  typeInto('Branch Name', 'Main');
  typeInto('Address Line 1', '12 MG Road');
  typeInto('First Name', 'Ravi');
  typeInto('Last Name', 'K');
  typeInto('Start Counter No', '1');
  typeInto('Format', 'INV-{0000}');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  // Skip item too, then submit from Review
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));

  await waitFor(() => expect(masterSetupService.bootstrapMasterData).toHaveBeenCalledTimes(1));
  const payload = masterSetupService.bootstrapMasterData.mock.calls[0][0];
  expect(payload.branch.address.locationMapper).toBeUndefined();
  // Address Type is hidden and hardcoded to 'Onboarding'.
  expect(payload.branch.address.contactAddressType).toEqual({ Name: 'Onboarding' });
  // Hidden tags are hardcoded and still reach the API.
  expect(payload.branch.address.TagName).toBe('Onboarding');
  expect(payload.branch.transactionTypeConfig.TagName).toBe('Onboarding');
});

test('submitting from Review calls the bootstrap API and shows the id map', async () => {
  masterSetupService.bootstrapMasterData.mockResolvedValue({
    data: { data: { organization: 'org-1', branch: 'br-1' } },
  });
  render(<MasterDataSetup />);
  typeInto('Organization Name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  typeInto('Branch Name', 'Main');
  typeInto('Address Line 1', '12 MG Road');
  typeInto('First Name', 'Ravi');
  typeInto('Last Name', 'K');
  typeInto('Start Counter No', '1');
  typeInto('Format', 'INV-{0000}');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // Skip item to keep the test short
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // Review → Create
  fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));

  await waitFor(() => expect(masterSetupService.bootstrapMasterData).toHaveBeenCalledTimes(1));
  const payload = masterSetupService.bootstrapMasterData.mock.calls[0][0];
  expect(payload.organization).toEqual({ Name: 'ANM Tech' });
  expect(payload.item).toBeUndefined();
  expect(payload.branch.address.locationMapper).toBeUndefined();
  // Success screen shows the submitted values (not the returned ids).
  await waitFor(() => expect(screen.getByRole('heading', { name: /Tenancy setup complete/i })).toBeInTheDocument());
  expect(screen.getByText('ANM Tech')).toBeInTheDocument();
  expect(screen.queryByText('org-1')).not.toBeInTheDocument();
});

test('item step hides the Unit of Measure section and sends UnitName as hardcoded "Primary"', async () => {
  masterSetupService.bootstrapMasterData.mockResolvedValue({
    data: { data: { organization: 'org-1', branch: 'br-1', item: 'it-1' } },
  });
  render(<MasterDataSetup />);
  typeInto('Organization Name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  typeInto('Branch Name', 'Main');
  typeInto('Address Line 1', '12 MG Road');
  typeInto('First Name', 'Ravi');
  typeInto('Last Name', 'K');
  typeInto('Start Counter No', '1');
  typeInto('Format', 'INV-{0000}');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  // On the Item step: keep the starter item, fill required fields.
  // Unit of Measure is hidden (hardcoded to 'Primary').
  expect(screen.queryByText('Unit of Measure', { selector: 'legend' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Unit Name/i)).not.toBeInTheDocument();
  typeInto('Item Name', 'Paneer Tikka');
  typeInto('Category Name', 'Starter');
  typeInto('Amount', '250');
  typeInto('Tax Group Name', 'GST5');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));
  await waitFor(() => expect(masterSetupService.bootstrapMasterData).toHaveBeenCalledTimes(1));
  const payload = masterSetupService.bootstrapMasterData.mock.calls[0][0];
  expect(payload.item.uom).toEqual({ UnitName: 'Primary' });
  expect(payload.item.category).toEqual({ Name: 'Starter' });
});

// ── First-time setup gate ────────────────────────────────────────────────────
describe('setup gate behaviour', () => {
  // Fills every required field and submits, so gate assertions stay readable.
  const completeWizard = () => {
    typeInto('Organization Name', 'ANM Tech');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    typeInto('Branch Name', 'Main');
    typeInto('Address Line 1', '12 MG Road');
    typeInto('First Name', 'Ravi');
    typeInto('Last Name', 'K');
    typeInto('Start Counter No', '1');
    typeInto('Format', 'INV-{0000}');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));
  };

  test('shows the blocking banner while setup is outstanding', () => {
    render(<MasterDataSetup />);
    expect(screen.getByRole('alert')).toHaveTextContent(/unlock the application/i);
  });

  test('redirects to the dashboard when setup is already complete', () => {
    setUser({ setupCompleted: true });
    render(<MasterDataSetup />);
    // Never offered twice — the wizard is not rendered at all.
    expect(navigatedTo).toBe('/dashboard');
    expect(screen.queryByLabelText(/Organization Name/i)).not.toBeInTheDocument();
  });

  test('redirects when the token carries no setupCompleted claim at all', () => {
    // Pre-existing sessions: the tenant is already set up, so the wizard is gone.
    setUser({ setupCompleted: undefined });
    render(<MasterDataSetup />);
    expect(navigatedTo).toBe('/dashboard');
  });

  test('applies the refreshed setupToken so the user is no longer gated', async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({
      data: { data: { organization: 'org-1', branch: 'br-1', setupToken: 'fresh.jwt.token' } },
    });
    render(<MasterDataSetup />);
    completeWizard();

    await waitFor(() => expect(applyToken).toHaveBeenCalledWith('fresh.jwt.token'));
  });

  test('does not leak setupToken into the displayed id map', async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({
      data: { data: { organization: 'org-1', setupToken: 'fresh.jwt.token' } },
    });
    render(<MasterDataSetup />);
    completeWizard();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Tenancy setup complete/i })).toBeInTheDocument()
    );
    expect(screen.queryByText('fresh.jwt.token')).not.toBeInTheDocument();
  });

  test('still succeeds when the API omits a setupToken', async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({
      data: { data: { organization: 'org-1' } },
    });
    render(<MasterDataSetup />);
    completeWizard();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Tenancy setup complete/i })).toBeInTheDocument()
    );
    expect(applyToken).not.toHaveBeenCalled();
  });
});
