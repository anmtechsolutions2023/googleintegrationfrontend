import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MasterDataSetup from '../MasterDataSetup';
import * as masterSetupService from '../../services/masterSetupService';
import * as posService from '../../services/posService';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../services/masterSetupService', () => ({
  bootstrapMasterData: jest.fn(),
}));
// Pass two: the menu file, imported only after the tenancy exists.
jest.mock('../../services/menuService', () => ({
  __esModule: true,
  default: { applyMenuImport: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
// The wizard fetches the real column widths so each input's maxLength comes from
// the same source as the server's Joi rules rather than from a second copy of the
// numbers. Empty is a valid answer — the fields fall back to their own maxLength —
// so this mock keeps the tests off the network without changing what they assert.
jest.mock('../../services/posService', () => ({ getFieldLimits: jest.fn() }));

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
  // Armed HERE, not in the jest.mock factory: create-react-app sets
  // `resetMocks: true`, which strips a factory's implementation before every test
  // and leaves the mock returning undefined — so `getFieldLimits().then(...)` threw.
  // Every other mock in this file is armed per test for the same reason.
  //
  // {} is a legitimate answer: each field falls back to its own maxLength, so the
  // tests assert the wizard's behaviour rather than the served limits.
  posService.getFieldLimits.mockResolvedValue({});
});

afterEach(() => jest.clearAllMocks());

test('shows the Setup Wizard welcome screen first, before any form fields', () => {
  render(<MasterDataSetup />);
  expect(screen.getByRole('heading', { name: /Setup Wizard/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Begin setup/i })).toBeInTheDocument();
  // No form field yet — the user lands on a focused intro, not the Organization step.
  expect(screen.queryByLabelText(/Legal \/ group name/i)).not.toBeInTheDocument();
});

test('renders the first (Organization) step after Begin setup', () => {
  renderWizard();
  expect(screen.getByRole('heading', { name: /Master Data Setup/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/Legal \/ group name/i)).toBeInTheDocument();
});

test('blocks Next and shows a Required error when a mandatory field is empty', () => {
  renderWizard();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // still on Organization step, and the required marker error is shown
  expect(screen.getByText('Required')).toBeInTheDocument();
  expect(screen.getByLabelText(/Legal \/ group name/i)).toBeInTheDocument();
});

test('advances to the Branch step once the required field is filled', () => {
  renderWizard();
  typeInto('Legal / group name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // Branch step shows the Branch Name field and the Address group
  expect(screen.getByLabelText(/Outlet name/i)).toBeInTheDocument();
  expect(screen.getByText('Address', { selector: 'legend' })).toBeInTheDocument();
});

test('item step can be skipped via the toggle', () => {
  renderWizard();
  // Step 1 → 2
  typeInto('Legal / group name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // Fill the minimum required branch fields (Address Tag / Config Tag are hidden
  // and auto-filled with 'Onboarding', so they aren't typed here).
  typeInto('Outlet name', 'Main');
  typeInto('Address Line 1', '12 MG Road');
  typeInto('First Name', 'Ravi');
  typeInto('Last Name', 'K');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  // On the Menu step — uncheck "Add my menu"
  const toggle = screen.getByRole('checkbox');
  fireEvent.click(toggle);
  expect(screen.getByText(/Menu skipped/i)).toBeInTheDocument();
  // Advancing to Review works even though item fields are empty
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: /Review/i })).toBeInTheDocument();
});

test('does not collect location details and omits locationMapper from the payload', async () => {
  masterSetupService.bootstrapMasterData.mockResolvedValue({
    data: { data: { organization: 'org-1', branch: 'br-1' } },
  });
  renderWizard();
  typeInto('Legal / group name', 'ANM Tech');
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
  typeInto('Outlet name', 'Main');
  typeInto('Address Line 1', '12 MG Road');
  typeInto('First Name', 'Ravi');
  typeInto('Last Name', 'K');
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
  // Numbering is NOT sent at all any more — the wizard stopped asking, and the
  // API defaults the whole node (INV-0001, tagged 'Onboarding'). The row is
  // still created: branchdetail.TransactionTypeConfigId is a NOT NULL foreign
  // key, so a branch cannot exist without one. Asserting its ABSENCE here is
  // what catches the section being reintroduced by accident.
  expect(payload.branch.transactionTypeConfig).toBeUndefined();
});

test('submitting from Review calls the bootstrap API and shows the id map', async () => {
  masterSetupService.bootstrapMasterData.mockResolvedValue({
    data: { data: { organization: 'org-1', branch: 'br-1' } },
  });
  renderWizard();
  typeInto('Legal / group name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  typeInto('Outlet name', 'Main');
  typeInto('Address Line 1', '12 MG Road');
  typeInto('First Name', 'Ravi');
  typeInto('Last Name', 'K');
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

// ── First-time setup gate ────────────────────────────────────────────────────
describe('setup gate behaviour', () => {
  // Fills every required field and submits, so gate assertions stay readable.
  const completeWizard = () => {
    beginSetup();
    typeInto('Legal / group name', 'ANM Tech');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    typeInto('Outlet name', 'Main');
    typeInto('Address Line 1', '12 MG Road');
    typeInto('First Name', 'Ravi');
    typeInto('Last Name', 'K');
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
    expect(screen.queryByLabelText(/Legal \/ group name/i)).not.toBeInTheDocument();
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
const menuService = require('../../services/menuService').default;
const { toast } = require('react-toastify');

const fillOrgAndBranch = () => {
  typeInto('Legal / group name', 'Sarjapura Foods');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  typeInto('Outlet name', 'Sarjapura Road');
  typeInto('Address Line 1', '142 Sarjapura Road');
  typeInto('First Name', 'Priya');
  typeInto('Last Name', 'Raman');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
};

const toItemStep = () => { renderWizard(); fillOrgAndBranch(); };

const CSV = [
  'name,category,unit,price,tax_group,tax_components,food_type',
  'Plain Tea,Tea,Glass,15,GST 5%,CGST:2.5|SGST:2.5,Veg',
  'Cold Brew Kit,Retail,Box,1200,GST 18%,CGST:9|SGST:9,Veg',
].join('\n');

const pasteAndCheck = (text = CSV) => {
  fireEvent.change(screen.getByLabelText('Paste rows'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Check rows/i }));
};

describe('step 3 — uploading a list', () => {
  test('offers only the file — no typed item form', () => {
    toItemStep();
    expect(screen.queryByRole('radio', { name: /Type one item/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Item Name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Tax Group Name/i)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Add my menu/i })).toBeChecked();
    expect(screen.getByRole('button', { name: /Use our sample menu/i })).toBeInTheDocument();
  });

  test('checking a file reports what it will do, and asks for nothing typed', () => {
    toItemStep();
    pasteAndCheck();
    expect(screen.getByText('2 dishes')).toBeInTheDocument();
    expect(screen.getByText('2 categories')).toBeInTheDocument();
    expect(screen.getByText('2 tax groups')).toBeInTheDocument();
    // The single-item fields are gone — a file describes its own dishes.
    expect(screen.queryByLabelText(/Item Name/i)).not.toBeInTheDocument();
  });

  // The whole reason step 3 can hold a file at all.
  test('creates nothing while checking', () => {
    toItemStep();
    pasteAndCheck();
    expect(menuService.applyMenuImport).not.toHaveBeenCalled();
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
    expect(screen.getByText('1 dish')).toBeInTheDocument();
    expect(screen.getByText('1 row cannot be read')).toBeInTheDocument();
    expect(screen.getByText(/Price .1O9. is not a number/)).toBeInTheDocument();
  });

  // The add-ons and hours files have their own shape; in the menu slot they
  // would be read as dishes with no names.
  test('refuses an add-ons file in the menu slot', () => {
    toItemStep();
    pasteAndCheck([
      'group,min,max,addon,price',
      'Dips,0,2,Mint chutney,15',
    ].join('\n'));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/add-ons or hours file/));
  });

  // The quickest way to a working till: the sample menu that ships with the
  // app, with its add-ons and opening hours.
  test('offers the sample menu, with its add-ons and hours', async () => {
    const files = {
      '/samples/menu-sample.csv': 'name,category,unit,diet,price,zomato_listed\nMasala Dosa,Breakfast,Plate,Veg,120,Yes\nButter Naan,Breads,Piece,Veg,50,No\n',
      '/samples/addons-sample.csv': 'group,min,max,addon,price\nDips,0,2,Mint chutney,15\n',
      '/samples/hours-sample.csv': 'category,days,from,to\nBreakfast,Mon-Sun,07:00,11:30\n',
    };
    global.fetch = jest.fn((url) => Promise.resolve({ ok: true, text: () => Promise.resolve(files[url]) }));
    toItemStep();
    fireEvent.click(screen.getByRole('button', { name: /Use our sample menu/i }));
    expect(await screen.findByText('2 dishes')).toBeInTheDocument();
    expect(screen.getByText('menu-sample.csv')).toBeInTheDocument();
    expect(screen.getByText('1 on zomato')).toBeInTheDocument();
    expect(screen.getByText('1 add-ons')).toBeInTheDocument();
    expect(screen.getByText('opening hours')).toBeInTheDocument();
  });

  test('will not move on from an empty upload', () => {
    toItemStep();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Paste rows')).toBeInTheDocument();
  });
});

describe('Enter moves the step on', () => {
  test('on a step whose fields are filled', () => {
    renderWizard();
    typeInto('Legal / group name', 'Sarjapura Foods');
    fireEvent.keyDown(screen.getByLabelText(/Legal \/ group name/i), { key: 'Enter' });
    expect(screen.getByLabelText(/Outlet name/i)).toBeInTheDocument();
  });

  // The step with nothing to fill in is exactly the one where somebody presses
  // Enter expecting to move on.
  test('on the item step with the box unchecked', () => {
    toItemStep();
    fireEvent.click(screen.getByRole('checkbox', { name: /Add my menu/i }));
    fireEvent.keyDown(screen.getByText(/Menu skipped/i), { key: 'Enter' });
    expect(screen.getByRole('heading', { name: /Review/i })).toBeInTheDocument();
  });

  // Deliberately NOT on Review: that button commits a transaction.
  test('but never commits the transaction from Review', () => {
    toItemStep();
    fireEvent.click(screen.getByRole('checkbox', { name: /Add my menu/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.keyDown(screen.getByRole('heading', { name: /Review/i }), { key: 'Enter' });
    expect(masterSetupService.bootstrapMasterData).not.toHaveBeenCalled();
  });

  test('and does not fire from inside the paste box, where a newline is a row', () => {
    toItemStep();
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

  test('the tenancy first, the menu only after it', async () => {
    menuService.applyMenuImport.mockResolvedValue({ summary: { new: 2, changed: 0, unchanged: 0, errors: 0 }, rows: [] });
    await runBoth();
    await waitFor(() => expect(menuService.applyMenuImport).toHaveBeenCalled());
    const bootstrapAt = masterSetupService.bootstrapMasterData.mock.invocationCallOrder[0];
    const importAt = menuService.applyMenuImport.mock.invocationCallOrder[0];
    expect(bootstrapAt).toBeLessThan(importAt);
  });

  // The menu endpoint is behind the setup gate. Without the refreshed token in
  // hand first, pass two is refused.
  test('applies the refreshed token before the import runs', async () => {
    menuService.applyMenuImport.mockResolvedValue({ summary: {}, rows: [] });
    await runBoth();
    await waitFor(() => expect(applyToken).toHaveBeenCalledWith('fresh-token'));
    expect(applyToken.mock.invocationCallOrder[0])
      .toBeLessThan(menuService.applyMenuImport.mock.invocationCallOrder[0]);
  });

  // The rows go as the menu file — the same import Menu › Dishes › Import
  // uses — so each keeps its own diet and tax rates, and the dishes land on
  // the new branch without a separate publish step.
  test('sends the checked rows as the menu file, in one call', async () => {
    menuService.applyMenuImport.mockResolvedValue({ summary: {}, rows: [] });
    await runBoth();
    await waitFor(() => expect(menuService.applyMenuImport).toHaveBeenCalledTimes(1));
    const [payload] = menuService.applyMenuImport.mock.calls[0];
    expect(payload.menu).toHaveLength(2);
    expect(payload.menu[0].name).toBe('Plain Tea');
    expect(payload.menu[1].taxgroup).toBe('GST 18%');
    expect(payload.menu[1].taxcomponents).toBe('CGST:9|SGST:9');
    expect(payload.menu[1].foodtype).toBe('Veg');
    expect(payload.addons).toEqual([]);
  });

  // The one thing this screen must not get wrong. A failed second pass is not
  // a failed setup: the tenancy stands and the app is unlocked.
  test('keeps the tenancy when the menu fails', async () => {
    menuService.applyMenuImport.mockRejectedValue({ response: { data: { message: 'nope' } } });
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
    expect(menuService.applyMenuImport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Create everything/i })).toBeInTheDocument();
  });

  test('reports both passes on the way out', async () => {
    menuService.applyMenuImport.mockResolvedValue({
      summary: { new: 1, changed: 0, unchanged: 0, errors: 1 },
      rows: [{ line: 2, name: 'Plain Tea', action: 'new', changes: [] },
        { line: 3, name: 'Cold Brew Kit', action: 'error', error: 'Price should be a number of 0 or more, not “-5”.', changes: [] }],
    });
    await runBoth();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Tenancy setup complete/i })).toBeInTheDocument());
    expect(screen.getByText('dishes added')).toBeInTheDocument();
    expect(screen.getByText(/Price should be a number of 0 or more/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download the 1 failed row/i })).toBeInTheDocument();
  });

  // No menu, no second pass.
  test('runs one pass only when the menu is skipped', async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({
      data: { data: { ...IDS, setupToken: 't' } },
    });
    toItemStep();
    fireEvent.click(screen.getByRole('checkbox', { name: /Add my menu/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Tenancy setup complete/i })).toBeInTheDocument());
    expect(menuService.applyMenuImport).not.toHaveBeenCalled();
    expect(masterSetupService.bootstrapMasterData.mock.calls[0][0].item).toBeUndefined();
  });
});

