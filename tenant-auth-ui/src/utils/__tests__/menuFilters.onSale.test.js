import {
  isOnSale, isAvailable, openLabel, categoryChips, filterMenu, activeChips,
} from '../menuFilters'

const nameOf = (m) => m.ItemName

describe('on sale', () => {
  test('only an explicit off counts as off — an older payload with no Active is on', () => {
    expect(isOnSale({})).toBe(true)
    expect(isOnSale({ Active: 1 })).toBe(true)
    expect(isOnSale({ Active: true })).toBe(true)
    expect(isOnSale({ Active: 0 })).toBe(false)
    expect(isOnSale({ Active: false })).toBe(false)
    expect(isOnSale({ Active: '0' })).toBe(false)
  })

  test('off beats an open section', () => {
    expect(isAvailable({ Active: 0, CategoryAvailableNow: true })).toBe(false)
    expect(isAvailable({ Active: 1, CategoryAvailableNow: true })).toBe(true)
  })

  test('an off dish never shows an opening time', () => {
    expect(openLabel({ Active: 0, CategoryAvailableNow: false, CategoryOpensAt: '18:00:00' })).toBe('Not on sale')
    expect(openLabel({ Active: 0, CategoryAvailableNow: true })).toBe('Not on sale')
    expect(openLabel({ Active: 1, CategoryAvailableNow: false, CategoryOpensAt: '18:00:00' })).toBe('Opens 18:00')
  })
})

describe('the category rail', () => {
  test('one dish turned off does not mark its whole section closed', () => {
    const menu = [
      { ItemName: 'Chilly Garlic Paneer', CategoryId: 'vs', CategoryName: 'Veg Starter', Active: 0, CategoryAvailableNow: true },
      { ItemName: 'Gobi Manchurian', CategoryId: 'vs', CategoryName: 'Veg Starter', Active: 1, CategoryAvailableNow: true },
      { ItemName: 'Munchow Soup', CategoryId: 'soup', CategoryName: 'Soup', Active: 1, CategoryAvailableNow: false, CategoryOpensAt: '18:00:00' },
    ]
    const chips = categoryChips(menu, {}, nameOf)
    expect(chips.find((c) => c.id === 'vs').closed).toBe(false)
    expect(chips.find((c) => c.id === 'soup').closed).toBe(true)
  })
})

describe('the On sale filter', () => {
  const menu = [
    { ItemName: 'Chicken 65', Active: 1 },
    { ItemName: 'Lemon Chicken', Active: 0 },
    { ItemName: 'Gobi Manchurian' },
  ]

  test('narrows to on or off', () => {
    expect(filterMenu(menu, { active: 'off' }, nameOf).map(nameOf)).toEqual(['Lemon Chicken'])
    expect(filterMenu(menu, { active: 'on' }, nameOf).map(nameOf)).toEqual(['Chicken 65', 'Gobi Manchurian'])
  })

  test('counts each choice under the other filters', () => {
    expect(activeChips(menu, { query: 'chicken' }, nameOf).map((c) => [c.name, c.count]))
      .toEqual([['All', 2], ['On', 1], ['Off', 1]])
  })
})
