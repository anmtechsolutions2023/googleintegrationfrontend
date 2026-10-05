import { PRIMARY_NAV, visibleNavItems, visibleAdminTabs } from '../navigation';
import {
  WORKSPACES, visibleWorkspaces, visibleTabs, visibleSections, tabLabelOf,
  homePathFor, entryPathOf, legacyTargetFor, workspaceOfPath, LEGACY_PATHS, MOVED_PATHS,
} from '../workspaces';

// Menus are built from the user's scopes, so what is on screen matches what the
// API will actually allow. Two failure modes are equally bad and both are
// covered here: offering a link that leads to a 403, and hiding a screen the
// person is entitled to use.

const userWith = (scopes, over = {}) => ({
  tid: 'tenant-1', onboardingStatus: 'APPROVED', setupCompleted: true, scopes, ...over,
});

const labels = (items) => items.map((i) => i.label);
const wsNames = (user) => visibleWorkspaces(user).map((w) => w.workspace);
const tabNames = (key, user) =>
  visibleTabs(WORKSPACES.find((w) => w.key === key), user).map(tabLabelOf);

describe('the top bar', () => {
  // Every tenant screen moved into a workspace; the bar keeps only what sits
  // outside one.
  it('holds nothing a workspace already offers', () => {
    const seen = labels(visibleNavItems(PRIMARY_NAV, userWith(['TENANT:ADMIN'])));
    expect(seen).toContain('Home');
    ['Master Data', 'Reports', 'Access', 'Front Desk'].forEach((l) => expect(seen).not.toContain(l));
  });

  it('offers Platform to a super admin only', () => {
    expect(labels(visibleNavItems(PRIMARY_NAV, userWith(['TENANT:SUPER_ADMIN'])))).toContain('Platform');
    expect(labels(visibleNavItems(PRIMARY_NAV, userWith(['TENANT:ADMIN'])))).not.toContain('Platform');
  });

  // While setup is pending the workspaces are shut, so the audit log needs its
  // own way in — and only then.
  it('keeps Audit Logs on the bar only while setup is pending', () => {
    const pending = userWith(['TENANT:ADMIN'], { setupCompleted: false });
    expect(labels(visibleNavItems(PRIMARY_NAV, pending))).toEqual(expect.arrayContaining(['Home', 'Audit Logs']));
    expect(labels(visibleNavItems(PRIMARY_NAV, userWith(['TENANT:ADMIN'])))).not.toContain('Audit Logs');
  });
});