test('GSTIN is optional, checked before moving on, and shown on the review', () => {
  renderWizard();
  typeInto('Legal / group name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  typeInto('Outlet name', 'Main');
  typeInto('Address Line 1', '12 MG Road');
  typeInto('First Name', 'Ravi');
  typeInto('Last Name', 'K');

  // Nothing is said while it is still being typed…
  typeInto('GSTIN', '29abcde1234f1z');
  expect(screen.getByLabelText(/GSTIN/)).toHaveValue('29ABCDE1234F1Z');
  expect(screen.queryByText(/A GSTIN is 15 characters/)).not.toBeInTheDocument();

  // …but a wrong one does not get past Next.
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText(/A GSTIN is 15 characters/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Outlet name/i)).toBeInTheDocument();

  typeInto('GSTIN', '29abcde1234f1z5');
  expect(screen.getByText('Registered in Karnataka')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: /Review/i })).toBeInTheDocument();
  expect(screen.getByText('29ABCDE1234F1Z5')).toBeInTheDocument();
});

test('an unknown GSTIN state code is refused', () => {
  renderWizard();
  typeInto('Legal / group name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  typeInto('GSTIN', '99ABCDE1234F1Z5');
  expect(screen.getByText(/99 is not a GST state code/)).toBeInTheDocument();
});

// ── The optional fields ──────────────────────────────────────────────────────
//
// Eleven fields were added to a wizard whose required path is seven, and the whole
// design rests on them not getting in the way. These tests hold that line: the step
// still asks for what it always asked for, the extras are shut, and skipping them
// changes nothing about what is sent.

const toBranchStep = () => {
  renderWizard();
  typeInto('Legal / group name', 'ANM Tech');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
};

const fillRequiredBranch = () => {
  typeInto('Outlet name', 'Main');
  typeInto('Address Line 1', '12 MG Road');
  typeInto('First Name', 'Ravi');
  typeInto('Last Name', 'K');
};

describe('the optional panels', () => {
  it('keeps every new field shut until asked for', () => {
    toBranchStep();
    // The required path, untouched.
    expect(screen.getByLabelText(/Outlet name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Address Line 1/i)).toBeInTheDocument();
    // And nothing from the panels.
    expect(screen.queryByLabelText(/FSSAI/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^PAN$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Landmark/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Email/i)).not.toBeInTheDocument();
  });

  it('opens on request and closes again', () => {
    toBranchStep();
    const panel = screen.getByRole('button', { name: /More business details/i });
    expect(panel).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(panel);
    expect(panel).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/FSSAI/i)).toBeInTheDocument();

    fireEvent.click(panel);
    expect(screen.queryByLabelText(/FSSAI/i)).not.toBeInTheDocument();
  });

  it('still moves on with every optional field left blank', () => {
    toBranchStep();
    fillRequiredBranch();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // Reached the item step, so nothing optional was treated as required.
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('sends the optional fields on their own records, and omits the blanks', async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({ data: { data: { branch: 'b1' } } });

    toBranchStep();
    fillRequiredBranch();
    fireEvent.click(screen.getByRole('button', { name: /More business details/i }));
    typeInto('FSSAI licence', '11223344556677');
    typeInto('Mobile', '9876543210');
    typeInto('Landmark', 'Opp. the park');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));

    await waitFor(() => expect(masterSetupService.bootstrapMasterData).toHaveBeenCalled());
    const [payload] = masterSetupService.bootstrapMasterData.mock.calls[0];

    // Each one on the record that owns it, not flattened onto the branch.
    expect(payload.branch.FSSAI).toBe('11223344556677');
    expect(payload.branch.contact.MobileNo).toBe('9876543210');
    expect(payload.branch.address.Landmark).toBe('Opp. the park');
    // An untouched optional field is not sent as '' — a blank would be stored as a
    // value, and `clean()` drops it before it reaches the wire.
    expect(payload.branch.PAN).toBeUndefined();
    expect(payload.branch.contact.Email).toBeUndefined();
    expect(payload.branch.address.AddressLine2).toBeUndefined();
  });

  it('refuses an email that is not one, without blocking a blank', () => {
    toBranchStep();
    fillRequiredBranch();
    fireEvent.click(screen.getByRole('button', { name: /More business details/i }));

    typeInto('Email', 'not-an-email');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/does not look like an email address/i)).toBeInTheDocument();

    // Cleared, and the step moves on — optional means optional.
    typeInto('Email', '');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });
});

