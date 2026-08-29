import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Campaigns from '../Campaigns';
import CampaignDetail from '../CampaignDetail';

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getCampaigns: jest.fn(), getCampaign: jest.fn(), createCampaign: jest.fn(),
    setCampaignStatus: jest.fn(), getCampaignReport: jest.fn(), updateCampaign: jest.fn(),
    createOffer: jest.fn(), updateOffer: jest.fn(), deleteOffer: jest.fn(),
    getPosBranches: jest.fn(), getItemDetails: jest.fn(), getCategories: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'camp-1' }),
}));

const posService = require('../../../services/posService').default;
const { useAuth } = require('../../../context/AuthContext');
const asUser = (scopes) => useAuth.mockReturnValue({
  user: { tid: 't1', onboardingStatus: 'APPROVED', scopes },
});

const CAMPAIGN = (over = {}) => ({
  Id: 'camp-1', Name: 'Monsoon Chai Fest', Code: 'MONSOON26',
  StartsOn: '2026-09-01', EndsOn: '2026-09-30', DaysOfWeek: null,
  StartTime: null, EndTime: null,
  BudgetAmount: 25000, SpentAmount: 11450, Status: 'ACTIVE', LiveState: 'LIVE',
  OfferCount: 2, RedemptionCount: 458, branchIds: [], offers: [], ...over,
});

const OFFER = (over = {}) => ({
  Id: 'off-1', CampaignId: 'camp-1', Name: 'Buy 2 chai, get 1 free',
  TriggerKind: 'ITEM_QTY', TriggerItemId: 'item-chai', TriggerMinQty: 2,
  RewardKind: 'SAME_ITEM', RewardQuantity: 1, RewardPercent: 100,
  ApplyTo: 'CHEAPEST', MaxPerBill: 2, RedemptionCount: 312,
  MaxPerCustomerPerDay: null, MaxTotalRedemptions: null,
  Sentence: 'When a bill has 2 or more of Masala Chai, make 1 of them free — the cheapest one. At most 2 per bill.',
  ...over,
});

beforeEach(() => {
  asUser(['POS_CONFIG:WRITE']);
  posService.getCampaigns.mockResolvedValue([CAMPAIGN()]);
  posService.getCampaign.mockResolvedValue(CAMPAIGN({ offers: [OFFER()] }));
  posService.getPosBranches.mockResolvedValue([{ Id: 'b-1', BranchName: 'Sarjapura Road' }]);
  posService.getItemDetails.mockResolvedValue([
    { Id: 'item-chai', Name: 'Masala Chai' }, { Id: 'item-jamun', Name: 'Gulab Jamun' },
  ]);
  posService.getCategories.mockResolvedValue([{ Id: 'cat-1', Name: 'Beverages' }]);
  posService.createOffer.mockResolvedValue({ id: 'off-2' });
  posService.updateCampaign.mockResolvedValue({ id: 'camp-1' });
  posService.getCampaignReport.mockResolvedValue({
    campaignId: 'camp-1',
    summary: {
      redemptions: 458, bills: 381, givenAway: 11450,
      revenueOnThoseBills: 152400, averageBill: 400,
      costPerRedemption: 25, costAsShareOfRevenue: 7.5,
    },
    offers: [{ offerId: 'off-1', offerName: 'Buy 2 chai, get 1 free', redemptions: 312, givenAway: 7800, bills: 300, costPerRedemption: 25 }],
    byHour: [{ hour: 9, redemptions: 184 }],
    recent: [{
      id: 'r-1', offerId: 'off-1', offerName: 'Buy 2 chai, get 1 free',
      itemName: 'Masala Chai', quantity: 1, discountAmount: 25, billGrossAmount: 509,
      transactionNo: 'INV-0418', transactionDetailLogId: 'log-1',
      branchName: 'Sarjapura Road', redeemedOn: '2026-08-27T19:04:00Z', redeemedBy: 'priya',
    }],
  });
});
afterEach(() => jest.clearAllMocks());

