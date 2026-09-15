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

/* ── Tags ──────────────────────────────────────────────────────────────────
   A tag reaches a dish from either of two places: set on the dish itself
   (pos_item_meta_tag), or on its category (pos_category_tag), which every dish
   filed there inherits. The payload keeps the two APART so the grid can show
   where a tag came from; filtering wants the union.

   'CATEGORY' as a TagType collides with categorydetail, which is a different
   thing entirely — the section a dish is filed under. Labelled COURSE on screen
   so one row of chips is not two meanings of the same word. */
export const TAG_TYPE_ORDER = ['CATEGORY', 'BEVERAGE', 'CUISINE']
export const TAG_TYPE_LABEL = { CATEGORY: 'COURSE', BEVERAGE: 'DRINK', CUISINE: 'CUISINE' }

const asTags = (v) => (Array.isArray(v) ? v.filter((t) => t && t.id) : [])

/**
 * Every tag that applies to a dish, marked with where it came from.
 *
 * Union, and the dish wins: a tag set on both is reported once, as its own.
 * @param {Object} meta
 * @returns {Array<{id:string,name:string,type:string,from:'item'|'category'}>}
 */
export const effectiveTags = (meta) => {
  const out = []
  const seen = new Set()
  asTags(meta?.OwnTags).forEach((t) => {
    if (seen.has(t.id)) return
    seen.add(t.id)
    out.push({ ...t, from: 'item' })
  })
  asTags(meta?.CategoryTags).forEach((t) => {
    if (seen.has(t.id)) return
    seen.add(t.id)
    out.push({ ...t, from: 'category' })
  })
  return out
}

/**
 * Does the dish satisfy every ACTIVE tag type?
 *
 * OR inside a type, AND across types. "Chinese or North Indian, and a Starter"
 * is the question a cashier asks; one flat AND over every tag answers a
 * question nobody asks and usually returns nothing.
 */
const tagsOk = (meta, active, tagIndex) => {
  if (!active || active.length === 0) return true
  const mine = new Set(effectiveTags(meta).map((t) => t.id))
  const byType = new Map()
  active.forEach((id) => {
    const type = tagIndex.get(id) || 'CUISINE'
    if (!byType.has(type)) byType.set(type, [])
    byType.get(type).push(id)
  })
  return [...byType.values()].every((ids) => ids.some((id) => mine.has(id)))
}

/** tag id → its type, gathered from whatever the menu actually carries. */
export const tagTypeIndex = (menu) => {
  const index = new Map()
  ;(menu || []).forEach((m) => effectiveTags(m).forEach((t) => {
    if (!index.has(t.id)) index.set(t.id, t.type)
  }))
  return index
}

/* ── Trading hours ─────────────────────────────────────────────────────────
   A dish whose section is outside its scheduled windows stays on the grid and
   stops being orderable. Hidden would be worse: the cashier hunts for a dish
   that is simply not shown, and cannot tell "we do not sell it" from "not yet".

   The default is AVAILABLE — a payload with no availability at all (an older
   server) must not grey the entire menu. */
export const isCategoryOpen = (meta) => meta?.CategoryAvailableNow !== false

/**
 * Turned on in Menu Master. Off is the manager's switch, and it beats a
 * section's hours: an open section does not make an Off dish orderable.
 * A row that says nothing about Active (an older payload) counts as on.
 */
export const isOnSale = (meta) => {
  const v = meta?.Active
  return !(v === false || v === 0 || v === '0')
}

/** Orderable right now: on sale AND its section open. */
export const isAvailable = (meta) => isOnSale(meta) && isCategoryOpen(meta)

/** 'Opens 18:00' / 'Back at 07:00', or '' while it is on the menu. */
export const openLabel = (meta) => {
  if (isAvailable(meta)) return ''
  // Never an opening time for an Off dish: at that time it would still be off.
  if (!isOnSale(meta)) return 'Not on sale'
  const at = meta?.CategoryOpensAt
  return at ? `Opens ${String(at).slice(0, 5)}` : 'Off the menu'
}

/**
 * Does this item survive the given filters?
 *
 * @param {Object} meta - A menu row.
 * @param {Object} f - { category, diet, query }
 * @param {Function} nameOf - Resolves the item's display name.
 */
export const matches = (
  meta,
  { category = ALL, diet = ALL, query = '', tags = [], active = ALL } = {},
  nameOf,
  tagIndex = null,
) => {
  if (category !== ALL && categoryIdOf(meta) !== category) return false
  if (diet !== ALL && dietOf(meta) !== diet) return false
  if (active === 'on' && !isOnSale(meta)) return false
  if (active === 'off' && isOnSale(meta)) return false
  if (!tagsOk(meta, tags, tagIndex || new Map())) return false
  if (query) {
    // THREE vocabularies, one field: the dish's name, the tags on it, and the
    // section it is filed under. A cashier who types "chinese" means any of
    // them, and having to know which one would make the box useless.
    const haystack = [
      nameOf ? nameOf(meta) : meta?.Name || '',
      categoryNameOf(meta),
      ...effectiveTags(meta).map((t) => t.name),
    ].join(' ').toLowerCase()
    if (!haystack.includes(String(query).toLowerCase())) return false
  }
  return true
}

