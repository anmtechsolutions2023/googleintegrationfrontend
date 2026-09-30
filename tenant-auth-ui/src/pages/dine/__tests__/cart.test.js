// The guest's cart rules — pure functions, so the screen and these tests agree.

import {
  addToCart, changeQuantity, cartCount, cartEstimate, countOf, needsOptions, optionErrors, unitPriceOf,
} from '../cart'

const tikka = {
  id: 'pt',
  name: 'Paneer Tikka',
  price: 180,
  variants: [{ id: 'full', name: 'Full', price: 100 }],
  addonGroups: [{
    id: 'g1', name: 'Extras', min: 0, max: 2,
    options: [{ id: 'mint', name: 'Mint', price: 20 }, { id: 'onion', name: 'Onion', price: 30 }, { id: 'cheese', name: 'Cheese', price: 60 }],
  }],
}
const naan = { id: 'naan', name: 'Butter Naan', price: 60, variants: [], addonGroups: [] }

describe('dine cart', () => {
  it('prices a dish with its options', () => {
    expect(unitPriceOf(tikka, ['full'], ['mint'])).toBe(300)
  })

  it('merges the same dish with the same options into one line', () => {
    let cart = addToCart([], naan)
    cart = addToCart(cart, naan)
    expect(cart).toHaveLength(1)
    expect(cart[0].quantity).toBe(2)
  })

  it('keeps different options, or a different note, on separate lines', () => {
    let cart = addToCart([], tikka, { variantIds: ['full'] })
    cart = addToCart(cart, tikka, { variantIds: ['full'], note: 'less spicy' })
    cart = addToCart(cart, tikka, { variantIds: ['full'], addonIds: ['mint'] })
    expect(cart).toHaveLength(3)
    expect(countOf(cart, 'pt')).toBe(3)
  })

  it('removes a line when its quantity reaches zero', () => {
    const cart = addToCart([], naan)
    expect(changeQuantity(cart, cart[0].key, -1)).toEqual([])
  })

  it('totals count and estimate', () => {
    let cart = addToCart([], naan, { quantity: 2 })
    cart = addToCart(cart, tikka, { variantIds: ['full'] })
    expect(cartCount(cart)).toBe(3)
    expect(cartEstimate(cart)).toBe(120 + 280)
  })

  it('knows which dishes need the options sheet', () => {
    expect(needsOptions(tikka)).toBe(true)
    expect(needsOptions(naan)).toBe(false)
  })

  it('checks add-on groups against min and max, as the server does', () => {
    const required = { ...tikka, addonGroups: [{ ...tikka.addonGroups[0], min: 1 }] }
    expect(optionErrors(required, [])).toEqual({ g1: 'Choose at least 1.' })
    expect(optionErrors(tikka, ['mint', 'onion', 'cheese'])).toEqual({ g1: 'Choose at most 2.' })
    expect(optionErrors(tikka, ['mint'])).toEqual({})
  })
})
