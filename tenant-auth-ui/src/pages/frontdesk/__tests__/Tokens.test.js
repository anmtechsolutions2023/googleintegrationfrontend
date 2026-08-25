import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Tokens from '../Tokens';
import TokenDisplay from '../TokenDisplay';
import posService from '../../../services/posService';

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getTokens: jest.fn(),
    createToken: jest.fn(),
    callToken: jest.fn(),
    serveToken: jest.fn(),
    getPosBranches: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
// The queue is offered on POS_OPS:READ; issuing, calling and handing over move
// it and need WRITE. Default to somebody who can work the counter.
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
const { useAuth } = require('../../../context/AuthContext');
const asUser = (scopes) => useAuth.mockReturnValue({
  user: { tid: 't1', onboardingStatus: 'APPROVED', scopes },
});

// The LOCAL calendar date, matching utils/businessDate. These expectations used
// toISOString().slice(0, 10) — the UTC date — which is the very bug being
// fixed: in UTC+5:30 the queue asked for a day its own tokens were not filed
// under until 05:30, and showed an empty counter.
const localToday = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const BRANCH = 'bbbbbbbb-0000-0000-0000-000000000001';
const BRANCH_2 = 'bbbbbbbb-0000-0000-0000-000000000002';

const token = (over = {}) => ({
  Id: 't-1', TokenNumber: 1, TokenLabel: '1', TokenDate: '2026-08-16',
  Status: 'waiting', BranchDetailId: BRANCH, CreatedOn: '2026-08-16 10:00:00',
  ...over,
});

beforeEach(() => {
  asUser(['POS_OPS:READ', 'POS_OPS:WRITE']);
  jest.clearAllMocks();
  localStorage.clear();
  posService.getPosBranches.mockResolvedValue([{ Id: BRANCH, BranchName: 'Central' }]);
  posService.getTokens.mockResolvedValue([]);
});

const renderQueue = async () => {
  render(<MemoryRouter><Tokens /></MemoryRouter>);
  await waitFor(() => expect(posService.getTokens).toHaveBeenCalled());
};

describe('Token queue — one branch, one day', () => {
  // The screen used to pull every token the tenant had ever issued and keep
  // today's in the browser, which stops working on the first busy week.
  it('asks the server for today\'s tokens on the selected branch', async () => {
    await renderQueue();
    const [params] = posService.getTokens.mock.calls.at(-1);
    expect(params.branchId).toBe(BRANCH);
    expect(params.date).toBe(localToday());
  });

  // The branch list used to come from /api/branchdetails, which is gated on
  // ORGANIZATION_READ — a scope a cashier does not hold. It 403'd, the picker
  // read "No branches", and the queue then refused to load anything at all.
  // Losing the picker must cost the filter, not the whole screen.
  it('falls back to the tenant-wide queue when the branch list cannot be read', async () => {
    posService.getPosBranches.mockRejectedValue(new Error('403'));
    posService.getTokens.mockResolvedValue([token({ TokenLabel: '6' })]);
    await renderQueue();

    const [params] = posService.getTokens.mock.calls.at(-1);
    expect(params.branchId).toBeUndefined();
    expect(params.date).toBe(localToday());
    expect(await screen.findByText('6')).toBeInTheDocument();
  });

  it('shows what each token is for, not just its number', async () => {
    posService.getTokens.mockResolvedValue([token({
      OrderNo: 'ORD-0007', OrderTotal: 250,
      OrderItems: [{ name: 'Burger', qty: 2 }],
    })]);
    await renderQueue();

    expect(await screen.findByText('ORD-0007')).toBeInTheDocument();
    expect(screen.getByText(/2× Burger/)).toBeInTheDocument();
    expect(screen.getByText('₹250.00')).toBeInTheDocument();
  });

  it('says so when a token has no order behind it', async () => {
    posService.getTokens.mockResolvedValue([token()]);
    await renderQueue();
    expect(await screen.findByText(/No order attached/i)).toBeInTheDocument();
  });

  it('puts called tokens above waiting ones — the top of the list is the work', async () => {
    posService.getTokens.mockResolvedValue([
      token({ Id: 'a', TokenLabel: '5', Status: 'waiting' }),
      token({ Id: 'b', TokenLabel: '4', Status: 'called' }),
    ]);
    await renderQueue();

    const rows = await screen.findAllByRole('row');
    // rows[0] is the header.
    expect(within(rows[1]).getByText('4')).toBeInTheDocument();
    expect(within(rows[2]).getByText('5')).toBeInTheDocument();
  });
});

