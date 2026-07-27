import {
  summarizeRound,
  summarizeSession,
  estimateAfterDiscount,
} from '../posBilling'

// A round as buildTableRounds() produces it.
const round = (n, orderId, items, orderExtra = {}) => ({
  round: n,
  orderId,
  orderNo: `ORD-${n}`,
  time: null,
  items,
  order: { Id: orderId, ...orderExtra },
})

const dosa = {
  name: 'Masala Dosa', qty: 1, taxPct: 18, isTaxIncluded: false,
  netAmount: 100, taxAmount: 18, grossAmount: 118,
  taxComponents: [
    { name: 'CGST', rate: 9, amount: 9 },
    { name: 'SGST', rate: 9, amount: 9 },
  ],
}
const water = {
  name: 'Water', qty: 2, taxPct: 0, isTaxIncluded: false,
  netAmount: 40, taxAmount: 0, grossAmount: 40, taxComponents: [],
}

describe('summarizeRound', () => {
  it('totals a round from its priced item snapshots', () => {
    const s = summarizeRound(round(1, 'o1', [dosa, water]))
    expect(s.subTotal).toBe(140)
    expect(s.tax).toBe(18)
    expect(s.total).toBe(158)
    // CGST + SGST merged for the round.
    expect(s.components).toEqual([
      { name: 'CGST', rate: 9, amount: 9 },
      { name: 'SGST', rate: 9, amount: 9 },
    ])
  })

  it('falls back to order-level totals when items carry no amounts', () => {
    const s = summarizeRound(round(1, 'o1', [], { SubTotal: 50, TaxAmount: 9, Total: 59 }))
    expect(s.subTotal).toBe(50)
    expect(s.tax).toBe(9)
    expect(s.total).toBe(59)
  })
})

describe('summarizeSession', () => {
  const session = summarizeSession([
    round(1, 'o1', [dosa]),
    round(2, 'o2', [water]),
  ])

  it('adds every round into one grand total', () => {
    expect(session.subTotal).toBe(140)
    expect(session.tax).toBe(18)
    expect(session.total).toBe(158)
    expect(session.rounds).toHaveLength(2)
  })

  it('merges tax components across rounds for the footer', () => {
    expect(session.taxByComponent).toEqual([
      { name: 'CGST', rate: 9, amount: 9 },
      { name: 'SGST', rate: 9, amount: 9 },
    ])
  })

  it('gives an item-wise GST breakdown showing which product is taxed how much', () => {
    const byName = Object.fromEntries(session.items.map((i) => [i.name, i]))
    expect(byName['Masala Dosa']).toMatchObject({ rate: 18, tax: 18, gross: 118 })
    expect(byName['Water']).toMatchObject({ rate: 0, tax: 0, gross: 40 })
  })

  it('collapses the same dish at the same rate across rounds', () => {
    const s = summarizeSession([round(1, 'o1', [dosa]), round(2, 'o2', [dosa])])
    const dosaRow = s.items.find((i) => i.name === 'Masala Dosa')
    expect(dosaRow.qty).toBe(2)
    expect(s.items).toHaveLength(1)
  })
})

describe('estimateAfterDiscount', () => {
  const session = summarizeSession([round(1, 'o1', [dosa])]) // net 100, tax 18

  it('applies the discount before tax using the blended rate', () => {
    // net 100 − 20 = 80 taxable; 18% → 14.40 tax; 94.40 payable.
    const est = estimateAfterDiscount(session, 20)
    expect(est.taxable).toBeCloseTo(80)
    expect(est.tax).toBeCloseTo(14.4)
    expect(est.total).toBeCloseTo(94.4)
  })

  it('caps the discount at the subtotal', () => {
    const est = estimateAfterDiscount(session, 500)
    expect(est.discount).toBe(100)
    expect(est.total).toBe(0)
  })
})