describe('the workspace rail', () => {
  it('gives a tenant admin the till, then all seven workspaces', () => {
    expect(wsNames(userWith(['TENANT:ADMIN']))).toEqual(
      ['Billing & KOT', 'Service', 'Menu', 'Outlet', 'Money', 'Guests', 'Insights', 'Admin'],
    );
  });

  // The till is one tap from anywhere: its own rail entry, one screen, no
  // workspace header — not a section two tabs down inside Service.
  it('puts Billing & KOT first, as one bare screen', () => {
    const till = WORKSPACES[0];
    expect(till.key).toBe('billing');
    expect(till.bare).toBe(true);
    expect(till.tabs.map((t) => t.path)).toEqual(['/billing']);
    expect(wsNames(userWith(['POS_ORDER:READ']))[0]).toBe('Billing & KOT');
  });

  it('keeps Tables and the QR inbox under Service › Floor, and not the till', () => {
    const floor = WORKSPACES.find((w) => w.key === 'service').tabs.find((t) => t.key === 'floor');
    expect(visibleSections(floor, userWith(['TENANT:ADMIN'])).map((s) => s.label)).toEqual(['Tables', 'QR inbox']);
  });

  it('opens the till to the same scopes the Billing & KOT section needed', () => {
    expect(wsNames(userWith(['POS_ORDER:READ']))).toContain('Billing & KOT');
    expect(wsNames(userWith(['POS_KITCHEN:READ']))).not.toContain('Billing & KOT');
    expect(wsNames(userWith(['TRANSACTIONS:READ']))).not.toContain('Billing & KOT');
  });

  it('shows a cashier the floor, not the books or the admin', () => {
    const cashier = userWith(['POS_ORDER:READ', 'POS_ORDER:WRITE', 'POS_BILLING:READ', 'POS_BILLING:WRITE', 'POS_CRM:READ', 'POS_CONFIG:READ', 'POS_QR:READ']);
    const seen = wsNames(cashier);
    expect(seen).toEqual(expect.arrayContaining(['Billing & KOT', 'Service', 'Guests']));
    expect(seen).not.toContain('Admin');
    // Dues is theirs: collecting a balance is taking money at the till. The
    // books themselves (Finance, Ledger, Returns) are not.
    expect(tabNames('money', cashier)).toEqual(['Dues', 'Cash Sessions']);
    expect(tabNames('service', cashier)).not.toContain('Kitchen (KDS)');
  });

  it('shows an accountant Money and Insights, and no Service', () => {
    const accountant = userWith(['TRANSACTIONS:READ', 'TRANSACTIONS:WRITE']);
    expect(wsNames(accountant)).toEqual(expect.arrayContaining(['Money', 'Insights']));
    expect(wsNames(accountant)).not.toContain('Service');
    expect(homePathFor(accountant)).toBe('/money/overview');
  });

  it('sends floor staff Home to Billing & KOT, and others to their first screen', () => {
    expect(homePathFor(userWith(['TENANT:ADMIN']))).toBe('/billing');
    expect(homePathFor(userWith(['POS_ORDER:READ']))).toBe('/billing');
    // No till, but the QR inbox: Service lands on Floor rather than Today.
    expect(homePathFor(userWith(['POS_QR:READ']))).toBe('/service/floor/qr');
    // Service is open through Kitchen alone, but Floor is not — first tab wins.
    expect(homePathFor(userWith(['POS_KITCHEN:READ']))).toBe('/service/today');
  });

  // Kitchen staff hold POS_ORDER:READ, so the till is visible to them — but it
  // is a screen with no buttons for them. Their shift starts on the KDS.
  it('sends kitchen staff Home to the kitchen display, not the till', () => {
    const kitchen = userWith(['POS_KITCHEN:READ', 'POS_KITCHEN:WRITE', 'POS_ORDER:READ']);
    expect(homePathFor(kitchen)).toBe('/service/kitchen');
    // Somebody who also takes orders still lands on the till.
    const both = userWith(['POS_KITCHEN:WRITE', 'POS_ORDER:READ', 'POS_ORDER:WRITE']);
    expect(homePathFor(both)).toBe('/billing');
  });

  // The server accepts WRITE on the reads behind every View screen, so a role
  // holding only "Manage" must be shown those screens too.
  it('treats Manage as including View', () => {
    const manageOnly = userWith(['POS_ORDER:WRITE']);
    expect(wsNames(manageOnly)).toContain('Billing & KOT');
    expect(homePathFor(manageOnly)).toBe('/billing');
  });

  it('no longer opens anything for the retired admin:access scope', () => {
    expect(visibleWorkspaces(userWith(['admin:access']))).toEqual([]);
  });

  it('offers nothing to somebody who holds nothing', () => {
    expect(visibleWorkspaces(userWith([]))).toEqual([]);
    expect(homePathFor(userWith([]))).toBeNull();
  });

  // A sectioned tab is visible when ANY of its sections is, and lands on the
  // first one the person may open — not on a section they would be refused.
  it('lands a sectioned tab on the first section the user may open', () => {
    const qrOnly = userWith(['POS_QR:READ']);
    const floor = WORKSPACES.find((w) => w.key === 'service').tabs.find((t) => t.key === 'floor');
    expect(visibleSections(floor, qrOnly).map((s) => s.key)).toEqual(['qr']);
    expect(entryPathOf(floor, qrOnly)).toBe('/service/floor/qr');
  });

  it('lets POS_QR alone manage codes, and not menu setup', () => {
    const outlet = WORKSPACES.find((w) => w.key === 'outlet');
    const floors = outlet.tabs.find((t) => t.key === 'floors');
    expect(visibleSections(floors, userWith(['POS_CONFIG:READ'])).map((s) => s.key)).toEqual(['floors', 'tables']);
    expect(visibleSections(floors, userWith(['POS_QR:READ'])).map((s) => s.key)).toEqual(['qr-codes']);
  });

  it('offers the setup wizard only while it can run', () => {
    const pending = userWith(['TENANT:ADMIN'], { setupCompleted: false });
    expect(tabNames('org', pending)).toContain('Setup Wizard');
    expect(tabNames('org', userWith(['TENANT:ADMIN']))).not.toContain('Setup Wizard');
  });
});

