import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MasterDataSetup from '../MasterDataSetup';
import * as masterSetupService from '../../services/masterSetupService';

jest.mock('../../services/masterSetupService', () => ({
  bootstrapMasterData: jest.fn(),
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const typeInto = (labelText, value) => {
  const input = screen.getByLabelText(labelText, { exact: false });
  fireEvent.change(input, { target: { value } });
};

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
  await waitFor(() => expect(screen.getByRole('heading', { name: /Master data created/i })).toBeInTheDocument());
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
