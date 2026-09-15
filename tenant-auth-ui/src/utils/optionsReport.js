// src/utils/optionsReport.js
//
// The Options & Add-ons tab narrowed to a category or a dish.
//
// The server answers for the whole menu. Narrowing is done here, from the
// per-dish breakdown the same response carries, so changing a filter is
// instant and costs no request. Take rates use the server's rule exactly:
// plates that took a choice ÷ plates of the dishes that offer it — mapped on
// the menu today, or sold with it in the period.

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const keyOf = (id, name) => id || `name:${String(name || '').toLowerCase()}`
const byRevenue = (a, b) => (b.Revenue - a.Revenue) || (b.Plates - a.Plates)

/**
 * @param {Object} products - The report's `products` map (ItemId → detail).
 * @param {{category?: string, dish?: string}} [filter]
 * @returns {{dishes: Array, totals: Object, variants: Array, addonGroups: Array, platesWithoutOption: number}}
 */
export const narrowOptions = (products, { category = '', dish = '' } = {}) => {
  const dishes = Object.values(products || {}).filter((p) => (
    (!category || (p.CategoryName || '') === category) && (!dish || p.ItemId === dish)
  ))

  const variants = new Map()
  const groups = new Map()
  let platesWithoutOption = 0

  dishes.forEach((d) => {
    if (d.PlatesWithoutOption != null) platesWithoutOption += Number(d.PlatesWithoutOption) || 0
    ;(d.variants || []).forEach((v) => {
      const agg = variants.get(keyOf(v.VariantId, v.Name)) || {
        VariantId: v.VariantId, Name: v.Name, Price: v.Price, Plates: 0, Revenue: 0, soldOn: new Map(),
      }
      agg.Plates += v.Plates
      agg.Revenue += v.Revenue
      agg.soldOn.set(d.ItemId, (agg.soldOn.get(d.ItemId) || 0) + v.Plates)
      variants.set(keyOf(v.VariantId, v.Name), agg)
    })
    ;(d.addonGroups || []).forEach((g) => {
      const gKey = keyOf(g.GroupId, g.GroupName)
      const agg = groups.get(gKey) || {
        GroupId: g.GroupId, GroupName: g.GroupName, MaxSelection: g.MaxSelection,
        Plates: 0, Revenue: 0, soldOn: new Map(), addons: new Map(),
      }
      agg.Plates += g.Plates
      agg.Revenue += g.Revenue
      agg.soldOn.set(d.ItemId, (agg.soldOn.get(d.ItemId) || 0) + g.Plates)
      ;(g.addons || []).forEach((a) => {
        const aKey = keyOf(a.AddonId, a.Name)
        const addon = agg.addons.get(aKey) || {
          AddonId: a.AddonId, Name: a.Name, Price: a.Price, Plates: 0, Revenue: 0, soldOn: new Map(),
        }
        addon.Plates += a.Plates
        addon.Revenue += a.Revenue
        addon.soldOn.set(d.ItemId, (addon.soldOn.get(d.ItemId) || 0) + a.Plates)
        agg.addons.set(aKey, addon)
      })
      groups.set(gKey, agg)
    })
  })

  const offeredPlates = (id, soldOn, field) => dishes.reduce((sum, d) => (
    soldOn.has(d.ItemId) || (id && (d[field] || []).includes(id)) ? sum + (Number(d.Plates) || 0) : sum
  ), 0)
  const nameOf = (itemId) => dishes.find((d) => d.ItemId === itemId)?.ItemName || itemId
  const dishList = (soldOn) => [...soldOn.entries()]
    .map(([ItemId, Plates]) => ({ ItemId, ItemName: nameOf(ItemId), Plates }))
    .sort((a, b) => b.Plates - a.Plates)

  const variantList = [...variants.values()].map((v) => {
    const offered = offeredPlates(v.VariantId, v.soldOn, 'OfferedVariantIds')
    return {
      VariantId: v.VariantId, Name: v.Name, Price: v.Price, Plates: v.Plates,
      OfferedPlates: offered, TakeRate: pct(v.Plates, offered), Revenue: round2(v.Revenue),
      Dishes: dishList(v.soldOn),
    }
  }).sort(byRevenue)

  const groupList = [...groups.values()].map((g) => {
    const offered = offeredPlates(g.GroupId, g.soldOn, 'OfferedGroupIds')
    return {
      GroupId: g.GroupId, GroupName: g.GroupName, MaxSelection: g.MaxSelection,
      Plates: g.Plates, OfferedPlates: offered, TakeRate: pct(g.Plates, offered),
      Revenue: round2(g.Revenue),
      Addons: [...g.addons.values()].map((a) => ({
        AddonId: a.AddonId, Name: a.Name, Price: a.Price, Plates: a.Plates,
        TakeRate: pct(a.Plates, offered), Revenue: round2(a.Revenue), Dishes: dishList(a.soldOn),
      })).sort(byRevenue),
    }
  }).sort(byRevenue)

  const sum = (key) => round2(dishes.reduce((s, d) => s + (Number(d[key]) || 0), 0))
  const optionsAmount = sum('OptionsAmount')
  const addonsAmount = sum('AddonsAmount')
  const grossAmount = sum('GrossAmount')

  return {
    dishes,
    totals: {
      OptionsAmount: optionsAmount,
      AddonsAmount: addonsAmount,
      GrossAmount: grossAmount,
      ShareOfRevenue: pct(optionsAmount + addonsAmount, grossAmount),
    },
    variants: variantList,
    addonGroups: groupList,
    platesWithoutOption,
  }
}

export default narrowOptions