describe('old addresses', () => {
  it.each([
    ['/frontdesk', '/service/today'],
    ['/frontdesk/billing', '/billing'],
    ['/service/floor/order', '/billing'],
    ['/frontdesk/qr-orders', '/service/floor/qr'],
    ['/frontdesk/menu', '/menu/items'],
    ['/frontdesk/menu-tags', '/menu/labels/menu-tags'],
    ['/frontdesk/portals/p-1/menu', '/menu/channels/portals/p-1/menu'],
    ['/frontdesk/campaigns/c-9', '/guests/offers/c-9'],
    ['/frontdesk/access-control', '/org/people'],
    ['/master/taxTypes', '/org/data/taxTypes'],
    ['/reports', '/insights/reports'],
  ])('%s → %s', (from, to) => {
    expect(legacyTargetFor(from)).toBe(to);
  });

  it('keeps the query string', () => {
    expect(legacyTargetFor('/frontdesk/finance', '?tab=gst')).toBe('/money/overview?tab=gst');
    expect(legacyTargetFor('/service/floor/order', '?table=t1')).toBe('/billing?table=t1');
  });

  // Old roots (/frontdesk, /master, /reports) have catch-all routes in App.js;
  // an old address inside today's workspace URLs needs a route of its own.
  it('lists the moved workspace addresses that need their own redirect route', () => {
    expect(MOVED_PATHS).toEqual(['/service/floor/order']);
  });

  it('matches whole path segments only', () => {
    expect(legacyTargetFor('/frontdesk/menus')).toBeNull();
  });

  it('knows nothing it was not told', () => {
    expect(legacyTargetFor('/somewhere/else')).toBeNull();
  });

  // Every old sidebar entry must still lead somewhere.
  it('covers every former Front Desk screen', () => {
    const OLD = [
      'billing', 'tables', 'qr-orders', 'kitchen', 'tokens', 'online', 'tracking',
      'menu', 'food-types', 'meat-types', 'menu-tags', 'category-schedules', 'addon-groups', 'addons',
      'channels', 'portals', 'rejection-reasons', 'variants', 'floors', 'qr-codes', 'business-profile',
      'settings', 'receipt-format', 'campaigns', 'inventory', 'expense-categories', 'asset-categories',
      'finance', 'returns', 'expenses', 'cash-sessions', 'assets', 'customers', 'feedback', 'reports',
      'ledger', 'access-control',
    ];
    OLD.forEach((p) => expect(legacyTargetFor(`/frontdesk/${p}`)).not.toBeNull());
  });
});

describe('the platform console tabs', () => {
  it('holds only what cannot be narrowed to one tenancy', () => {
    expect(labels(visibleAdminTabs(userWith(['TENANT:SUPER_ADMIN'])))).toEqual(
      ['Approvals', 'Features', 'All Users', 'App Config'],
    );
  });

  it('gives a tenant admin nothing — the whole console is super-admin work', () => {
    expect(visibleAdminTabs(userWith(['TENANT:ADMIN']))).toEqual([]);
  });
});

describe('the config itself', () => {
  it('gives every tab a unique path inside its workspace prefix', () => {
    const paths = WORKSPACES.flatMap((w) => w.tabs.filter((t) => !t.external).map((t) => t.path));
    expect(new Set(paths).size).toBe(paths.length);
    WORKSPACES.forEach((w) => w.tabs.filter((t) => !t.external).forEach((t) => {
      expect(workspaceOfPath(t.path).key).toBe(w.key);
    }));
  });

  it('gives every section a unique key within its tab', () => {
    WORKSPACES.flatMap((w) => w.tabs).filter((t) => t.sections).forEach((t) => {
      const keys = t.sections.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it('names each old address once', () => {
    const froms = LEGACY_PATHS.map((l) => l.from);
    expect(new Set(froms).size).toBe(froms.length);
  });
});
