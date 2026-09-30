// src/pages/dine/cart.js
// The guest's cart, as plain functions over an array — no React, so the rules
// are testable on their own.
//
// Prices here are an ESTIMATE for the screen. The server re-prices every line
// when the order is placed (and on /orders/quote), and the estimate is never
// sent: only ids, quantities, option ids and notes leave the phone.

/** Same dish with the same options and note = the same line. */
export const lineKey = ({ id, variantIds = [], addonIds = [], note = '' }) =>
  [id, [...variantIds].sort().join('.'), [...addonIds].sort().join('.'), note.trim()].join('|')

/** Unit price shown for a dish with its chosen options. */
export const unitPriceOf = (item, variantIds = [], addonIds = []) => {
  const variants = (item.variants || []).filter((v) => variantIds.includes(v.id))
  const addons = (item.addonGroups || [])
    .flatMap((g) => g.options)
    .filter((o) => addonIds.includes(o.id))
  return Number(item.price || 0)
    + variants.reduce((s, v) => s + Number(v.price || 0), 0)
    + addons.reduce((s, a) => s + Number(a.price || 0), 0)
}

/** Whether a dish must open the options sheet before it can be added. */
export const needsOptions = (item) =>
  (item.variants || []).length > 0 || (item.addonGroups || []).length > 0

/**
 * Adds a dish (with options) to the cart, merging into an identical line.
 * @returns {Array} A new cart.
 */
export const addToCart = (cart, item, { quantity = 1, variantIds = [], addonIds = [], note = '' } = {}) => {
  const line = {
    id: item.id,
    name: item.name,
    isVeg: item.isVeg,
    quantity,
    variantIds,
    addonIds,
    note: note.trim(),
    variantNames: (item.variants || []).filter((v) => variantIds.includes(v.id)).map((v) => v.name),
    addonNames: (item.addonGroups || []).flatMap((g) => g.options)
      .filter((o) => addonIds.includes(o.id)).map((o) => o.name),
    unitPrice: unitPriceOf(item, variantIds, addonIds),
  }
  line.key = lineKey(line)
  const existing = cart.find((l) => l.key === line.key)
  if (!existing) return [...cart, line]
  return cart.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + quantity } : l))
}

/** Changes a line's quantity; zero removes it. */
export const changeQuantity = (cart, key, delta, max = 50) =>
  cart
    .map((l) => (l.key === key ? { ...l, quantity: Math.min(max, l.quantity + delta) } : l))
    .filter((l) => l.quantity > 0)

/** How many of one dish are in the cart, across all its option lines. */
export const countOf = (cart, itemId) =>
  cart.filter((l) => l.id === itemId).reduce((s, l) => s + l.quantity, 0)

export const cartCount = (cart) => cart.reduce((s, l) => s + l.quantity, 0)

export const cartEstimate = (cart) => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0)

/**
 * Checks an add-on selection against each group's min/max, the same rule the
 * server enforces. Returns one message per broken group, keyed by group id.
 */
export const optionErrors = (item, addonIds = []) => {
  const errors = {}
  ;(item.addonGroups || []).forEach((g) => {
    const picked = g.options.filter((o) => addonIds.includes(o.id)).length
    if (picked < g.min) errors[g.id] = `Choose at least ${g.min}.`
    else if (g.max > 0 && picked > g.max) errors[g.id] = `Choose at most ${g.max}.`
  })
  return errors
}

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