const list = async () => {
  render(<MemoryRouter><Campaigns /></MemoryRouter>);
  await screen.findByText('Monsoon Chai Fest');
};
const detail = async () => {
  render(<MemoryRouter><CampaignDetail /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Monsoon Chai Fest' });
};

describe('the campaign list', () => {
  test('shows what is actually happening, not merely what was intended', async () => {
    await list();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  test.each([
    ['BUDGET_SPENT', 'Budget spent'],
    ['SCHEDULED', 'Scheduled'],
    ['ENDED', 'Ended'],
    ['PAUSED', 'Paused'],
  ])('renders the derived state %s', async (LiveState, label) => {
    posService.getCampaigns.mockResolvedValue([CAMPAIGN({ LiveState })]);
    await list();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  // A campaign without a cap is an open tab with a marketing name on it, and
  // the screen should say so rather than showing an empty column.
  test('says plainly when a campaign has no budget cap', async () => {
    posService.getCampaigns.mockResolvedValue([CAMPAIGN({ BudgetAmount: null })]);
    await list();
    expect(screen.getByText('No cap')).toBeInTheDocument();
  });

  // The one control somebody reaches for at 8pm on a Friday.
  test('pausing a campaign stops every offer in it', async () => {
    await list();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(posService.setCampaignStatus).toHaveBeenCalledWith('camp-1', 'PAUSED'));
  });

  test('read-only users get no switch and no create', async () => {
    asUser(['POS_CONFIG:READ']);
    await list();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByRole('button', { name: /New campaign/ })).toBeNull();
  });

  // A campaign that goes live the instant it is saved is one nobody read back.
  test('a new campaign starts as a draft', async () => {
    posService.createCampaign.mockResolvedValue({ id: 'camp-2' });
    await list();
    fireEvent.click(screen.getByRole('button', { name: /New campaign/ }));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Diwali' } });
    fireEvent.change(screen.getByLabelText(/Code/i), { target: { value: 'diwali26' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & add offers/ }));

    await waitFor(() => expect(posService.createCampaign).toHaveBeenCalled());
    const [payload] = posService.createCampaign.mock.calls[0];
    expect(payload.Status).toBe('DRAFT');
    expect(payload.Code).toBe('DIWALI26');
    // …and it drops you straight into adding the offers.
    expect(mockNavigate).toHaveBeenCalledWith('/frontdesk/campaigns/camp-2');
  });
});

describe('the offer builder', () => {
  // Six dropdowns can express a rule nobody can read back.
  test('shows the server’s sentence for each existing offer', async () => {
    await detail();
    expect(screen.getByText(/When a bill has 2 or more of Masala Chai/)).toBeInTheDocument();
  });

  test('reads the rule back as a sentence while it is being written', async () => {
    await detail();
    fireEvent.click(screen.getByRole('button', { name: /Add offer/ }));

    // Scoped to the readback panel: the saved offer's sentence says the same
    // thing, which is the point — both come from one rule.
    const readback = document.querySelector('.cmp-readback');
    fireEvent.change(screen.getByLabelText('Trigger item'), { target: { value: 'item-chai' } });
    expect(within(readback).getByText(/When a bill has 2 or more of Masala Chai/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: '50' } });
    expect(within(readback).getByText(/50% off/)).toBeInTheDocument();
  });

  // Which line is discounted when several qualify. Stated, because two tills
  // answering differently is a customer being right both times.
  test('offers the cheapest-or-dearest choice for a same-item reward', async () => {
    await detail();
    fireEvent.click(screen.getByRole('button', { name: /Add offer/ }));
    expect(screen.getByLabelText('Which line')).toBeInTheDocument();
    expect(screen.getByText(/the cheapest qualifying line/)).toBeInTheDocument();
  });

  test('a bill trigger asks for an amount instead of a quantity', async () => {
    await detail();
    fireEvent.click(screen.getByRole('button', { name: /Add offer/ }));
    fireEvent.change(screen.getByLabelText('Trigger'), { target: { value: 'BILL_AMOUNT' } });
    expect(screen.getByLabelText('Minimum bill amount')).toBeInTheDocument();
    expect(screen.queryByLabelText('Minimum quantity')).toBeNull();
  });

  test('sends the rule the shape the API takes', async () => {
    await detail();
    fireEvent.click(screen.getByRole('button', { name: /Add offer/ }));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'BOGO chai' } });
    fireEvent.change(screen.getByLabelText('Trigger item'), { target: { value: 'item-chai' } });
    fireEvent.click(screen.getByRole('button', { name: /Save offer/ }));

    await waitFor(() => expect(posService.createOffer).toHaveBeenCalled());
    const [campaignId, body] = posService.createOffer.mock.calls[0];
    expect(campaignId).toBe('camp-1');
    expect(body).toMatchObject({
      Name: 'BOGO chai', TriggerKind: 'ITEM_QTY', TriggerItemId: 'item-chai',
      TriggerMinQty: 2, RewardKind: 'SAME_ITEM', RewardPercent: 100, ApplyTo: 'CHEAPEST',
    });
    // A bill amount has no place on an item trigger.
    expect(body.TriggerMinAmount).toBeNull();
  });

  // The server refuses a rule that cannot fire, and its message names the field.
  test('surfaces the server’s refusal verbatim', async () => {
    const { toast } = require('react-toastify');
    posService.createOffer.mockRejectedValue({
      response: { data: { message: 'An item trigger needs an item.' } },
    });
    await detail();
    fireEvent.click(screen.getByRole('button', { name: /Add offer/ }));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Broken' } });
    fireEvent.click(screen.getByRole('button', { name: /Save offer/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('An item trigger needs an item.'));
  });
});

describe('campaign performance', () => {
  const openReport = async () => {
    await detail();
    fireEvent.click(screen.getByRole('tab', { name: /Performance/ }));
    await screen.findByText('Those bills came to');
  };

  // Cost and effect are not the same kind of fact and are never netted.
  test('shows what it gave away and what those bills came to, separately', async () => {
    await openReport();
    // "Given away" is also a column header on the per-offer table — scope to
    // the KPI strip, which is where the claim being tested lives.
    const kpis = document.querySelector('.cmp-kpis');
    expect(within(kpis).getByText('Given away')).toBeInTheDocument();
    expect(within(kpis).getByText('Those bills came to')).toBeInTheDocument();
    expect(within(kpis).getByText('not uplift — see below')).toBeInTheDocument();
  });

  test('and says so in words, with the honest test', async () => {
    await openReport();
    expect(screen.getByText(/What it caused is not/)).toBeInTheDocument();
    expect(screen.getByText(/pause it for a week/)).toBeInTheDocument();
  });

  // Every figure has to be traceable to the bills behind it.
  test('one click from a redemption to the invoice that gave it away', async () => {
    await openReport();
    fireEvent.click(screen.getByRole('button', { name: 'INV-0418' }));
    expect(mockNavigate).toHaveBeenCalledWith('/frontdesk/ledger?doc=log-1');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
describe('a campaign that is not firing right now', () => {
  // "Live" while the till refuses every bill is the worst thing this column
  // could say. Both states carry the reason beside them.
  test.each([
    ['OFF_TODAY', 'Not today', /weekday/i],
    ['OUTSIDE_HOURS', 'Outside hours', /time window/i],
  ])('%s reads as %s, with the reason', async (LiveState, label, why) => {
    posService.getCampaigns.mockResolvedValue([CAMPAIGN({ LiveState })]);
    await list();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(why)).toBeInTheDocument();
    expect(screen.queryByText('Live')).toBeNull();
  });

  // The KPI counts what is actually running.
  test('does not count towards "Live now"', async () => {
    posService.getCampaigns.mockResolvedValue([
      CAMPAIGN({ Id: 'c1', Name: 'Running now', LiveState: 'LIVE' }),
      CAMPAIGN({ Id: 'c2', Name: 'Waiting for its hour', LiveState: 'OUTSIDE_HOURS' }),
    ]);
    render(<MemoryRouter><Campaigns /></MemoryRouter>);
    await screen.findByText('Running now');
    const kpi = screen.getByText('Live now').closest('.cmp-kpi');
    expect(within(kpi).getByText('1')).toBeInTheDocument();
  });
});

describe('editing a campaign', () => {
  // There was no way to change a campaign once created, which made a mistyped
  // time window permanent.
  const openEdit = async () => {
    await detail();
    fireEvent.click(screen.getByRole('button', { name: /Edit campaign/i }));
    return screen.findByRole('dialog', { name: /Edit campaign/i });
  };

  test('opens the form filled in from what is stored', async () => {
    const dlg = await openEdit();
    expect(within(dlg).getByLabelText(/Name/i)).toHaveValue('Monsoon Chai Fest');
    expect(within(dlg).getByLabelText(/Code/i)).toHaveValue('MONSOON26');
    expect(within(dlg).getByLabelText(/Starts/i)).toHaveValue('2026-09-01');
  });

  test('saves the change', async () => {
    const dlg = await openEdit();
    fireEvent.change(within(dlg).getByLabelText(/Name/i), { target: { value: 'Monsoon Fest v2' } });
    fireEvent.click(within(dlg).getByRole('button', { name: /Save campaign/i }));

    await waitFor(() => expect(posService.updateCampaign).toHaveBeenCalled());
    const [id, payload] = posService.updateCampaign.mock.calls[0];
    expect(id).toBe('camp-1');
    expect(payload.Name).toBe('Monsoon Fest v2');
  });

  // A window of zero length fires on nothing. Saying so with the form still
  // open beats finding out after Save.
  test('refuses a zero-length time window before it reaches the server', async () => {
    const dlg = await openEdit();
    fireEvent.change(within(dlg).getByLabelText('From'), { target: { value: '00:05' } });
    fireEvent.change(within(dlg).getByLabelText('To'), { target: { value: '00:05' } });

    expect(within(dlg).getByRole('alert')).toHaveTextContent(/zero length/i);
    expect(within(dlg).getByRole('button', { name: /Save campaign/i })).toBeDisabled();
    expect(posService.updateCampaign).not.toHaveBeenCalled();
  });

  test('and half a window', async () => {
    const dlg = await openEdit();
    fireEvent.change(within(dlg).getByLabelText('From'), { target: { value: '16:00' } });
    expect(within(dlg).getByRole('alert')).toHaveTextContent(/both a start and an end/i);
  });

  test('a real window saves', async () => {
    const dlg = await openEdit();
    fireEvent.change(within(dlg).getByLabelText('From'), { target: { value: '16:00' } });
    fireEvent.change(within(dlg).getByLabelText('To'), { target: { value: '18:00' } });
    expect(within(dlg).queryByRole('alert')).toBeNull();

    fireEvent.click(within(dlg).getByRole('button', { name: /Save campaign/i }));
    await waitFor(() => expect(posService.updateCampaign).toHaveBeenCalled());
    const [, payload] = posService.updateCampaign.mock.calls[0];
    expect(payload).toMatchObject({ StartTime: '16:00', EndTime: '18:00' });
  });

  test('blank times mean all day, not zero', async () => {
    const dlg = await openEdit();
    fireEvent.click(within(dlg).getByRole('button', { name: /Save campaign/i }));
    await waitFor(() => expect(posService.updateCampaign).toHaveBeenCalled());
    const [, payload] = posService.updateCampaign.mock.calls[0];
    expect(payload.StartTime).toBeNull();
    expect(payload.EndTime).toBeNull();
  });

  test('read-only users cannot open it', async () => {
    asUser(['POS_CONFIG:READ']);
    await detail();
    expect(screen.queryByRole('button', { name: /Edit campaign/i })).toBeNull();
  });
});

// ── Editing straight from the list ──────────────────────────────────────────
// The Runs column is where somebody reads that a campaign is "Outside hours",
// so it is where they try to fix it. Sending them to a detail page to find the
// control is a step, and the row already had room for a button.
describe('editing a campaign from the list', () => {
  const openFromList = async () => {
    render(<MemoryRouter><Campaigns /></MemoryRouter>);
    await screen.findByText('Monsoon Chai Fest');
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));
    return screen.findByRole('dialog', { name: /Edit campaign/i });
  };

  test('opens the same form, filled in', async () => {
    const dlg = await openFromList();
    expect(within(dlg).getByLabelText(/Name/i)).toHaveValue('Monsoon Chai Fest');
  });

  // The list query returns no branchIds — it has no reason to. The form sends
  // them regardless, and the server rewrites the branch table from whatever it
  // receives. Opening the form on the ROW would therefore save a campaign's
  // branch targeting away to nothing, and say nothing about it.
  test('reads the full campaign first, so saving cannot wipe branch targeting', async () => {
    posService.getCampaigns.mockResolvedValue([
      CAMPAIGN({ branchIds: undefined }),           // as the list really returns it
    ]);
    posService.getCampaign.mockResolvedValue(
      CAMPAIGN({ branchIds: ['b-1'] }),             // as the record really is
    );

    const dlg = await openFromList();
    await waitFor(() => expect(posService.getCampaign).toHaveBeenCalledWith('camp-1'));

    fireEvent.click(within(dlg).getByRole('button', { name: /Save campaign/i }));
    await waitFor(() => expect(posService.updateCampaign).toHaveBeenCalled());

    const [, payload] = posService.updateCampaign.mock.calls[0];
    expect(payload.branchIds).toEqual(['b-1']);
  });

  test('changes the days a campaign runs on', async () => {
    const dlg = await openFromList();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Mon' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Sun' }));
    fireEvent.click(within(dlg).getByRole('button', { name: /Save campaign/i }));

    await waitFor(() => expect(posService.updateCampaign).toHaveBeenCalled());
    const [, payload] = posService.updateCampaign.mock.calls[0];
    expect(payload.DaysOfWeek).toBe('1,7');
  });

  test('does not navigate to the detail page when Edit is pressed', async () => {
    await openFromList();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('says so and stays on the list when the campaign cannot be read', async () => {
    posService.getCampaign.mockRejectedValue({ response: { data: { message: 'gone' } } });
    render(<MemoryRouter><Campaigns /></MemoryRouter>);
    await screen.findByText('Monsoon Chai Fest');
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    await waitFor(() => expect(require('react-toastify').toast.error).toHaveBeenCalledWith('gone'));
    expect(screen.queryByRole('dialog', { name: /Edit campaign/i })).toBeNull();
  });
});