describe('the GST question', () => {
  // "Decide later" is not a cop-out: pos_tax_setting treats the ABSENCE of a row as
  // charging, chosen so a tenant with an empty GSTIN field did not silently stop
  // charging GST. Answering on the tenant's behalf would write a row that says the
  // same thing today and a different thing the moment that default is reconsidered.
  it('sends no taxSetting at all when nobody answered', async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({ data: { data: { branch: 'b1' } } });

    toBranchStep();
    fillRequiredBranch();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));

    await waitFor(() => expect(masterSetupService.bootstrapMasterData).toHaveBeenCalled());
    const [payload] = masterSetupService.bootstrapMasterData.mock.calls[0];
    expect(payload.taxSetting).toBeUndefined();
  });

  it('sends the off-reason with the switch when the answer is no', async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({ data: { data: { branch: 'b1' } } });

    toBranchStep();
    fillRequiredBranch();
    fireEvent.click(screen.getByRole('button', { name: /^Tax/i }));
    fireEvent.click(screen.getByRole('radio', { name: /composition scheme/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));

    await waitFor(() => expect(masterSetupService.bootstrapMasterData).toHaveBeenCalled());
    const [payload] = masterSetupService.bootstrapMasterData.mock.calls[0];
    expect(payload.taxSetting).toEqual({ gstCharging: false, offReason: 'composition' });
  });

  it('sends charging with no reason when the answer is yes', async () => {
    masterSetupService.bootstrapMasterData.mockResolvedValue({ data: { data: { branch: 'b1' } } });

    toBranchStep();
    fillRequiredBranch();
    fireEvent.click(screen.getByRole('button', { name: /^Tax/i }));
    fireEvent.click(screen.getByRole('radio', { name: /we are registered for GST/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Create everything/i }));

    await waitFor(() => expect(masterSetupService.bootstrapMasterData).toHaveBeenCalled());
    const [payload] = masterSetupService.bootstrapMasterData.mock.calls[0];
    expect(payload.taxSetting).toEqual({ gstCharging: true });
  });
});
