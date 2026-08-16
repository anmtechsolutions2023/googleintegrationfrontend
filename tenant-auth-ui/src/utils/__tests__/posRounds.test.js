import { buildTableRounds, buildRoundIndex } from '../posRounds'
import { statusLabel, isKotPending, normalizeStatus } from '../posStatus'

const order = (id, tableId, minute, extra = {}) => ({
  Id: id,
  TableId: tableId,
  OrderNo: `ORD-${id}`,
  Status: 'fired',
  CreatedOn: `2026-07-01 16:0${minute}:00`,
  Items: [],
  ...extra,
})

describe('buildRoundIndex — which round a kitchen ticket belongs to', () => {
  // pos_kot.OrderId was always returned and the orders were always loaded, but
  // nothing joined them, so every KDS tile showed an opaque ticket number with
  // no way to tell which pass of the table it was.
  test('numbers a table’s rounds by the order they were placed', () => {
    const index = buildRoundIndex([order('b', 't1', 6), order('a', 't1', 4)])

    expect(index.get('a').round).toBe(1)
    expect(index.get('a').orderNo).toBe('ORD-a')
    expect(index.get('b').round).toBe(2)
  })

  test('numbers each table independently', () => {
    const index = buildRoundIndex([
      order('a', 't1', 4), order('b', 't1', 6), order('c', 't2', 5),
    ])

    expect(index.get('b').round).toBe(2)
    // A different table's first round is Round 1, not Round 3.
    expect(index.get('c').round).toBe(1)
  })

  test('agrees with buildTableRounds, so a tile and the popup cannot differ', () => {
    const orders = [order('b', 't1', 6), order('a', 't1', 4)]
    const index = buildRoundIndex(orders)

    buildTableRounds(orders, 't1').forEach((r) => {
      expect(index.get(r.orderId).round).toBe(r.round)
    })
  })

  test('gives a takeaway order (no table) its own round', () => {
    const index = buildRoundIndex([order('a', null, 4), order('b', null, 6)])
    expect(index.get('a').round).toBe(1)
    expect(index.get('b').round).toBe(1)
  })

  test('survives a missing or non-array orders list', () => {
    expect(buildRoundIndex(undefined).size).toBe(0)
    expect(buildRoundIndex(null).size).toBe(0)
  })
})

describe('buildTableRounds — includeClosed', () => {
  const orders = [order('a', 't1', 4), order('b', 't1', 6, { Status: 'closed' })]

  test('hides closed rounds by default — Billing bills the live session', () => {
    expect(buildTableRounds(orders, 't1').map((r) => r.orderId)).toEqual(['a'])
  })

  // A table can be settled while a ticket is still at the pass. Filtering those
  // rounds out left the KDS popup reading "No active orders for this table"
  // beside a tile that was plainly still cooking.
  test('keeps them for the kitchen, which still has to cook them', () => {
    expect(buildTableRounds(orders, 't1', { includeClosed: true }).map((r) => r.orderId))
      .toEqual(['a', 'b'])
  })
})

describe('POS status vocabulary', () => {
  // The dashboard compared `k.Status !== 'Ready'` with strict !== against a
  // server that only ever writes 'ready', so every KOT ever fired counted as
  // pending — forever. Every read goes through normalizeStatus now.
  test('treats any casing as the same status', () => {
    expect(normalizeStatus('Ready')).toBe('ready')
    expect(normalizeStatus(' READY ')).toBe('ready')
  })

  test('a ready ticket is not pending, whatever its casing', () => {
    expect(isKotPending({ Status: 'ready' })).toBe(false)
    expect(isKotPending({ Status: 'Ready' })).toBe(false)
    expect(isKotPending({ Status: 'cancelled' })).toBe(false)
  })

  test('a pending or unset ticket is still owed', () => {
    expect(isKotPending({ Status: 'pending' })).toBe(true)
    expect(isKotPending({})).toBe(true)
  })

  test('renders stored lowercase values for humans', () => {
    expect(statusLabel('occupied')).toBe('Occupied')
    expect(statusLabel('partially_paid')).toBe('Partially Paid')
    expect(statusLabel(null)).toBe('—')
  })
})
