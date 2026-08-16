// Pricing summaries for a table's dine-in session, derived from the priced
// snapshot each order stores when a round is placed (netAmount / taxAmount /
// grossAmount / taxComponents per line). No tax is recomputed here — these are
// display aggregates over what the server already priced. When an older order
// carries no per-line amounts we fall back to its order-level SubTotal/TaxAmount
// /Total, so legacy rounds still total correctly.

import { parseOrderItems } from './posRounds'

const num = (v) => Number(v) || 0

// Fold a line's tax components (CGST/SGST/…) into an accumulator keyed by name,
// so the session footer shows one row per component instead of one per line.
const mergeComponents = (map, comps) => {
  ;(comps || []).forEach((c) => {
    const key = c.name || c.id || 'Tax'
    const entry = map.get(key) || { name: c.name || key, rate: num(c.rate), amount: 0 }
    entry.amount += num(c.amount)
    if (num(c.rate)) entry.rate = num(c.rate)
    map.set(key, entry)
  })
}

// One priced line from an order's stored item snapshot. Prefers the recorded
// net/tax/gross; derives sensible values when only a unit price is present.
const lineSummary = (it) => {
  const qty = num(it.qty ?? it.Qty ?? it.quantity ?? it.Quantity ?? 1) || 1
  const gross =
    it.grossAmount != null ? num(it.grossAmount) : num(it.price ?? it.Price) * qty
  const tax = it.taxAmount != null ? num(it.taxAmount) : 0
  const net = it.netAmount != null ? num(it.netAmount) : gross - tax
  const rate = num(it.taxPct ?? it.effectiveRate ?? 0)
  return {
    name: it.name || it.Name || it.ItemName || 'Item',
    qty,
    net,
    tax,
    gross,
    rate,
    isTaxIncluded: !!(it.isTaxIncluded ?? it.IsTaxIncluded),
    components: it.taxComponents || it.components || [],
  }
}

// Summarize a single round (order). `round` is a buildTableRounds() entry.
export const summarizeRound = (round) => {
  const order = round.order || round
  const items = round.items || parseOrderItems(order.Items)
  const lines = items.map(lineSummary)
  const hasItemAmounts = lines.some((l) => l.gross > 0 || l.tax > 0)

  let subTotal
  let tax
  let total
  let components
  if (hasItemAmounts) {
    subTotal = lines.reduce((s, l) => s + l.net, 0)
    tax = lines.reduce((s, l) => s + l.tax, 0)
    total = lines.reduce((s, l) => s + l.gross, 0)
    const m = new Map()
    lines.forEach((l) => mergeComponents(m, l.components))
    components = [...m.values()]
  } else {
    // Legacy or amount-less items → trust the order's own recorded totals.
    subTotal = num(order.SubTotal)
    tax = num(order.TaxAmount)
    total = num(order.Total) || subTotal + tax
    components = []
  }

  return {
    round: round.round,
    orderId: round.orderId,
    orderNo: round.orderNo,
    time: round.time,
    subTotal,
    tax,
    total,
    components,
    lines,
  }
}

// Aggregate every round into a whole-session bill, plus an item-wise GST
// breakdown (same dish at the same rate collapses into one row) so a mixed-tax
// order shows exactly how much GST each product contributes.
export const summarizeSession = (rounds) => {
  const roundSummaries = (rounds || []).map(summarizeRound)
  const subTotal = roundSummaries.reduce((s, r) => s + r.subTotal, 0)
  const tax = roundSummaries.reduce((s, r) => s + r.tax, 0)
  const total = roundSummaries.reduce((s, r) => s + r.total, 0)

  const compMap = new Map()
  roundSummaries.forEach((r) => mergeComponents(compMap, r.components))

  const itemMap = new Map()
  roundSummaries.forEach((r) =>
    r.lines.forEach((l) => {
      const key = `${l.name}|${l.rate}|${l.isTaxIncluded}`
      // `rate` and `components` are copied from the first line of the group, not
      // accumulated — the group key already pins the rate, so every line in it
      // carries the same one. Components ride along so the bill can show what a
      // rate is MADE OF (18% = CGST 9 + SGST 9), which is the difference between
      // a surprising number and a visible tax-group setup.
      const e =
        itemMap.get(key) ||
        {
          name: l.name, rate: l.rate, isTaxIncluded: l.isTaxIncluded,
          components: (l.components || []).map((c) => ({ name: c.name, rate: num(c.rate) })),
          qty: 0, net: 0, tax: 0, gross: 0,
        }
      e.qty += l.qty
      e.net += l.net
      e.tax += l.tax
      e.gross += l.gross
      itemMap.set(key, e)
    }),
  )

  return {
    rounds: roundSummaries,
    subTotal,
    tax,
    total,
    taxByComponent: [...compMap.values()],
    items: [...itemMap.values()],
  }
}

// Estimate the payable after a document discount applied BEFORE tax, using the
// session's blended tax rate. Only a fallback for when lines cannot be re-quoted
// against the server (e.g. items without a cost link); the authoritative figure
// still comes from POST /bills at settle time.
export const estimateAfterDiscount = (session, discount) => {
  const d = Math.max(0, Math.min(num(discount), session.subTotal))
  const blendedRate = session.subTotal > 0 ? session.tax / session.subTotal : 0
  const taxable = session.subTotal - d
  const tax = taxable * blendedRate
  return { discount: d, taxable, tax, total: taxable + tax }
}

// What the customer is actually asked for, and the adjustment that got there.
//
// MUST match applyRoundOff in the backend's modules/ledger/ledger.service.js —
// nearest rupee, computed in paise. The ledger rounds the payable because a till
// cannot hand over paise, and it books the difference as RoundOff. While the
// settle screen quoted the UNROUNDED gross, "Exact" tendered ₹638.88 against a
// ₹639.00 invoice and the sale posted PARTIALLY_PAID, 12 paise short, with no
// way for the cashier to see or collect the difference.
export const roundPayable = (gross) => {
  const grossPaise = Math.round(num(gross) * 100)
  const payablePaise = Math.round(grossPaise / 100) * 100
  return {
    payable: payablePaise / 100,
    roundOff: (payablePaise - grossPaise) / 100,
  }
}

export const billMoney = (n) => num(n).toFixed(2)
