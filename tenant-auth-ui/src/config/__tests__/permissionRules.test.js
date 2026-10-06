import { requirementsOf, withRequirements, requiredBy, effectiveScopes, REQUIRES } from '../permissionRules';

// The same rules as the backend's config/permissionRules.js. The editor uses
// them to tick a requirement for the admin; the server adds it anyway on save.

describe('permission requirements', () => {
  it('Manage needs View; approvals need the screen they are made from', () => {
    expect(requirementsOf('POS_ORDER:WRITE')).toEqual(['POS_ORDER:READ']);
    expect(requirementsOf('EXPENSE:APPROVE')).toEqual(['POS_OPS:READ']);
    expect(requirementsOf('REFUND:APPROVE')).toEqual(['TRANSACTIONS:READ']);
    expect(requirementsOf('CUSTOMER:EXPORT')).toEqual(['POS_CRM:READ']);
    expect(requirementsOf('POS_ORDER:READ')).toEqual([]);
  });

  it('closes a set over its requirements, only from what the catalogue has', () => {
    const available = ['POS_ORDER:READ', 'POS_ORDER:WRITE', 'POS_OPS:READ', 'EXPENSE:APPROVE'];
    expect(withRequirements(['POS_ORDER:WRITE', 'EXPENSE:APPROVE'], available))
      .toEqual(['EXPENSE:APPROVE', 'POS_OPS:READ', 'POS_ORDER:READ', 'POS_ORDER:WRITE']);
    expect(withRequirements(['ASSET:WRITE'], available)).toEqual(['ASSET:WRITE']);
  });

  it('says which choices require a permission', () => {
    expect(requiredBy('POS_ORDER:READ', ['POS_ORDER:WRITE', 'POS_BILLING:READ'])).toEqual(['POS_ORDER:WRITE']);
  });

  it('treats a held Manage as a held View', () => {
    const held = effectiveScopes(['POS_ORDER:WRITE', 'EXPENSE:APPROVE']);
    expect(held.has('POS_ORDER:READ')).toBe(true);
    // Approvals are not "Manage"; they imply nothing on their own.
    expect(held.has('EXPENSE:READ')).toBe(false);
  });

  it('matches the backend rule table', () => {
    expect(REQUIRES).toEqual({
      'EXPENSE:APPROVE': ['POS_OPS:READ'],
      'REFUND:APPROVE': ['TRANSACTIONS:READ'],
      'CUSTOMER:EXPORT': ['POS_CRM:READ'],
    });
  });
});
