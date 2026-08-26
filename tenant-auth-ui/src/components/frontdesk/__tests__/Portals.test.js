import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Portals from '../../../pages/frontdesk/Portals';
import PortalMenu from '../../../pages/frontdesk/PortalMenu';
import posService from '../../../services/posService';
import { useCan } from '../../../hooks/useCan';

// The portal master and its listing matrix.
//
// The two rules worth pinning down here are both about not destroying
// something: a credential form must not blank a working secret, and a bulk
// availability toggle must not fire on an empty selection.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getPortals: jest.fn(),
    getPortal: jest.fn(),
    createPortal: jest.fn(),
    updatePortal: jest.fn(),
    deletePortal: jest.fn(),
    savePortalCredentials: jest.fn(),
    getPortalBranches: jest.fn(),
    createPortalBranch: jest.fn(),
    updatePortalBranch: jest.fn(),
    getPortalListings: jest.fn(),
    setPortalListingAvailability: jest.fn(),
    publishPortalMenu: jest.fn(),
    getPosBranches: jest.fn(),
    getPaymentModes: jest.fn(),
  },
}));
jest.mock('../../../hooks/useCan', () => ({ useCan: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const { toast } = require('react-toastify');

const ZOMATO = {
  Id: 'portal-zo',
  Name: 'Zomato',
  Code: 'ZOMATO',
  Adapter: 'manual',
  ColorHex: '#E23744',
  ShortCode: 'ZO',
  CommissionPct: 18,
  ListingCount: 184,
  UnsyncedCount: 3,
};

const listing = (over = {}) => ({
  Id: 'l1',
  PortalId: 'portal-zo',
  ItemMetaId: 'im-1',
  ItemName: 'Paneer Tikka',
  ListedName: 'Paneer Tikka',
  BaseAmount: 190,
  PriceSource: 'override',
  TaxBreakdown: { grossAmount: 230, isTaxIncluded: true },
  Available: 1,
  SyncStatus: 'pending',
  Active: 1,
  ...over,
});

const renderPortals = async ({ canWrite = true } = {}) => {
  useCan.mockReturnValue(canWrite);
  posService.getPortals.mockResolvedValue([ZOMATO]);
  posService.getPosBranches.mockResolvedValue([{ Id: 'b1', BranchName: 'Sarjapura' }]);
  posService.getPaymentModes.mockResolvedValue([{ Id: 'pm-zo', Type: 'Zomato Settlement' }]);
  posService.getPortalBranches.mockResolvedValue([]);
  render(<MemoryRouter><Portals /></MemoryRouter>);
  await screen.findByText('Zomato');
};

const renderMenu = async (listings = [listing()], { canWrite = true } = {}) => {
  useCan.mockReturnValue(canWrite);
  posService.getPortal.mockResolvedValue(ZOMATO);
  posService.getPortalListings.mockResolvedValue(listings);
  render(
    <MemoryRouter initialEntries={['/frontdesk/portals/portal-zo/menu']}>
      <Routes>
        <Route path="/frontdesk/portals/:portalId/menu" element={<PortalMenu />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /Zomato listings/i });
};

beforeEach(() => jest.clearAllMocks());

describe('the portal master', () => {
  it('shows the commission and how many listings are out of sync', async () => {
    await renderPortals();
    expect(screen.getByText('18.00%')).toBeInTheDocument();
    // Only sayable because the menu push records what the portal accepted.
    expect(screen.getByText('3 out of sync')).toBeInTheDocument();
  });

  it("says plainly that a manual portal's orders are keyed in", async () => {
    await renderPortals();
    expect(screen.getByText('Entered by hand')).toBeInTheDocument();
  });

  // A form that shows "••••" and submits an empty string is the classic way a
  // credential screen destroys a working integration.
  it('sends only the secrets that were actually typed', async () => {
    posService.savePortalCredentials.mockResolvedValue({});
    await renderPortals();

    fireEvent.click(screen.getByRole('button', { name: 'Credentials' }));
    const secret = await screen.findByLabelText(/Webhook secret/i);
    fireEvent.change(secret, { target: { value: 'new-secret' } });
    fireEvent.click(screen.getByRole('button', { name: /save|submit|create/i }));

    await waitFor(() => expect(posService.savePortalCredentials).toHaveBeenCalledWith(
      'portal-zo', { WebhookSecret: 'new-secret' },
    ));
    // The untouched fields are absent, not empty — an empty string would blank
    // a stored key.
    const [, payload] = posService.savePortalCredentials.mock.calls[0];
    expect(payload).not.toHaveProperty('ApiKey');
    expect(payload).not.toHaveProperty('ApiSecret');
  });

  // A portal with orders behind it is deactivated rather than deleted, and the
  // server's message explains why — worth showing verbatim.
  it('relays why a portal with orders cannot be deleted', async () => {
    posService.deletePortal.mockRejectedValue({
      response: { data: { message: 'This portal has orders against it. Deactivate it instead.' } },
    });
    await renderPortals();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByText(/Remove Zomato\?/i);
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'This portal has orders against it. Deactivate it instead.',
    ));
  });

  it('offers no edit controls to somebody who can only read', async () => {
    await renderPortals({ canWrite: false });
    expect(screen.queryByRole('button', { name: 'Credentials' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add portal/i })).toBeNull();
  });
});

describe('the listing matrix', () => {
  it('shows the branch price beside the portal price, and where it came from', async () => {
    await renderMenu();
    expect(screen.getByText('₹190.00')).toBeInTheDocument();
    expect(screen.getByText('₹230.00')).toBeInTheDocument();
    // "Inherited" and "deliberately the same number" look identical otherwise.
    expect(screen.getByText('Portal override')).toBeInTheDocument();
  });

  it('says when a price is inherited rather than set', async () => {
    await renderMenu([listing({ PriceSource: 'branch', TaxBreakdown: { grossAmount: 190 } })]);
    expect(screen.getByText('Inherited')).toBeInTheDocument();
  });

  // 200 dishes is 200 decisions; a PUT per row is the reason this kind of
  // screen goes unused.
  it('toggles stock for a whole selection at once', async () => {
    posService.setPortalListingAvailability.mockResolvedValue({ updated: 2 });
    await renderMenu([listing(), listing({ Id: 'l2', ItemName: 'Dal Makhani' })]);

    fireEvent.click(screen.getByLabelText('Select all shown'));
    fireEvent.click(await screen.findByRole('button', { name: 'Out of stock' }));

    await waitFor(() => expect(posService.setPortalListingAvailability).toHaveBeenCalledWith({
      ListingIds: ['l1', 'l2'],
      Available: false,
    }));
  });

  it('shows no bulk bar until something is selected', async () => {
    await renderMenu();
    expect(screen.queryByRole('button', { name: 'Out of stock' })).toBeNull();
  });

  // Saying "published" for a push that never happened is exactly the lie the
  // sync columns exist to prevent.
  it('does not claim a manual portal published anything', async () => {
    posService.publishPortalMenu.mockResolvedValue({
      pushed: false, synced: 0, failed: 0, detail: 'Manual portal — nothing published',
    });
    await renderMenu();

    fireEvent.click(screen.getByRole('button', { name: /Publish to Zomato/i }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining('Manual portal'),
    ));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('points at the channel gate when a portal has nothing listed', async () => {
    await renderMenu([]);
    const empty = screen.getByText(/Nothing listed on this portal yet/i).closest('div');
    // The empty state has to say what to do next, not just that there is
    // nothing: the reason is almost always the channel gate.
    expect(empty).toHaveTextContent(/must be on the\s*Online\s*channel/i);
  });

  it('marks a listing the portal has not been told about', async () => {
    await renderMenu([listing({ SyncStatus: 'pending' })]);
    const row = screen.getByText('Paneer Tikka').closest('tr');
    expect(within(row).getByText('Not sent')).toBeInTheDocument();
  });
});
