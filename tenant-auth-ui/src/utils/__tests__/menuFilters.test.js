import {
  ALL, UNCATEGORISED, categoryIdOf, categoryNameOf, dietOf,
  filterMenu, categoryChips, dietChips, isVegName,
} from '../menuFilters'

// Narrowing the till's menu. The counts are the part worth pinning: they are
// what a cashier trusts before tapping, and the tempting implementation —
// counting the whole menu — is wrong in a way nobody notices until the grid
// empties.

const item = (name, category, diet, isVeg) => ({
  Id: name, ItemDetailId: `d-${name}`, Name: name,
  CategoryId: category ? `cat-${category}` : null,
  CategoryName: category || null,
  FoodTypeName: diet, FoodTypeIsVeg: isVeg ? 1 : 0,
})

const MENU = [
  item('Margherita', 'Pizza', 'Veg', true),
  item('Peppy Paneer', 'Pizza', 'Veg', true),
  item('BBQ Chicken', 'Pizza', 'Non-Veg', false),
  item('Masala Chai', 'Beverages', 'Veg', true),
  item('Lime Soda', 'Beverages', 'Vegan', true),
  item('Chicken Wings', 'Sides', 'Non-Veg', false),
]

const nameOf = (m) => m.Name
const names = (list) => list.map((m) => m.Name)
const byId = (chips, id) => chips.find((c) => c.id === id)

describe('reading an item', () => {
  test('an item with no category is its own bucket, not a missing one', () => {
    // It must stay sellable. Dropping it from a filtered menu would make a dish
    // unorderable because somebody forgot to categorise it.
    const orphan = item('Mystery', null, 'Veg', true)
    expect(categoryIdOf(orphan)).toBe(UNCATEGORISED)
    expect(categoryNameOf(orphan)).toBe('Uncategorised')
  })

  test('diet reads the food type NAME, never the IsVeg flag', () => {
    // pos_food_type seeds Vegan with IsVeg = 1. Filtering "Veg" on that flag
    // would sweep every vegan dish in with it.
    const vegan = item('Lime Soda', 'Beverages', 'Vegan', true)
    expect(dietOf(vegan)).toBe('Vegan')
    expect(vegan.FoodTypeIsVeg).toBe(1)
  })
})

describe('filtering', () => {
  test('no filters shows everything', () => {
    expect(filterMenu(MENU, {}, nameOf)).toHaveLength(6)
  })

  test('a category narrows to that category', () => {
    expect(names(filterMenu(MENU, { category: 'cat-Pizza' }, nameOf)))
      .toEqual(['Margherita', 'Peppy Paneer', 'BBQ Chicken'])
  })

  test('a diet narrows to that food type', () => {
    expect(names(filterMenu(MENU, { diet: 'Non-Veg' }, nameOf)))
      .toEqual(['BBQ Chicken', 'Chicken Wings'])
  })

  test('vegan is not swept into veg', () => {
    expect(names(filterMenu(MENU, { diet: 'Veg' }, nameOf)))
      .toEqual(['Margherita', 'Peppy Paneer', 'Masala Chai'])
    expect(names(filterMenu(MENU, { diet: 'Vegan' }, nameOf))).toEqual(['Lime Soda'])
  })

  test('the two filters combine — the whole reason they are separate controls', () => {
    expect(names(filterMenu(MENU, { category: 'cat-Pizza', diet: 'Veg' }, nameOf)))
      .toEqual(['Margherita', 'Peppy Paneer'])
  })

  test('search narrows within whatever is already filtered', () => {
    expect(names(filterMenu(MENU, { category: 'cat-Pizza', query: 'chick' }, nameOf)))
      .toEqual(['BBQ Chicken'])
    // The same search outside that category finds nothing — which is why the
    // empty state has to offer a way out.
    expect(filterMenu(MENU, { category: 'cat-Beverages', query: 'chick' }, nameOf)).toEqual([])
  })

  test('search is case insensitive', () => {
    expect(names(filterMenu(MENU, { query: 'MARGH' }, nameOf))).toEqual(['Margherita'])
  })
})

