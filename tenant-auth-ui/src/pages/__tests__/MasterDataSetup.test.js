import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MasterDataSetup from '../MasterDataSetup';
import * as masterSetupService from '../../services/masterSetupService';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../services/masterSetupService', () => ({
  bootstrapMasterData: jest.fn(),
}));
// Pass two: the items, created only after the tenancy exists.
jest.mock('../../services/importService', () => ({
  __esModule: true,
  default: { importItems: jest.fn(), publishMenuEntries: jest.fn(), previewChecks: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
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

// The wizard now opens on a "Setup Wizard" welcome screen; "Begin setup" enters
// the step flow. Most tests care about the steps, so they start the wizard first.
const beginSetup = () =>
  fireEvent.click(screen.getByRole('button', { name: /Begin setup/i }));
const renderWizard = () => {
  render(<MasterDataSetup />);
  beginSetup();
};

beforeEach(() => {
  navigatedTo = null;
  setUser();
});

afterEach(() => jest.clearAllMocks());

test('shows the Setup Wizard welcome screen first, before any form fields', () => {
  render(<MasterDataSetup />);
  expect(screen.getByRole('heading', { name: /Setup Wizard/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Begin setup/i })).toBeInTheDocument();
  // No form field yet — the user lands on a focused intro, not the Organization step.
  expect(screen.queryByLabelText(/Organization Name/i)).not.toBeInTheDocument();
});

test('renders the first (Organization) step after Begin setup', () => {
  renderWizard();
  expect(screen.getByRole('heading', { name: /Master Data Setup/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
});

test('blocks Next and shows a Required error when a mandatory field is empty', () => {
  renderWizard();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // still on Organization step, and the required marker error is shown
  expect(screen.getByText('Required')).toBeInTheDocument();
  expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
});

test('advances to the Branch step once the required field is filled', () => {
  renderWizard();
  typeInto('Organization Name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // Branch step shows the Branch Name field and the Address group
  expect(screen.getByLabelText(/Branch Name/i)).toBeInTheDocument();
  expect(screen.getByText('Address', { selector: 'legend' })).toBeInTheDocument();
});

test('item step can be skipped via the toggle', () => {
  renderWizard();
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
  renderWizard();
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
  renderWizard();
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
  renderWizard();
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
    beginSetup();
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


// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — the rates inside a tax group, and the CSV list
// ─────────────────────────────────────────────────────────────────────────────
const importService = require('../../services/importService').default;
const { toast } = require('react-toastify');

const fillOrgAndBranch = () => {
  typeInto('Organization Name', 'Sarjapura Foods');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  typeInto('Branch Name', 'Sarjapura Road');
  typeInto('Address Line 1', '142 Sarjapura Road');
  typeInto('First Name', 'Priya');
  typeInto('Last Name', 'Raman');
  typeInto('Start Counter No', '1');
  typeInto('Format', 'INV-{0000}');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
};

const toItemStep = () => { renderWizard(); fillOrgAndBranch(); };

const CSV = [
  'name,category,unit,price,tax_group,tax_components,food_type',
  'Plain Tea,Tea,Glass,15,GST 5%,CGST:2.5|SGST:2.5,Veg',
  'Cold Brew Kit,Retail,Box,1200,GST 18%,CGST:9|SGST:9,Veg',
].join('\n');

const pasteAndCheck = (text = CSV) => {
  fireEvent.click(screen.getByRole('radio', { name: /Upload a list/i }));
  fireEvent.change(screen.getByLabelText('Paste rows'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Check rows/i }));
};

describe('tax rates on the typed starter item', () => {
  // A tax group is a CONTAINER — the rates live in the tax types mapped into
  // it. Naming one "GST 18%" and stopping there created a group that charged
  // nothing, on every bill, silently. The form must never produce that.
  test('starts from the standard split rather than an empty group', () => {
    toItemStep();
    expect(screen.getByLabelText('Rate 1 name')).toHaveValue('CGST');
    expect(screen.getByLabelText('Rate 1 percent')).toHaveValue(2.5);
    expect(screen.getByLabelText('Rate 2 name')).toHaveValue('SGST');
    expect(screen.getByText('Total 5%')).toBeInTheDocument();
  });

  test('totals the rates as they are edited', () => {
    toItemStep();
    fireEvent.change(screen.getByLabelText('Rate 1 percent'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Rate 2 percent'), { target: { value: '9' } });
    expect(screen.getByText('Total 18%')).toBeInTheDocument();
  });

  // Inter-state is one IGST row, not a split. The default never produces it,
  // so removing a row has to be possible.
  test('a rate can be removed and another added', () => {
    toItemStep();
    fireEvent.click(screen.getByRole('button', { name: /Remove rate 2/i }));
    expect(screen.queryByLabelText('Rate 2 name')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rate 1 name'), { target: { value: 'IGST' } });
    fireEvent.change(screen.getByLabelText('Rate 1 percent'), { target: { value: '18' } });
    expect(screen.getByText('Total 18%')).toBeInTheDocument();
  });

  test('the last rate cannot be removed — a group with none prices at 0%', () => {
    toItemStep();
    fireEvent.click(screen.getByRole('button', { name: /Remove rate 2/i }));
    expect(screen.getByRole('button', { name: /Remove rate 1/i })).toBeDisabled();
  });

  test('refuses to move on with a rate that has no percentage', () => {
    toItemStep();
    typeInto('Item Name', 'Paneer Tikka');
    typeInto('Category Name', 'Starters');
    typeInto('Amount', '240');
    typeInto('Tax Group Name', 'GST 18%');
    fireEvent.change(screen.getByLabelText('Rate 1 percent'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Every rate needs a name and a percentage/i)).toBeInTheDocument();
  });

  // THE assertion. Without taxTypes on the payload the group is created empty
  // and the item bills nothing.
  test('sends the rates with the tax group', async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({
      data: { data: { organization: 'org-1', branch: 'br-1' } },
    });
    toItemStep();
    typeInto('Item Name', 'Paneer Tikka');
    typeInto('Category Name', 'Starters');
    typeInto('Amount', '240');
    typeInto('Tax Group Name', 'GST 18%');
    fireEvent.change(screen.getByLabelText('Rate 1 percent'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Rate 2 percent'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));

    await waitFor(() => expect(masterSetupService.bootstrapMasterData).toHaveBeenCalled());
    const [payload] = masterSetupService.bootstrapMasterData.mock.calls[0];
    expect(payload.item.costInfo.taxGroup).toEqual({
      Name: 'GST 18%',
      taxTypes: [{ Name: 'CGST', Value: '9' }, { Name: 'SGST', Value: '9' }],
    });
  });

  // The group is named, not id'd. The review must show the NAME the user typed
  // and the rates it will actually charge — not one without the other.
  test('the review shows the group name AND what it charges', () => {
    toItemStep();
    typeInto('Item Name', 'Paneer Tikka');
    typeInto('Category Name', 'Starters');
    typeInto('Amount', '240');
    typeInto('Tax Group Name', 'GST 18%');
    fireEvent.change(screen.getByLabelText('Rate 1 percent'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Rate 2 percent'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('GST 18%')).toBeInTheDocument();
    expect(screen.getByText('CGST 9% + SGST 9% = 18%')).toBeInTheDocument();
  });
});

describe('step 3 — uploading a list', () => {
  test('offers both ways in, with the typed item still the default', () => {
    toItemStep();
    expect(screen.getByRole('radio', { name: /Type one item/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Upload a list/i })).toHaveAttribute('aria-checked', 'false');
    // The existing single-item path is untouched and still on screen.
    expect(screen.getByLabelText(/Item Name/i)).toBeInTheDocument();
  });

  test('checking a file reports what it will do, and asks for nothing typed', () => {
    toItemStep();
    pasteAndCheck();
    expect(screen.getByText('2 items will be created')).toBeInTheDocument();
    expect(screen.getByText('2 categories')).toBeInTheDocument();
    expect(screen.getByText('2 tax groups')).toBeInTheDocument();
    // The single-item fields are gone — a file describes its own items.
    expect(screen.queryByLabelText(/Item Name/i)).not.toBeInTheDocument();
  });

  // The whole reason step 3 can hold a file at all.
  test('creates nothing while checking', () => {
    toItemStep();
    pasteAndCheck();
    expect(importService.importItems).not.toHaveBeenCalled();
    expect(masterSetupService.bootstrapMasterData).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing has been saved/i)).toBeInTheDocument();
  });

  test('names the rows it cannot read, and leaves them out of the count', () => {
    toItemStep();
    pasteAndCheck([
      'name,category,unit,price,tax_group',
      'Plain Tea,Tea,Glass,15,GST 5%',
      'Cold Coffee,Coffee,Glass,1O9,GST 5%',
    ].join('\n'));
    expect(screen.getByText('1 item will be created')).toBeInTheDocument();
    expect(screen.getByText('1 row cannot be read')).toBeInTheDocument();
    expect(screen.getByText(/price .1O9. is not a number/)).toBeInTheDocument();
  });

  // A row stating no rate is not a row with no tax. Announced before it is
  // applied, never discovered afterwards.
  test('announces the default split before applying it', () => {
    toItemStep();
    pasteAndCheck([
      'name,category,unit,price,tax_group',
      'Plain Tea,Tea,Glass,15,GST 5%',
    ].join('\n'));
    expect(screen.getByText(/1 row states no tax rate — CGST:2.5 \+ SGST:2.5 will be applied/)).toBeInTheDocument();
  });

  // One group given two different sets of rates is a contradiction the server
  // refuses mid-import, which would leave a half-written catalogue.
  test('catches a tax group given two different sets of rates', () => {
    toItemStep();
    pasteAndCheck([
      'name,category,unit,price,tax_group,tax_components',
      'Plain Tea,Tea,Glass,15,GST 5%,CGST:2.5|SGST:2.5',
      'Masala Chai,Tea,Glass,25,GST 5%,CGST:9|SGST:9',
    ].join('\n'));
    expect(screen.getByText(/Tax group .GST 5%. is given two different sets of rates/)).toBeInTheDocument();
  });

  test('will not move on from an empty upload', () => {
    toItemStep();
    fireEvent.click(screen.getByRole('radio', { name: /Upload a list/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Paste rows')).toBeInTheDocument();
  });
});

describe('Enter moves the step on', () => {
  test('on a step whose fields are filled', () => {
    renderWizard();
    typeInto('Organization Name', 'Sarjapura Foods');
    fireEvent.keyDown(screen.getByLabelText(/Organization Name/i), { key: 'Enter' });
    expect(screen.getByLabelText(/Branch Name/i)).toBeInTheDocument();
  });

  // The step with nothing to fill in is exactly the one where somebody presses
  // Enter expecting to move on.
  test('on the item step with the box unchecked', () => {
    toItemStep();
    fireEvent.click(screen.getByRole('checkbox', { name: /Add a starter item/i }));
    fireEvent.keyDown(screen.getByText(/Item creation skipped/i), { key: 'Enter' });
    expect(screen.getByRole('heading', { name: /Review/i })).toBeInTheDocument();
  });

  // Deliberately NOT on Review: that button commits a transaction.
  test('but never commits the transaction from Review', () => {
    toItemStep();
    fireEvent.click(screen.getByRole('checkbox', { name: /Add a starter item/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.keyDown(screen.getByRole('heading', { name: /Review/i }), { key: 'Enter' });
    expect(masterSetupService.bootstrapMasterData).not.toHaveBeenCalled();
  });

  test('and does not fire from inside the paste box, where a newline is a row', () => {
    toItemStep();
    fireEvent.click(screen.getByRole('radio', { name: /Upload a list/i }));
    fireEvent.keyDown(screen.getByLabelText('Paste rows'), { key: 'Enter' });
    expect(screen.getByLabelText('Paste rows')).toBeInTheDocument();
  });
});

describe('"Create everything" — two passes, in order', () => {
  const IDS = { organization: 'org-1', branch: 'br-1' };
  const runBoth = async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({
      data: { data: { ...IDS, setupToken: 'fresh-token' } },
    });
    toItemStep();
    pasteAndCheck();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));
  };

  test('the tenancy first, the items only after it', async () => {
    importService.importItems.mockResolvedValue({
      summary: { created: 2, updated: 0, skipped: 0, failed: 0 },
      rows: [{ row: 1, name: 'Plain Tea', status: 'created' },
        { row: 2, name: 'Cold Brew Kit', status: 'created' }],
    });
    importService.publishMenuEntries.mockResolvedValue({ summary: { created: 2 } });

    await runBoth();

    await waitFor(() => expect(importService.importItems).toHaveBeenCalled());
    const bootstrapAt = masterSetupService.bootstrapMasterData.mock.invocationCallOrder[0];
    const importAt = importService.importItems.mock.invocationCallOrder[0];
    expect(bootstrapAt).toBeLessThan(importAt);
  });

  // The bulk endpoint is behind the setup gate. Without the refreshed token in
  // hand first, pass two is refused.
  test('applies the refreshed token before the import runs', async () => {
    importService.importItems.mockResolvedValue({ summary: {}, rows: [] });
    await runBoth();
    await waitFor(() => expect(applyToken).toHaveBeenCalledWith('fresh-token'));
    expect(applyToken.mock.invocationCallOrder[0])
      .toBeLessThan(importService.importItems.mock.invocationCallOrder[0]);
  });

  test('sends the checked rows, without the line numbers', async () => {
    importService.importItems.mockResolvedValue({ summary: {}, rows: [] });
    await runBoth();
    await waitFor(() => expect(importService.importItems).toHaveBeenCalled());
    const [rows] = importService.importItems.mock.calls[0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveProperty('line');
    expect(rows[0].name).toBe('Plain Tea');
    // Each row keeps its own rates — the whole point of the second slab.
    expect(rows[1].taxGroup).toBe('GST 18%');
    expect(rows[1].taxComponents).toEqual([{ name: 'CGST', value: 9 }, { name: 'SGST', value: 9 }]);
  });

  // Publishing uses the branch the wizard just created, by ID, and each row
  // carries its OWN food type — one default for the whole file is what
  // published a mixed menu as entirely Veg.
  test('publishes onto the branch it just created', async () => {
    importService.importItems.mockResolvedValue({
      summary: { created: 2 },
      rows: [{ row: 1, name: 'Plain Tea', status: 'created' },
        { row: 2, name: 'Cold Brew Kit', status: 'created' }],
    });
    importService.publishMenuEntries.mockResolvedValue({ summary: { created: 2 } });
    await runBoth();
    await waitFor(() => expect(importService.publishMenuEntries).toHaveBeenCalled());
    const [payload] = importService.publishMenuEntries.mock.calls[0];
    expect(payload.branchDetailId).toBe('br-1');
    expect(payload.items).toEqual([
      { name: 'Plain Tea', foodType: 'Veg' },
      { name: 'Cold Brew Kit', foodType: 'Veg' },
    ]);
  });

  // The one thing this screen must not get wrong. A failed second pass is not
  // a failed setup: the tenancy stands and the app is unlocked.
  test('keeps the tenancy when the items fail', async () => {
    importService.importItems.mockRejectedValue({
      response: { data: { message: 'nope' } },
    });
    await runBoth();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Tenancy setup complete/i })).toBeInTheDocument());
    expect(toast.warn).toHaveBeenCalled();
  });

  // …and the opposite: a failed FIRST pass saved nothing, so the user must stay
  // on the wizard rather than be told it worked.
  test('stays on the wizard when the tenancy fails, and never runs pass two', async () => {
    masterSetupService.bootstrapMasterData.mockRejectedValue({
      response: { data: { message: 'Branch name already exists' } },
    });
    toItemStep();
    pasteAndCheck();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Branch name already exists'));
    expect(importService.importItems).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Create everything/i })).toBeInTheDocument();
  });

  test('reports both passes on the way out', async () => {
    importService.importItems.mockResolvedValue({
      summary: { created: 1, updated: 0, skipped: 0, failed: 1 },
      rows: [{ row: 1, name: 'Plain Tea', status: 'created' },
        { row: 2, name: 'Cold Brew Kit', status: 'failed', reason: 'price cannot be negative' }],
    });
    importService.publishMenuEntries.mockResolvedValue({ summary: { created: 1 } });
    await runBoth();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Tenancy setup complete/i })).toBeInTheDocument());
    expect(screen.getByText('created')).toBeInTheDocument();
    expect(screen.getByText('price cannot be negative')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download the 1 failed row/i })).toBeInTheDocument();
  });

  // No file, no second pass — the existing single-item path must not gain one.
  test('runs one pass only when the item was typed', async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({
      data: { data: { ...IDS, setupToken: 't' } },
    });
    toItemStep();
    typeInto('Item Name', 'Paneer Tikka');
    typeInto('Category Name', 'Starters');
    typeInto('Amount', '240');
    typeInto('Tax Group Name', 'GST 5%');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Tenancy setup complete/i })).toBeInTheDocument());
    expect(importService.importItems).not.toHaveBeenCalled();
  });
});
