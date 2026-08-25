import {
  PRIMARY_NAV, FRONT_DESK_NAV,
  visibleNavItems, visibleNavGroups, visibleAdminTabs,
} from '../navigation';

// Menus are built from the user's scopes, so what is on screen matches what the
// API will actually allow. Two failure modes are equally bad and both are
// covered here: offering a link that leads to a 403, and hiding a screen the
// person is entitled to use.

const userWith = (scopes, over = {}) => ({
  tid: 'tenant-1', onboardingStatus: 'APPROVED', scopes, ...over,
});

const labels = (items) => items.map((i) => i.label);

describe('the top bar', () => {
  it('gives a tenant admin everything in their tenancy', () => {
    const seen = labels(visibleNavItems(PRIMARY_NAV, userWith(['TENANT:ADMIN'])));
    expect(seen).toEqual(expect.arrayContaining([
      'Home', 'Master Data', 'Reports', 'Access', 'Front Desk', 'Audit Logs',
    ]));
  });

  // The bug this locks down: Access was gated on admin:access, which nothing
  // grants, so every tenant admin was refused their own admin screens.
  it('offers Access to a tenant admin, not only to admin:access', () => {
    expect(labels(visibleNavItems(PRIMARY_NAV, userWith(['TENANT:ADMIN'])))).toContain('Access');
    expect(labels(visibleNavItems(PRIMARY_NAV, userWith(['admin:access'])))).toContain('Access');
  });

  // One screen manages a tenancy's people, and it lives on Front Desk.
  it('points Access at the front-desk screen, not at /admin', () => {
    const access = visibleNavItems(PRIMARY_NAV, userWith(['TENANT:ADMIN']))
      .find((i) => i.label === 'Access');
    expect(access.path).toBe('/frontdesk/access-control');
  });

  // The platform console is a different job for a different audience.
  it('offers Platform to a super admin only', () => {
    expect(labels(visibleNavItems(PRIMARY_NAV, userWith(['TENANT:SUPER_ADMIN']))))
      .toContain('Platform');
    expect(labels(visibleNavItems(PRIMARY_NAV, userWith(['TENANT:ADMIN']))))
      .not.toContain('Platform');
  });

  it('withholds it from somebody who administers nothing', () => {
    const seen = labels(visibleNavItems(PRIMARY_NAV, userWith(['POS_ORDER:READ'])));
    expect(seen).not.toContain('Access');
    expect(seen).toContain('Front Desk');
  });

  // Master Data used to carry no permission check at all, so a cashier was
  // shown a link to an index with nothing in it.
  it('hides Master Data from a user with no master-data category', () => {
    expect(labels(visibleNavItems(PRIMARY_NAV, userWith(['POS_ORDER:READ']))))
      .not.toContain('Master Data');
  });

  // The category map also covers POS Config / Operations / CRM, which live on
  // the Front Desk. Deriving the link from all of it put Master Data in every
  // cashier's menu, since POS_CONFIG:READ is part of taking an order.
  it('does not treat a POS category as a master-data category', () => {
    const cashier = userWith(['POS_ORDER:READ', 'POS_ORDER:WRITE', 'POS_BILLING:READ',
      'POS_BILLING:WRITE', 'POS_CRM:READ', 'POS_CONFIG:READ']);
    expect(labels(visibleNavItems(PRIMARY_NAV, cashier))).not.toContain('Master Data');
    // …while the screens their role IS for stay reachable.
    expect(labels(visibleNavItems(PRIMARY_NAV, cashier))).toContain('Front Desk');
  });

  it('shows it for any ONE of the categories it covers', () => {
    expect(labels(visibleNavItems(PRIMARY_NAV, userWith(['INVENTORY:READ']))))
      .toContain('Master Data');
  });

  it('leaves a super admin nothing hidden', () => {
    const seen = labels(visibleNavItems(PRIMARY_NAV, userWith(['TENANT:SUPER_ADMIN'])));
    expect(seen).toContain('Access');
    expect(seen).toContain('Master Data');
  });

  it('reduces to Home and Audit Logs while setup is pending', () => {
    const seen = labels(visibleNavItems(
      PRIMARY_NAV, userWith(['TENANT:ADMIN'], { setupCompleted: false }),
    ));
    expect(seen).toEqual(expect.arrayContaining(['Home', 'Audit Logs', 'Setup Wizard']));
    expect(seen).not.toContain('Front Desk');
    expect(seen).not.toContain('Master Data');
  });
});

describe('the front desk sidebar', () => {
  it('shows a cashier the tills and nothing else', () => {
    const groups = visibleNavGroups(FRONT_DESK_NAV, userWith(['POS_ORDER:READ']));
    const seen = groups.flatMap((g) => labels(g.items));
    expect(seen).toEqual(expect.arrayContaining(['Billing & KOT', 'Tables']));
    expect(seen).not.toContain('Ledger');
    expect(seen).not.toContain('Access & Staff');
  });

  // A heading over an empty list reads as a broken screen.
  it('drops a group with nothing visible in it', () => {
    const groups = visibleNavGroups(FRONT_DESK_NAV, userWith(['POS_ORDER:READ']));
    expect(groups.map((g) => g.group)).not.toContain('Finance');
    groups.forEach((g) => expect(g.items.length).toBeGreaterThan(0));
  });

  it('gives a tenant admin every group', () => {
    const groups = visibleNavGroups(FRONT_DESK_NAV, userWith(['TENANT:ADMIN']));
    expect(groups.map((g) => g.group)).toEqual(
      ['Operations', 'Setup', 'Finance', 'CRM', 'Analytics & Admin'],
    );
  });

  it('keeps the dashboard visible to anybody who reaches the front desk', () => {
    const groups = visibleNavGroups(FRONT_DESK_NAV, userWith(['POS_KITCHEN:READ']));
    expect(groups.flatMap((g) => labels(g.items))).toContain('Dashboard');
  });
});

describe('the platform console tabs', () => {
  // Everything left in /admin crosses tenancy boundaries or has none: the
  // onboarding queue has no tenant_id until a request is approved, the feature
  // catalogue is global, All Users spans tenancies, App Config is system-wide.
  it('holds only what cannot be narrowed to one tenancy', () => {
    expect(labels(visibleAdminTabs(userWith(['TENANT:SUPER_ADMIN'])))).toEqual(
      ['Approvals', 'Features', 'All Users', 'App Config'],
    );
  });

  // Users and Roles were tenant-scoped all along and duplicated the front-desk
  // screen, so they moved there and the old URLs redirect.
  it('no longer carries Users or Roles', () => {
    const seen = labels(visibleAdminTabs(userWith(['TENANT:SUPER_ADMIN'])));
    expect(seen).not.toContain('Users');
    expect(seen).not.toContain('Roles');
  });

  it('gives a tenant admin nothing — the whole console is super-admin work', () => {
    expect(visibleAdminTabs(userWith(['TENANT:ADMIN']))).toEqual([]);
  });
});

describe('the config itself', () => {
  it('gives every entry a stable key and a path', () => {
    const all = [...PRIMARY_NAV, ...FRONT_DESK_NAV.flatMap((g) => g.items)];
    all.forEach((item) => {
      expect(item.key).toBeTruthy();
      expect(item.path).toBeTruthy();
    });
    const keys = all.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