describe('category chips', () => {
  test('All leads, and every category is offered', () => {
    const chips = categoryChips(MENU, {}, nameOf)
    expect(chips[0]).toMatchObject({ id: ALL, name: 'All', count: 6 })
    expect(chips.map((c) => c.name)).toEqual(['All', 'Beverages', 'Pizza', 'Sides'])
  })

  test('counts are what each chip would ACTUALLY show', () => {
    const chips = categoryChips(MENU, {}, nameOf)
    expect(byId(chips, 'cat-Pizza').count).toBe(3)
    expect(byId(chips, 'cat-Beverages').count).toBe(2)
  })

  test('a count reacts to the OTHER filter', () => {
    // With Veg on, "Pizza 3" would be a lie — it is 2. Counting the whole menu
    // promises items the tap will not deliver.
    const chips = categoryChips(MENU, { diet: 'Veg' }, nameOf)
    expect(byId(chips, 'cat-Pizza').count).toBe(2)
    expect(byId(chips, 'cat-Sides').count).toBe(0)
    expect(byId(chips, ALL).count).toBe(3)
  })

  test('a count ignores its OWN filter, so the selected chip still shows its size', () => {
    const chips = categoryChips(MENU, { category: 'cat-Beverages' }, nameOf)
    expect(byId(chips, 'cat-Pizza').count).toBe(3)
  })

  test('search feeds the counts too', () => {
    const chips = categoryChips(MENU, { query: 'chicken' }, nameOf)
    expect(byId(chips, 'cat-Pizza').count).toBe(1)
    expect(byId(chips, 'cat-Sides').count).toBe(1)
    expect(byId(chips, 'cat-Beverages').count).toBe(0)
  })

  test('Uncategorised is offered, and sorts last', () => {
    const chips = categoryChips([...MENU, item('Mystery', null, 'Veg', true)], {}, nameOf)
    expect(chips[chips.length - 1]).toMatchObject({ id: UNCATEGORISED, count: 1 })
  })

  test('a menu with no categories at all offers only All', () => {
    const chips = categoryChips([item('A', null, 'Veg', true)], {}, nameOf)
    // Only All + Uncategorised — the screen hides the rail below three, so a
    // tenant who has not categorised anything sees no pointless row.
    expect(chips).toHaveLength(2)
  })
})

describe('diet chips', () => {
  test('derived from the food types the menu uses, not hard-coded', () => {
    expect(dietChips(MENU, {}, nameOf).map((c) => c.name))
      .toEqual(['All', 'Non-Veg', 'Veg', 'Vegan'])
  })

  test('a tenant food type nobody anticipated still gets a chip', () => {
    const withJain = [...MENU, item('Jain Thali', 'Sides', 'Jain', true)]
    expect(dietChips(withJain, {}, nameOf).map((c) => c.name)).toContain('Jain')
  })

  test('counts react to the selected category', () => {
    const chips = dietChips(MENU, { category: 'cat-Beverages' }, nameOf)
    expect(byId(chips, 'Veg').count).toBe(1)
    expect(byId(chips, 'Vegan').count).toBe(1)
    expect(byId(chips, 'Non-Veg').count).toBe(0)
  })

  test('the colour dot follows the same flag the item badge uses', () => {
    expect(isVegName(MENU, 'Veg')).toBe(true)
    expect(isVegName(MENU, 'Vegan')).toBe(true)
    expect(isVegName(MENU, 'Non-Veg')).toBe(false)
  })
})

describe('an empty menu', () => {
  test('does not throw, and offers nothing to filter by', () => {
    expect(filterMenu([], {}, nameOf)).toEqual([])
    expect(filterMenu(undefined, {}, nameOf)).toEqual([])
    expect(categoryChips([], {}, nameOf)).toHaveLength(1)
    expect(dietChips([], {}, nameOf)).toHaveLength(1)
  })
})
