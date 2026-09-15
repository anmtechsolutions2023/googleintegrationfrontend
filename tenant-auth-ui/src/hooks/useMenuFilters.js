import { useCallback, useMemo, useState } from 'react'
import {
  ALL, filterMenu, categoryChips, dietChips, tagGroups, tagTypeIndex,
  tagSuggestions, effectiveTags, categoryIdOf, categoryNameOf, activeChips,
} from '../utils/menuFilters'

/**
 * The menu filters — search, category, diet and menu tags — as one piece of
 * state with everything derived from it.
 *
 * Shared by Billing and Menu Master so a manager setting up the menu narrows it
 * exactly the way a cashier does. Two copies would drift: a tag filter that
 * matches inherited tags on one screen and not the other is a bug report
 * waiting to happen. The rules themselves stay in utils/menuFilters.
 *
 * @param {Array<Object>} menu - Menu rows as /api/pos/item-meta returns them.
 * @param {(row: Object) => string} nameOf - The name a row is shown under.
 *   Must be stable (useCallback or module-level) — every count depends on it.
 */
const useMenuFilters = (menu, nameOf) => {
  const [category, setCategory] = useState(ALL)
  const [diet, setDiet] = useState(ALL)
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState([])
  // On sale: all / on / off. Menu Master offers it; Billing never sets it.
  const [active, setActive] = useState(ALL)
  const [tagSheetOpen, setTagSheetOpen] = useState(false)

  const state = useMemo(
    () => ({ category, diet, query, tags, active }),
    [category, diet, query, tags, active],
  )
  const tagIndex = useMemo(() => tagTypeIndex(menu), [menu])

  const filtered = useMemo(
    () => filterMenu(menu, state, nameOf, tagIndex),
    [menu, state, nameOf, tagIndex],
  )
  // Each chip counts what it would ACTUALLY show — under every filter except
  // its own. Counting the whole menu would promise twelve pizzas and deliver
  // ten the moment Veg is also on.
  const catChips = useMemo(() => categoryChips(menu, state, nameOf), [menu, state, nameOf])
  const dtChips = useMemo(() => dietChips(menu, state, nameOf), [menu, state, nameOf])
  const groups = useMemo(() => tagGroups(menu, state, nameOf), [menu, state, nameOf])
  const hints = useMemo(() => tagSuggestions(menu, state, nameOf), [menu, state, nameOf])
  const saleChips = useMemo(() => activeChips(menu, state, nameOf), [menu, state, nameOf])

  // Tag id → its name, for the facet pills. tagIndex carries the TYPE, which is
  // what filtering needs; a pill has to show what a person recognises.
  const tagNames = useMemo(() => {
    const names = new Map()
    ;(menu || []).forEach((m) => effectiveTags(m).forEach((t) => {
      if (!names.has(t.id)) names.set(t.id, t.name)
    }))
    return names
  }, [menu])

  const toggleTag = useCallback((id) => setTags(
    (prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]),
  ), [])

  const clear = useCallback(() => {
    setCategory(ALL)
    setDiet(ALL)
    setQuery('')
    setTags([])
    setActive(ALL)
  }, [])

  // Every filter currently narrowing the list, each able to remove itself.
  const facets = useMemo(() => {
    const out = []
    if (category !== ALL) {
      const row = (menu || []).find((m) => categoryIdOf(m) === category)
      out.push({ key: 'cat', name: row ? categoryNameOf(row) : 'Category', drop: () => setCategory(ALL) })
    }
    if (diet !== ALL) out.push({ key: 'diet', name: diet, drop: () => setDiet(ALL) })
    if (active !== ALL) {
      out.push({ key: 'active', name: active === 'on' ? 'On sale' : 'Off', drop: () => setActive(ALL) })
    }
    tags.forEach((id) => {
      out.push({
        key: `tag-${id}`,
        name: tagNames.get(id) || 'Tag',
        drop: () => setTags((prev) => prev.filter((x) => x !== id)),
      })
    })
    if (query) out.push({ key: 'q', name: `“${query}”`, drop: () => setQuery('') })
    return out
  }, [menu, category, diet, active, tags, query, tagNames])

  const isFiltered = category !== ALL || diet !== ALL || active !== ALL || !!query || tags.length > 0

  return {
    state,
    filtered,
    isFiltered,
    catChips,
    dtChips,
    groups,
    hints,
    saleChips,
    facets,
    tagSheetOpen,
    setTagSheetOpen,
    setCategory,
    setDiet,
    setQuery,
    setTags,
    setActive,
    toggleTag,
    clear,
  }
}

export default useMenuFilters