describe('Token queue — advancing', () => {
  it('calls a waiting token through the domain action, not a status PUT', async () => {
    posService.getTokens.mockResolvedValue([token({ TokenLabel: '3' })]);
    posService.callToken.mockResolvedValue({});
    await renderQueue();

    fireEvent.click(await screen.findByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(posService.callToken).toHaveBeenCalledWith('t-1'));
  });

  it('serves a called token', async () => {
    posService.getTokens.mockResolvedValue([token({ Status: 'called' })]);
    posService.serveToken.mockResolvedValue({});
    await renderQueue();

    fireEvent.click(await screen.findByRole('button', { name: /Serve/i }));
    await waitFor(() => expect(posService.serveToken).toHaveBeenCalledWith('t-1'));
  });

  it('offers a recall on an already-called token', async () => {
    posService.getTokens.mockResolvedValue([token({ Status: 'called' })]);
    await renderQueue();
    expect(await screen.findByRole('button', { name: /Call again/i })).toBeInTheDocument();
  });

  it('offers nothing to act on once a token is served', async () => {
    posService.getTokens.mockResolvedValue([token({ Status: 'served' })]);
    await renderQueue();
    await screen.findByText('Served');
    expect(screen.queryByRole('button', { name: /^Call$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Serve/i })).not.toBeInTheDocument();
  });

  // The browser computing max+1 over its own list is what let two tills issue
  // the same number.
  it('sends only the branch when issuing a blank token', async () => {
    posService.createToken.mockResolvedValue({ TokenLabel: '9' });
    await renderQueue();

    fireEvent.click(screen.getByRole('button', { name: /Blank token/i }));
    await waitFor(() => expect(posService.createToken).toHaveBeenCalledWith({
      BranchDetailId: BRANCH,
    }));
  });
});

describe('Customer display', () => {
  const renderDisplay = async () => {
    render(<TokenDisplay />);
    await waitFor(() => expect(posService.getTokens).toHaveBeenCalled());
  };

  it('headlines the most recently called token', async () => {
    posService.getTokens.mockResolvedValue([
      token({ Id: 'a', TokenLabel: '11', Status: 'called', CalledAt: '2026-08-16T10:00:00Z' }),
      token({ Id: 'b', TokenLabel: '12', Status: 'called', CalledAt: '2026-08-16T10:05:00Z' }),
    ]);
    await renderDisplay();

    // 12 was called last, so it is the one being shouted right now; 11 is still
    // ready to collect and stays on the board.
    const now = await screen.findByText('12');
    expect(now).toHaveClass('td-now-number');
    expect(screen.getByText('11')).toHaveClass('td-chip', 'is-ready');
  });

  it('lists waiting tokens in issue order under Preparing', async () => {
    posService.getTokens.mockResolvedValue([
      token({ Id: 'a', TokenNumber: 9, TokenLabel: '9' }),
      token({ Id: 'b', TokenNumber: 7, TokenLabel: '7' }),
    ]);
    await renderDisplay();

    const chips = await screen.findAllByText(/^[79]$/);
    expect(chips.map((c) => c.textContent)).toEqual(['7', '9']);
  });

  // A lone em dash at display size reads as a grey slab — as though the screen
  // had failed rather than as "nothing is ready yet".
  it('says what is happening rather than showing a bare dash', async () => {
    posService.getTokens.mockResolvedValue([token()]);
    await renderDisplay();
    expect(await screen.findByText(/Preparing your order/i)).toBeInTheDocument();
  });

  it('says so when the queue is completely empty', async () => {
    posService.getTokens.mockResolvedValue([]);
    await renderDisplay();
    expect(await screen.findByText(/No orders yet/i)).toBeInTheDocument();
  });

  // A waiting room learns nothing from an empty screen, and the numbers on it
  // were true a few seconds ago.
  it('keeps the last known board when a poll fails', async () => {
    posService.getTokens.mockResolvedValueOnce([
      token({ TokenLabel: '4', Status: 'called', CalledAt: '2026-08-16T10:00:00Z' }),
    ]);
    await renderDisplay();
    await screen.findByText('4');

    posService.getTokens.mockRejectedValue(new Error('offline'));
    // The next poll fails; the number must still be on the board.
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument());
  });

  it('hides the branch picker when there is only one branch', async () => {
    await renderDisplay();
    expect(screen.queryByLabelText(/Branch/i)).not.toBeInTheDocument();
  });

  it('offers a branch picker when there is more than one', async () => {
    posService.getPosBranches.mockResolvedValue([
      { Id: BRANCH, BranchName: 'Central' }, { Id: BRANCH_2, BranchName: 'Airport' },
    ]);
    await renderDisplay();
    expect(await screen.findByLabelText(/Branch/i)).toBeInTheDocument();
  });
});

// Watching the queue and working it are different permissions.
describe('who may work the queue', () => {
  it('offers no Call, Serve or Blank token to a read-only watcher', async () => {
    asUser(['POS_OPS:READ']);
    render(<MemoryRouter><Tokens /></MemoryRouter>);
    await waitFor(() => expect(posService.getTokens).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: /^Call$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Serve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Blank token/i })).not.toBeInTheDocument();
  });

  it('still shows them the queue itself — that is what READ is for', async () => {
    asUser(['POS_OPS:READ']);
    render(<MemoryRouter><Tokens /></MemoryRouter>);
    await waitFor(() => expect(posService.getTokens).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });
});