/** Apply all three. */
export const filterMenu = (menu, filters, nameOf, tagIndex = null) => {
  const index = tagIndex || tagTypeIndex(menu)
  return (menu || []).filter((m) => matches(m, filters, nameOf, index))
}

/**
 * The tag chips, grouped by the vocabulary each belongs to.
 *
 * Grouped rather than a flat run of twelve: the master already carries the
 * distinction, and a single row where "Starter" sits beside "Chinese" makes
 * them look like the same kind of choice.
 *
 * Each count is measured with that tag ADDED to the current selection, so a 0
 * is an honest "this would empty the grid" rather than a whole-menu total.
 */
export const tagGroups = (menu, filters, nameOf) => {
  const index = tagTypeIndex(menu)
  const byType = new Map()
  ;(menu || []).forEach((m) => effectiveTags(m).forEach((t) => {
    if (!byType.has(t.type)) byType.set(t.type, new Map())
    byType.get(t.type).set(t.id, t.name)
  }))

  const active = filters?.tags || []
  const countWith = (id) => {
    const next = active.includes(id) ? active : [...active, id]
    return filterMenu(menu, { ...filters, tags: next }, nameOf, index).length
  }

  const order = (type) => {
    const i = TAG_TYPE_ORDER.indexOf(type)
    return i === -1 ? TAG_TYPE_ORDER.length : i
  }

  return [...byType.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([type, tags]) => ({
      type,
      label: TAG_TYPE_LABEL[type] || type,
      tags: [...tags.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => ({ id, name, count: countWith(id) })),
    }))
}

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

  // Availability is a property of the CATEGORY, so every dish in it agrees —
  // one row is enough to read it off. On the chip because a section that reads
  // as shut BEFORE it is tapped saves the tap, and the empty grid after it.
  const shut = new Map()
  ;(menu || []).forEach((m) => {
    const id = categoryIdOf(m)
    // The SECTION's hours only — one dish turned off must not mark its whole
    // category as closed.
    if (!shut.has(id)) shut.set(id, { closed: !isCategoryOpen(m), opensAt: m?.CategoryOpensAt || null })
  })

  const chips = [...seen.entries()]
    .filter(([id]) => id !== UNCATEGORISED)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ id, name, count: countUnder(id), ...(shut.get(id) || {}) }))

  if (seen.has(UNCATEGORISED)) {
    chips.push({
      id: UNCATEGORISED,
      name: categoryNameOf(null),
      count: countUnder(UNCATEGORISED),
      closed: false,
      opensAt: null,
    })
  }

  return [
    {
      id: ALL,
      name: 'All',
      count: filterMenu(menu, { ...filters, category: ALL }, nameOf).length,
      closed: false,
      opensAt: null,
    },
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

/**
 * On / Off chips for Menu Master, each counting what it would show under the
 * other filters.
 */
export const activeChips = (menu, filters, nameOf) => {
  const countUnder = (active) => filterMenu(menu, { ...filters, active }, nameOf).length
  return [
    { id: ALL, name: 'All', count: countUnder(ALL) },
    { id: 'on', name: 'On', count: countUnder('on') },
    { id: 'off', name: 'Off', count: countUnder('off') },
  ]
}

/**
 * Tags whose NAME matches what is being typed.
 *
 * The link between a free-text box and a vocabulary nobody has memorised: a
 * cashier types "chin" and is handed the Chinese facet, instead of needing to
 * know it lives behind a Tags button. Each carries the count it WOULD give, so
 * a suggestion that would empty the grid says so before it is taken.
 *
 * @param {Array<Object>} menu
 * @param {Object} filters current filter state, including `tags`
 * @param {Function} nameOf
 * @param {number} [limit]
 * @returns {Array<{id, name, type, label, count}>}
 */
export const tagSuggestions = (menu, filters, nameOf, limit = 3) => {
  const q = String(filters?.query || '').trim().toLowerCase()
  if (q.length < 2) return []

  const active = filters?.tags || []
  const seen = new Map()
  ;(menu || []).forEach((m) => effectiveTags(m).forEach((t) => {
    if (!seen.has(t.id)) seen.set(t.id, t)
  }))

  return [...seen.values()]
    .filter((t) => !active.includes(t.id) && t.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map((t) => ({
      ...t,
      label: (TAG_TYPE_LABEL[t.type] || t.type).toLowerCase(),
      // Counted as the facet WITHOUT the free text, because taking it REPLACES
      // what was typed. Promising a number the tap would not deliver is worse
      // than showing no number.
      count: filterMenu(menu, { ...filters, query: '', tags: [...active, t.id] }, nameOf).length,
    }))
}

/** Veg-ness for the chip's colour dot, from the same flag the badge uses. */
export const isVegName = (menu, name) => {
  const hit = (menu || []).find((m) => dietOf(m) === name)
  return hit ? (hit.FoodTypeIsVeg === 1 || hit.FoodTypeIsVeg === true) : false
}

const menuFilters = {
  ALL, UNCATEGORISED, categoryIdOf, categoryNameOf, dietOf,
  matches, filterMenu, categoryChips, dietChips, isVegName,
  TAG_TYPE_ORDER, TAG_TYPE_LABEL, effectiveTags, tagTypeIndex, tagGroups,
  isAvailable, openLabel, tagSuggestions, isOnSale, isCategoryOpen, activeChips,
}

export default menuFilters
