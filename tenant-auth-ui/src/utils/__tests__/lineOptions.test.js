import {
  lineOptions, lineAddons, lineNote, lineBreakdown, formatBreakdown,
  parsePresets, conflictsWith, splitNote, composeNote, togglePick, DEFAULT_NOTE_PRESETS,
} from '../lineOptions'
import narrowOptions from '../optionsReport'

// ORD-0001 as it really sold, in each of the three spellings a line arrives in.
const HALF = { id: 'v-half', name: 'Half portion', price: 170 }
const RAITA = { id: 'a-raita', name: 'Raita', price: 20, groupId: 'g-dip', groupName: 'Extra dip' }
const PANEER = { id: 'a-paneer', name: 'Paneer', price: 50, groupId: 'g-extra', groupName: 'Extra' }

const cartLine = {
  name: 'Veg Triple Fried Rice', price: 479, basePrice: 239, variantAmount: 170, addonAmount: 70,
  variants: [HALF], addons: [RAITA, PANEER], note: 'Less spicy',
}
const invoiceLine = {
  ItemName: 'Veg Triple Fried Rice', Comment: 'Veg Triple Fried Rice', UnitPrice: '479.0000',
  BasePrice: '239.0000', VariantAmount: '170.0000', AddonAmount: '70.0000',
  Variants: [HALF], Addons: [RAITA, PANEER], Note: 'Less spicy',
}

describe('reading a line', () => {
  test('options and add-ons, with the group each add-on came from', () => {
    expect(lineOptions(cartLine)).toEqual([{ id: 'v-half', name: 'Half portion', price: 170 }])
    expect(lineAddons(invoiceLine)).toEqual([
      { id: 'a-raita', name: 'Raita', price: 20, groupName: 'Extra dip' },
      { id: 'a-paneer', name: 'Paneer', price: 50, groupName: 'Extra' },
    ])
  })

  test('the note, from any spelling — but never the invoice line\'s Comment, which is the name', () => {
    expect(lineNote(cartLine)).toBe('Less spicy')
    expect(lineNote({ notes: ' Extra crispy ' })).toBe('Extra crispy')
    expect(lineNote({ Comment: 'Veg Triple Fried Rice' })).toBe('')
  })

  test('the rate explained: dish price, options and extras', () => {
    const expected = { base: 239, options: 170, extras: 70, unit: 479 }
    expect(lineBreakdown(cartLine)).toEqual(expected)
    expect(lineBreakdown(invoiceLine)).toEqual(expected)
    expect(formatBreakdown(expected)).toBe('₹239.00 + options ₹170.00 + extras ₹70.00')
  })

  test('a line without stored amounts is explained from its chips and price', () => {
    const b = lineBreakdown({ price: 479, variants: [HALF], addons: [RAITA, PANEER] })
    expect(b).toEqual({ base: 239, options: 170, extras: 70, unit: 479 })
    expect(formatBreakdown({ base: 239, options: 0, extras: 70 })).toBe('₹239.00 + extras ₹70.00')
  })

  test('a plain dish needs no explaining', () => {
    expect(lineBreakdown({ name: 'Mashroom Chilli', price: 149 })).toBeNull()
    expect(lineAddons({ addons: 'not json' })).toEqual([])
  })
})

describe('quick notes', () => {
  test('a branch list, the defaults when unreadable, and an empty list kept empty', () => {
    expect(parsePresets('["No onion"," Less oil ","no onion"]')).toEqual(['No onion', 'Less oil'])
    expect(parsePresets(undefined)).toEqual(DEFAULT_NOTE_PRESETS)
    expect(parsePresets('{broken')).toEqual(DEFAULT_NOTE_PRESETS)
    expect(parsePresets('[]')).toEqual([])
  })

  test('opposites are read from the words, so a branch\'s own pairs work too', () => {
    expect(conflictsWith('Less spicy', 'Extra spicy')).toBe(true)
    expect(conflictsWith('No onion', 'Extra onion')).toBe(true)
    expect(conflictsWith('Less spicy', 'Less salt')).toBe(false)
    expect(conflictsWith('Jain', 'No onion')).toBe(false)
  })

  test('picking one drops its opposite', () => {
    expect(togglePick(['Less spicy', 'No onion'], 'Extra spicy')).toEqual(['No onion', 'Extra spicy'])
    expect(togglePick(['Less spicy'], 'Less spicy')).toEqual([])
  })

  test('a saved note splits back into picks and typed text, and composes in the branch\'s order', () => {
    const presets = ['Less spicy', 'Less oil', 'No onion']
    expect(splitNote('No onion, gravy on the side, less spicy', presets))
      .toEqual({ picks: ['No onion', 'Less spicy'], text: 'gravy on the side' })
    expect(composeNote(['No onion', 'Less spicy'], ' gravy on the side ', presets))
      .toBe('Less spicy, No onion, gravy on the side')
    expect(composeNote([], '   ', presets)).toBe('')
  })
})

describe('narrowing the options report', () => {
  const products = {
    rice: {
      ItemId: 'rice', ItemName: 'Veg Triple Fried Rice', CategoryName: 'Fried Rice', Plates: 26,
      GrossAmount: 11524, OptionsAmount: 4630, AddonsAmount: 680, PlatesWithoutOption: 3,
      OfferedVariantIds: ['v-half', 'v-full'], OfferedGroupIds: ['g-dip'],
      variants: [{ VariantId: 'v-half', Name: 'Half portion', Price: 170, Plates: 14, Revenue: 2380 }],
      addonGroups: [{
        GroupId: 'g-dip', GroupName: 'Extra dip', MaxSelection: 1, Plates: 11, Revenue: 220,
        addons: [{ AddonId: 'a-raita', Name: 'Raita', Price: 20, Plates: 11, Revenue: 220 }],
      }],
    },
    roll: {
      ItemId: 'roll', ItemName: 'Chicken Spring Roll', CategoryName: 'Rolls', Plates: 12,
      GrossAmount: 2488, OptionsAmount: 0, AddonsAmount: 100, PlatesWithoutOption: null,
      OfferedVariantIds: [], OfferedGroupIds: ['g-dip'],
      variants: [],
      addonGroups: [{
        GroupId: 'g-dip', GroupName: 'Extra dip', MaxSelection: 1, Plates: 5, Revenue: 100,
        addons: [{ AddonId: 'a-raita', Name: 'Raita', Price: 20, Plates: 5, Revenue: 100 }],
      }],
    },
  }

  test('the whole menu matches the server\'s rule', () => {
    const view = narrowOptions(products)
    expect(view.addonGroups[0]).toMatchObject({ Plates: 16, OfferedPlates: 38, TakeRate: 42.1, Revenue: 320 })
    expect(view.variants[0]).toMatchObject({ Plates: 14, OfferedPlates: 26, TakeRate: 53.8 })
    expect(view.platesWithoutOption).toBe(3)
  })

  test('one category recomputes rates over just its dishes', () => {
    const view = narrowOptions(products, { category: 'Rolls' })
    expect(view.variants).toEqual([])
    expect(view.addonGroups[0]).toMatchObject({ Plates: 5, OfferedPlates: 12, TakeRate: 41.7 })
    expect(view.totals).toMatchObject({ AddonsAmount: 100, GrossAmount: 2488, ShareOfRevenue: 4 })
  })

  test('one dish', () => {
    const view = narrowOptions(products, { dish: 'rice' })
    expect(view.dishes).toHaveLength(1)
    expect(view.addonGroups[0].Addons[0]).toMatchObject({ Name: 'Raita', Plates: 11, TakeRate: 42.3 })
  })
})
