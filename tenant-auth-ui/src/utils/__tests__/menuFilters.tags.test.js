import {
  ALL, effectiveTags, filterMenu, tagGroups, tagTypeIndex,
  isAvailable, openLabel, tagSuggestions, categoryChips,
} from '../menuFilters'

// Tags reach a dish from TWO places: set on the dish, or on its category, which
// every dish filed there inherits. One filter has to match either — that is the
// whole point of tagging a section rather than a dozen dishes.

const tag = (id, name, type) => ({ id, name, type })
const CHINESE = tag('t-chi', 'Chinese', 'CUISINE')
const NORTH = tag('t-nor', 'North Indian', 'CUISINE')
const STARTER = tag('t-sta', 'Starter', 'CATEGORY')
const MAIN = tag('t-mai', 'Main Course', 'CATEGORY')

const dish = (name, { own = [], cat = [], category = 'Fried Rice', available = true, opensAt = null } = {}) => ({
  Id: name, ItemName: name, CategoryName: category, CategoryId: category,
  OwnTags: own, CategoryTags: cat,
  CategoryAvailableNow: available, CategoryOpensAt: opensAt,
})

const nameOf = (m) => m.ItemName

// Three fried rices whose SECTION is Chinese; one dish tagged Chinese itself.
const MENU = [
  dish('Veg Korean Fried Rice', { cat: [CHINESE, MAIN] }),
  dish('Chicken Triple Fried Rice', { cat: [CHINESE, MAIN] }),
  dish('Honey Chilli Potato', { own: [CHINESE, STARTER], cat: [NORTH], category: 'North Indian' }),
  dish('Paneer Butter Masala', { own: [MAIN], cat: [NORTH], category: 'North Indian' }),
]

describe('effectiveTags — the union, and where each came from', () => {
  it('marks a tag set on the dish as its own', () => {
    const t = effectiveTags(dish('x', { own: [CHINESE] }))
    expect(t).toEqual([{ ...CHINESE, from: 'item' }])
  })

  it('marks a tag from the section as inherited', () => {
    const t = effectiveTags(dish('x', { cat: [CHINESE] }))
    expect(t).toEqual([{ ...CHINESE, from: 'category' }])
  })

  it('reports a tag on BOTH levels once, as the dish\'s own', () => {
    const t = effectiveTags(dish('x', { own: [CHINESE], cat: [CHINESE] }))
    expect(t).toHaveLength(1)
    expect(t[0].from).toBe('item')
  })

  it('survives a payload with no tag fields at all', () => {
    expect(effectiveTags({})).toEqual([])
    expect(effectiveTags(undefined)).toEqual([])
  })
})

describe('filtering by tag — either level matches', () => {
  const by = (tags) => filterMenu(MENU, { category: ALL, diet: ALL, query: '', tags }, nameOf)
    .map(nameOf)

  it('finds dishes whose SECTION carries the tag', () => {
    expect(by(['t-chi'])).toContain('Veg Korean Fried Rice')
  })

  it('finds a dish that carries the tag itself, in one tap', () => {
    expect(by(['t-chi'])).toContain('Honey Chilli Potato')
  })

  it('is one filter over both, not two', () => {
    expect(by(['t-chi'])).toHaveLength(3)
  })

  // "Chinese or North Indian, AND a Starter" is the question a cashier asks.
  // One flat AND over every tag answers a question nobody asks.
  it('ORs within a tag type', () => {
    expect(by(['t-chi', 't-nor']).sort()).toEqual(MENU.map(nameOf).sort())
  })

  it('ANDs across tag types', () => {
    expect(by(['t-chi', 't-sta'])).toEqual(['Honey Chilli Potato'])
  })

  it('an empty selection filters nothing out', () => {
    expect(by([])).toHaveLength(4)
  })
})

describe('search reads all three vocabularies', () => {
  const find = (query) => filterMenu(MENU, { category: ALL, diet: ALL, query, tags: [] }, nameOf)
    .map(nameOf)

  it('matches the dish name', () => {
    expect(find('paneer')).toEqual(['Paneer Butter Masala'])
  })

  it('matches a tag the dish inherited, which its name never mentions', () => {
    expect(find('chinese')).toContain('Veg Korean Fried Rice')
  })

  it('matches the section it is filed under', () => {
    expect(find('north indian')).toContain('Paneer Butter Masala')
  })
})

