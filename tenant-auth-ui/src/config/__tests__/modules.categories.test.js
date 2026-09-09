import { MODULES } from '../modules';

// The category tree is two levels: category → sub-category. The form is the
// first place that limit is either respected or quietly broken, and the ways it
// breaks are all silent:
//
//   * pointing the parent picker at /api/categories offers sub-categories as
//     parents, so a user builds an illegal third level and only learns on save;
//   * a maxLength looser than the column lets a too-long name reach MySQL,
//     where it fails as a 500 instead of a message next to the field;
//   * listing ParentId instead of ParentName shows a uuid, which answers
//     nothing about what the row is under.

describe('the parent picker', () => {
  const parentField = MODULES.categories.fields.find((f) => f.name === 'ParentId');

  it('exists and is a select', () => {
    expect(parentField).toBeDefined();
    expect(parentField.type).toBe('select');
  });

  it('is optional — a top-level category has no parent', () => {
    expect(parentField.required).toBeFalsy();
  });

  // The whole point. /api/categories would include sub-categories.
  it('reads the parent-candidates endpoint, not the full category list', () => {
    const target = MODULES[parentField.reference];
    expect(target).toBeDefined();
    expect(target.endpoint).toBe('/api/categories/parent-candidates');
    expect(target.endpoint).not.toBe('/api/categories');
  });
});

describe('the reference-only entry', () => {
  it('declares no category, so the Master Data index does not render it', () => {
    // With a category it would appear as a screen the user can open, which
    // would 404 — there is no route for it.
    expect(MODULES.categoryParents.category).toBeUndefined();
  });

  it('still carries what a reference needs: an endpoint and a display field', () => {
    expect(MODULES.categoryParents.endpoint).toBeTruthy();
    expect(MODULES.categoryParents.displayField).toBe('Name');
  });
});

describe('the category form matches the column', () => {
  it('caps Name at 50, the width of categorydetail.Name', () => {
    const name = MODULES.categories.fields.find((f) => f.name === 'Name');
    expect(name.maxLength).toBe(50);
  });

  it('offers a sort order, which portals honour', () => {
    expect(MODULES.categories.fields.map((f) => f.name)).toContain('SortOrder');
  });
});

describe('the category list', () => {
  it('shows the parent NAME rather than its id', () => {
    expect(MODULES.categories.tableColumns).toContain('ParentName');
    expect(MODULES.categories.tableColumns).not.toContain('ParentId');
  });
});
