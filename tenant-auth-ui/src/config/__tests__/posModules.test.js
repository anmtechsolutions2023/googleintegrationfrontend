import { MODULES } from '../modules';
import { POS_MODULES } from '../posModules';
import { FRONT_DESK_NAV } from '../navigation';

// A `reference` key is how a select finds the list it offers. crudService
// resolves it through MODULES then POS_MODULES and calls that entry's endpoint —
// so a key that matches NEITHER does not throw. It resolves to undefined, the
// fetch never happens, and the dropdown renders empty.
//
// That is the worst kind of bug in a form: nothing is broken on screen, the
// field simply has no options, and the person filling it in assumes there is no
// data yet. posModules.js already carries a long comment about exactly this
// happening once with branch pickers. This file makes it impossible to
// reintroduce silently.

const referenceModule = (key) => MODULES[key] || POS_MODULES[key];

const allReferences = (registry) =>
  Object.entries(registry).flatMap(([moduleKey, mod]) =>
    (mod.fields || [])
      .filter((f) => f.reference)
      .map((f) => ({ moduleKey, field: f.name, reference: f.reference })),
  );

describe('every reference key resolves to a real module', () => {
  it.each(allReferences(POS_MODULES).map((r) => [`${r.moduleKey}.${r.field} → ${r.reference}`, r]))(
    '%s',
    (_label, r) => {
      const target = referenceModule(r.reference);
      expect(target).toBeDefined();
      // Without an endpoint there is nothing to fetch, which fails the same way.
      expect(typeof target.endpoint).toBe('string');
      expect(target.endpoint.length).toBeGreaterThan(0);
    },
  );

  it('covers the same ground for the core registry', () => {
    allReferences(MODULES).forEach((r) => {
      const target = referenceModule(r.reference);
      expect(
        target ? `${r.moduleKey}.${r.field}: ok` : `${r.moduleKey}.${r.field} → ${r.reference} UNRESOLVED`,
      ).toMatch(/ok$/);
    });
  });
});

describe('the portal menu masters', () => {
  const NEW = ['posMeatTypes', 'posMenuTags', 'posAddonGroups', 'posAddons', 'posRejectionReasons'];

  it.each(NEW)('%s is registered with an endpoint and a display field', (key) => {
    const mod = POS_MODULES[key];
    expect(mod).toBeDefined();
    expect(mod.key).toBe(key);
    expect(mod.endpoint).toMatch(/^\/api\/pos\//);
    expect(mod.displayField).toBeTruthy();
    expect(Array.isArray(mod.fields)).toBe(true);
    expect(mod.fields.length).toBeGreaterThan(0);
  });

  // Every one of these has a matching sidebar entry, or the screen exists and
  // nobody can reach it.
  it.each(NEW)('%s has a Front Desk nav entry pointing at its route', (key) => {
    const paths = FRONT_DESK_NAV.flatMap((g) => g.items).map((i) => i.path);
    const expected = {
      posMeatTypes: '/frontdesk/meat-types',
      posMenuTags: '/frontdesk/menu-tags',
      posAddonGroups: '/frontdesk/addon-groups',
      posAddons: '/frontdesk/addons',
      posRejectionReasons: '/frontdesk/rejection-reasons',
    }[key];
    expect(paths).toContain(expected);
  });

  // An add-on is meaningless without the group it belongs to, and the group
  // select is the only thing that supplies it.
  it('points an add-on at its group, and the group list resolves', () => {
    const groupField = POS_MODULES.posAddons.fields.find((f) => f.name === 'AddonGroupId');
    expect(groupField.required).toBe(true);
    expect(referenceModule(groupField.reference)).toBe(POS_MODULES.posAddonGroups);
  });

  // The dietary tag on an add-on: a veg dish with a chicken topping is not a
  // veg order, and this select is what records that.
  it('offers a food type on an add-on, resolving to the core registry', () => {
    const foodField = POS_MODULES.posAddons.fields.find((f) => f.name === 'FoodTypeId');
    expect(referenceModule(foodField.reference)).toBeDefined();
    expect(referenceModule(foodField.reference).endpoint).toBe('/api/pos/food-types');
  });

  // Closed vocabulary — these three strings are what the column is validated
  // against server-side, so a typo here is a 400 the user cannot explain.
  it('constrains a menu tag to the three types the API accepts', () => {
    const tagType = POS_MODULES.posMenuTags.fields.find((f) => f.name === 'TagType');
    expect(tagType.type).toBe('select');
    expect(tagType.options.map((o) => o.value).sort()).toEqual(['BEVERAGE', 'CATEGORY', 'CUISINE']);
    expect(tagType.default).toBe('CATEGORY');
  });

  // Blank PortalId means a HOUSE reason, offered on every portal — so the field
  // must not be required.
  it('lets a rejection reason be a house reason', () => {
    const portal = POS_MODULES.posRejectionReasons.fields.find((f) => f.name === 'PortalId');
    expect(portal.required).toBeFalsy();
    expect(referenceModule(portal.reference)).toBeDefined();
  });

  // The table shows joined NAMES, not uuids — a uuid in a list answers nothing.
  it.each([
    ['posAddons', 'AddonGroupName'],
    ['posAddons', 'FoodTypeName'],
    ['posRejectionReasons', 'PortalName'],
  ])('%s lists %s rather than a raw id', (key, column) => {
    expect(POS_MODULES[key].tableColumns).toContain(column);
  });
});