describe('tagGroups — grouped, and counted honestly', () => {
  it('groups by vocabulary, course before cuisine', () => {
    const g = tagGroups(MENU, { category: ALL, diet: ALL, query: '', tags: [] }, nameOf)
    expect(g.map((x) => x.label)).toEqual(['COURSE', 'CUISINE'])
  })

  // 'CATEGORY' as a TagType is a different thing from categorydetail. Shown as
  // COURSE so one screen is not two meanings of the same word.
  it('calls the CATEGORY tag type COURSE', () => {
    const g = tagGroups(MENU, { category: ALL, diet: ALL, query: '', tags: [] }, nameOf)
    expect(g.find((x) => x.type === 'CATEGORY').label).toBe('COURSE')
  })

  it('counts each tag as it would apply ON TOP of the current filters', () => {
    // With Starter already on, Chinese would leave exactly one dish.
    const g = tagGroups(MENU, { category: ALL, diet: ALL, query: '', tags: ['t-sta'] }, nameOf)
    const chinese = g.find((x) => x.type === 'CUISINE').tags.find((t) => t.id === 't-chi')
    expect(chinese.count).toBe(1)
  })

  it('offers a tag that reaches dishes only by inheritance', () => {
    const g = tagGroups(MENU, { category: ALL, diet: ALL, query: '', tags: [] }, nameOf)
    expect(g.find((x) => x.type === 'CUISINE').tags.map((t) => t.name))
      .toEqual(['Chinese', 'North Indian'])
  })

  it('builds the type index from whatever the menu carries', () => {
    expect(tagTypeIndex(MENU).get('t-chi')).toBe('CUISINE')
  })
})

describe('trading hours', () => {
  it('is available by default, so an older payload never greys the menu', () => {
    expect(isAvailable({})).toBe(true)
    expect(isAvailable({ CategoryAvailableNow: undefined })).toBe(true)
  })

  it('is unavailable only when the server says so', () => {
    expect(isAvailable({ CategoryAvailableNow: false })).toBe(false)
  })

  it('says WHEN it comes back, not just that it is gone', () => {
    expect(openLabel({ CategoryAvailableNow: false, CategoryOpensAt: '18:00:00' }))
      .toBe('Opens 18:00')
  })

  it('falls back to a plain statement when no time is known', () => {
    expect(openLabel({ CategoryAvailableNow: false })).toBe('Off the menu')
  })

  it('says nothing at all while it is on the menu', () => {
    expect(openLabel({ CategoryAvailableNow: true, CategoryOpensAt: '18:00:00' })).toBe('')
  })

  // Closed is NOT filtered out: the dish stays findable, and the grid says why.
  it('leaves a closed dish in the list', () => {
    const menu = [dish('Poha', { available: false, opensAt: '07:00:00' })]
    expect(filterMenu(menu, { category: ALL, diet: ALL, query: '', tags: [] }, nameOf))
      .toHaveLength(1)
  })
})

describe('tagSuggestions — typing reaches the vocabulary', () => {
  const suggest = (query, tags = []) => tagSuggestions(MENU, { category: ALL, diet: ALL, query, tags }, nameOf)

  it('offers nothing until there is something to match on', () => {
    expect(suggest('')).toEqual([])
    expect(suggest('c')).toEqual([])
  })

  it('offers the facet that means what was typed', () => {
    expect(suggest('chin').map((t) => t.name)).toEqual(['Chinese'])
  })

  it('says which vocabulary it belongs to', () => {
    expect(suggest('chin')[0].label).toBe('cuisine')
    expect(suggest('start')[0].label).toBe('course')
  })

  // Taking a suggestion REPLACES the free text, so counting it alongside the
  // text would promise a number the tap does not deliver.
  it('counts the facet WITHOUT the text it replaces', () => {
    expect(suggest('chin')[0].count).toBe(3)
  })

  it('does not offer a facet that is already on', () => {
    expect(suggest('chin', ['t-chi'])).toEqual([])
  })

  it('matches on the tag name, not the dish name', () => {
    expect(suggest('potato')).toEqual([])
  })
})

describe('categoryChips carry their trading hours', () => {
  const shut = [
    { ...MENU[0], CategoryId: 'Breakfast', CategoryName: 'Breakfast', CategoryAvailableNow: false, CategoryOpensAt: '07:00:00' },
    ...MENU,
  ]

  it('marks a section that is closed right now', () => {
    const chips = categoryChips(shut, { category: ALL, diet: ALL, query: '', tags: [] }, nameOf)
    expect(chips.find((c) => c.id === 'Breakfast').closed).toBe(true)
    expect(chips.find((c) => c.id === 'Breakfast').opensAt).toBe('07:00:00')
  })

  it('leaves an open section unmarked', () => {
    const chips = categoryChips(shut, { category: ALL, diet: ALL, query: '', tags: [] }, nameOf)
    expect(chips.find((c) => c.id === 'Fried Rice').closed).toBe(false)
  })

  it('never marks the All chip', () => {
    const chips = categoryChips(shut, { category: ALL, diet: ALL, query: '', tags: [] }, nameOf)
    expect(chips[0].id).toBe(ALL)
    expect(chips[0].closed).toBe(false)
  })
})
