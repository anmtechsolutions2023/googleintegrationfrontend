/**
 * Narrowing the till's menu: by category, by diet, by name.
 *
 * Pure, and deliberately outside Billing.js — the counts are the fiddly part
 * and they are worth testing without mounting a till.
 *
 * TWO AXES, NOT ONE LIST
 * Category and diet are different kinds of thing and a cashier uses them
 * together ("Pizza, veg only"). One merged row of chips cannot express that AND,
 * and folding Veg in among the categories makes "Veg" look like somewhere
 * dishes live rather than a property they have.
 */

export const ALL = 'all'

/** Category as the menu payload now reports it. Null is a real state: an item
 *  with no category must still be sellable, so it groups under its own chip
 *  rather than disappearing from a filtered menu. */
export const UNCATEGORISED = '__none__'

export const categoryIdOf = (meta) => meta?.CategoryId || UNCATEGORISED
export const categoryNameOf = (meta) => meta?.CategoryName || 'Uncategorised'

/**
 * Diet keys on the food type's NAME, not on IsVeg.
 *
 * pos_food_type seeds Vegan with IsVeg = 1, so a "Veg" filter written against
 * IsVeg would sweep every vegan dish into it. Keying on the name also means the
 * master stays CRUD-managed: a tenant adding 'Jain' gets a chip, no code change.
 */
export const dietOf = (meta) => meta?.FoodTypeName || null

/**
 * Does this item survive the given filters?
 *
 * @param {Object} meta - A menu row.
 * @param {Object} f - { category, diet, query }
 * @param {Function} nameOf - Resolves the item's display name.
 */
export const matches = (meta, { category = ALL, diet = ALL, query = '' } = {}, nameOf) => {
  if (category !== ALL && categoryIdOf(meta) !== category) return false
  if (diet !== ALL && dietOf(meta) !== diet) return false
  if (query) {
    const name = String(nameOf ? nameOf(meta) : meta?.Name || '').toLowerCase()
    if (!name.includes(String(query).toLowerCase())) return false
  }
  return true
}

/** Apply all three. */
export const filterMenu = (menu, filters, nameOf) =>
  (menu || []).filter((m) => matches(m, filters, nameOf))

/**
 * The category chips, each carrying how many items it would actually show.
 *
 * A count is computed under every filter EXCEPT its own. Counting the whole
 * menu would promise twelve pizzas and deliver ten the moment Veg is also on —
 * and a chip that says 0 is honest about a tap that would empty the grid.
 *
 * Order follows the menu's own order (which the API sorts), with All first and
 * Uncategorised last: an incidental bucket should not lead the rail.
 */
export const categoryChips = (menu, filters, nameOf) => {
  const seen = new Map()
  ;(menu || []).forEach((m) => {
    const id = categoryIdOf(m)
    if (!seen.has(id)) seen.set(id, categoryNameOf(m))
  })

  const countUnder = (category) =>
    filterMenu(menu, { ...filters, category }, nameOf).length

  const chips = [...seen.entries()]
    .filter(([id]) => id !== UNCATEGORISED)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ id, name, count: countUnder(id) }))

  if (seen.has(UNCATEGORISED)) {
    chips.push({
      id: UNCATEGORISED,
      name: categoryNameOf(null),
      count: countUnder(UNCATEGORISED),
    })
  }

  return [
    { id: ALL, name: 'All', count: filterMenu(menu, { ...filters, category: ALL }, nameOf).length },
    ...chips,
  ]
}

/**
 * The diet chips, from the food types the menu actually uses.
 *
 * Derived rather than hard-coded, so the row reflects this tenant's
 * pos_food_type master instead of an assumption about three of them.
 */
export const dietChips = (menu, filters, nameOf) => {
  const seen = []
  ;(menu || []).forEach((m) => {
    const d = dietOf(m)
    if (d && !seen.includes(d)) seen.push(d)
  })

  const countUnder = (diet) => filterMenu(menu, { ...filters, diet }, nameOf).length

  return [
    { id: ALL, name: 'All', count: countUnder(ALL) },
    ...seen.sort().map((d) => ({ id: d, name: d, count: countUnder(d) })),
  ]
}

/** Veg-ness for the chip's colour dot, from the same flag the badge uses. */
export const isVegName = (menu, name) => {
  const hit = (menu || []).find((m) => dietOf(m) === name)
  return hit ? (hit.FoodTypeIsVeg === 1 || hit.FoodTypeIsVeg === true) : false
}

const menuFilters = {
  ALL, UNCATEGORISED, categoryIdOf, categoryNameOf, dietOf,
  matches, filterMenu, categoryChips, dietChips, isVegName,
}

export default menuFilters
