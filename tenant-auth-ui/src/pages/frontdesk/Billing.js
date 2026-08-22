import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { APP_CONFIG } from '../../constants'
import RoundsTimeline from '../../components/frontdesk/RoundsTimeline'
import BillSummary from '../../components/frontdesk/BillSummary'
import TransferSheet from '../../components/frontdesk/TransferSheet'
import { tableStatusMeta } from '../../components/frontdesk/TableSelect'
import FloorPlanPicker from '../../components/frontdesk/FloorPlanPicker'
import CustomerPicker from '../../components/frontdesk/CustomerPicker'
import {
  buildTableRounds, buildRoundIndex, formatRoundTime, itemLabel,
} from '../../utils/posRounds'
import { summarizeSession, estimateAfterDiscount, roundPayable } from '../../utils/posBilling'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

// Normalize item-meta price. Prefer the linked CostInfo amount (new normalized
// model); fall back to the legacy Prices JSON for older records.
const itemPrice = (meta) => {
  if (!meta) return 0
  if (meta.CostInfoAmount !== undefined && meta.CostInfoAmount !== null) return Number(meta.CostInfoAmount) || 0
  const prices = meta.Prices
  if (Array.isArray(prices) && prices.length > 0) return Number(prices[0].price || prices[0].Price || 0)
  if (typeof prices === 'object' && prices !== null) return Number(prices.price || prices.Price || 0)
  return 0
}

// Falls back to a placeholder rather than the raw ItemDetailId: a uuid on a cart
// line, a printed bill and a kitchen ticket is worse than an honest "Unnamed
// item", and it used to travel all the way to the cook.
const itemName = (meta, detail) => {
  if (detail) return detail.Name || detail.name || 'Unnamed item'
  return 'Unnamed item'
}

// Effective tax rate for a menu row, straight off the server-resolved chain
// (costinfo → taxgroup → mapper → TaxTypes). Display only — the authoritative
// amounts come from POST /api/pricing/quote, which owns the rounding rules.
//
// Replaces a local taxPct() that read the legacy Prices JSON. That column is no
// longer written by the Menu Items form, so it always returned 0 and every POS
// bill was raised with zero tax.
const itemTaxRate = (meta) => Number(meta?.TaxBreakdown?.effectiveRate) || 0

const money = (n) => (Number(n) || 0).toFixed(2)


const Billing = () => {
  const [tables, setTables]     = useState([])
  const [floors, setFloors]     = useState([])
  const [menu, setMenu]         = useState([])
  const [variants, setVariants] = useState([])
  const [itemDetails, setItemDetails] = useState({})

  // Variant picker — opened when a menu item offers options. Opting in is
  // optional; skipping adds the plain item.
  const [variantPick, setVariantPick] = useState(null) // { meta, selected: [] }
  const [loading, setLoading]   = useState(true)

  // active order state
  const [selectedTable, setSelectedTable] = useState('')
  // Counter service: takeaway ordered at the till, with no table. The customer
  // pays first and leaves with a token, so the session is a single order rather
  // than a table someone keeps adding rounds to.
  const [counterMode, setCounterMode] = useState(false)
  const [counterOrderId, setCounterOrderId] = useState(null)
  const [counterBusy, setCounterBusy] = useState(false)
  // Who this order is for. pos_order.CustomerId and the whole settle → ledger
  // contact chain have always existed; nothing ever set them, so every sale was
  // a walk-in and the CRM counters stayed at zero. Optional: leaving it empty
  // is a walk-in and behaves exactly as before.
  const [customer, setCustomer] = useState(null)
  const [cartItems, setCartItems] = useState([])
  const [menuSearch, setMenuSearch] = useState('')
  const [activeOrders, setActiveOrders] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  // True while the selected table's live rounds are being fetched.
  const [sessionLoading, setSessionLoading] = useState(false)

  // settle bill modal
  const [settleOpen, setSettleOpen] = useState(false)
  const [settleDiscount, setSettleDiscount] = useState(0)
  // How the discount value is interpreted: a flat ₹ amount or a % of the subtotal.
  const [settleDiscountType, setSettleDiscountType] = useState('amount')
  // Whether the cashier is discounting the bill as a whole or individual dishes.
  // Both can apply at once — the toggle only decides which controls are shown.
  const [discountMode, setDiscountMode] = useState('bill')
  // Per-item discount DRAFTS, keyed "<orderId>#<lineIndex>" → { type, value },
  // where value is the raw input string and may be empty.
  //
  // Empty drafts are kept rather than dropped: ₹/% is chosen BEFORE the number
  // is typed, and deleting the entry the moment the value was blank reset the
  // choice straight back to ₹ — the toggle looked dead. `activeLineDiscounts`
  // is what leaves this component, so a blank draft still prices nothing.
  const [lineDiscounts, setLineDiscounts] = useState({})
  // Tender rows. Each becomes one paymentbreakup in the ledger, so the UI
  // mirrors the data model exactly — no translation layer to get wrong.
  const [paymentModes, setPaymentModes] = useState([])
  const [tenders, setTenders] = useState([])
  const [settledInvoice, setSettledInvoice] = useState(null)
  const [settling, setSettling] = useState(false)
  // Live discounted preview from the server (discount applied BEFORE tax), so the
  // payable the cashier sees matches the bill that will be raised.
  const [settleQuote, setSettleQuote] = useState(null)

  // table transfer
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferBusy, setTransferBusy] = useState(false)

  // delete a whole round (order) — allowed while the kitchen hasn't started it
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletingRound, setDeletingRound] = useState(false)
  const [kots, setKots] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Every list needs MAX_LIMIT explicitly: the API's default page size is 10,
      // so omitting it silently capped the menu at 10 dishes and the floor plan
      // at 10 tables — the item you wanted simply was not on the grid.
      const [t, f, m, orders, v, k, modes] = await Promise.all([
        posService.getTables({ limit: MAX_LIMIT }),
        posService.getFloors({ limit: MAX_LIMIT }),
        posService.getItemMeta({ limit: MAX_LIMIT }),
        posService.getOrders({ limit: MAX_LIMIT }),
        posService.getVariants(),
        posService.getKots({ limit: MAX_LIMIT }),
        posService.getPaymentModes(),
      ])
      setTables(t)
      setFloors(f)
      setMenu(m)
      setVariants(v || [])
      setPaymentModes(modes || [])
      setKots(Array.isArray(k) ? k : [])
      const open = orders.filter((o) => (o.Status || '').toLowerCase() !== 'closed')
      setActiveOrders(open)

      // Fetch item details for all ItemDetailIds (to show names). A miss here is
      // not cosmetic: the name resolved from these is what goes onto the order
      // line, into the KOT snapshot and onto the kitchen display. Silently
      // swallowing the failure printed a raw uuid to the cook, so the count of
      // unresolved names is surfaced instead.
      const ids = [...new Set(m.map((x) => x.ItemDetailId).filter(Boolean))]
      if (ids.length > 0) {
        const details = {}
        let unresolved = 0
        await Promise.allSettled(ids.map(async (id) => {
          try {
            const d = await posService.getItemDetail(id)
            if (d) details[id] = d
            else unresolved += 1
          } catch { unresolved += 1 }
        }))
        setItemDetails(details)
        if (unresolved > 0) {
          toast.warn(`${unresolved} menu item name(s) could not be loaded`)
        }
      }
    } catch {
      toast.error('Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filteredMenu = menu.filter((m) => {
    if (!menuSearch) return true
    const name = itemName(m, itemDetails[m.ItemDetailId]).toLowerCase()
    return name.includes(menuSearch.toLowerCase())
  })

  // Variants offered by a menu row, resolved against the master for name+price.
  const variantsFor = (meta) => {
    const ids = Array.isArray(meta?.VariantIds) ? meta.VariantIds : []
    if (ids.length === 0) return []
    return ids
      .map((id) => variants.find((v) => (v.id || v.Id) === id))
      .filter(Boolean)
  }

  // The menu is inert until a table is chosen. Enforced here as well as in the
  // markup: the visual lock is the explanation, this is the rule. Without it a
  // stray keyboard activation could still build a cart with nowhere to send it.
  const menuLocked = !selectedTable && !counterMode

  // The selected table, for the header bar. Falls back to a neutral chip if the
  // table has since been retired from the floor plan mid-session.
  const selectedTableRow = tables.find((t) => (t.id || t.Id) === selectedTable) || null
  const selectedTableMeta = tableStatusMeta(selectedTableRow)
  const selectedTableName = selectedTableRow
    ? (selectedTableRow.Name || selectedTableRow.name)
    : 'Table'

  // Clicking a menu card adds it straight away unless it offers options, in
  // which case the picker opens first. Opting in is optional — Skip adds the
  // plain item.
  const handleMenuClick = (meta) => {
    if (menuLocked) { toast.warn('Pick a table or the counter before adding items'); return }
    const available = variantsFor(meta)
    if (available.length === 0) { addToCart(meta, []); return }
    setVariantPick({ meta, selected: [] })
  }

  const addToCart = (meta, selectedVariants = []) => {
    const metaId = meta.id || meta.Id
    // The same dish with different options is a different line, so the cart key
    // is the item PLUS its (order-independent) variant selection.
    const variantIds = selectedVariants.map((v) => v.id || v.Id).sort()
    const lineKey = [metaId, ...variantIds].join('|')

    setCartItems((prev) => {
      const existing = prev.find((c) => c.lineKey === lineKey)
      if (existing) {
        return prev.map((c) => c.lineKey === lineKey ? { ...c, qty: c.qty + 1 } : c)
      }
      const addOn = selectedVariants.reduce((s, v) => s + (Number(v.Price ?? v.price) || 0), 0)
      return [...prev, {
        lineKey,
        id: metaId,
        name: itemName(meta, itemDetails[meta.ItemDetailId]),
        // Display only — the server recomputes from the variant master.
        price: itemPrice(meta) + addOn,
        basePrice: itemPrice(meta),
        variantAmount: addOn,
        variants: selectedVariants.map((v) => ({
          id: v.id || v.Id,
          name: v.Name || v.name,
          price: Number(v.Price ?? v.price) || 0,
        })),
        variantIds,
        taxPct: itemTaxRate(meta),
        isTaxIncluded: !!meta?.TaxBreakdown?.isTaxIncluded,
        costInfoId: meta.CostInfoId || null,
        qty: 1,
        meta,
      }]
    })
  }

  const changeQty = (lineKey, delta) => {
    setCartItems((prev) => {
      const updated = prev.map((c) =>
        c.lineKey === lineKey ? { ...c, qty: Math.max(0, c.qty + delta) } : c)
      return updated.filter((c) => c.qty > 0)
    })
  }

  // ── Cart totals come from the server ──────────────────────────────────────
  // Tax is NOT summed locally. Inclusive-vs-exclusive pricing, per-line
  // rounding and the CGST/SGST split all live in one place on the backend; a
  // second implementation here would drift by a paisa and disagree with the bill.
  const [quote, setQuote] = useState(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteFailed, setQuoteFailed] = useState(false)

  const subTotal = cartItems.reduce((s, c) => s + c.price * c.qty, 0)

  useEffect(() => {
    const lines = cartItems
      .filter((c) => c.costInfoId)
      .map((c) => ({
        costInfoId: c.costInfoId,
        quantity: c.qty,
        // The server prices variants from the master; we only name them.
        variantIds: c.variantIds || [],
        ref: c.lineKey,
      }))

    if (lines.length === 0) { setQuote(null); setQuoteFailed(false); return }

    let cancelled = false
    setQuoting(true)
    posService
      .quotePricing(lines)
      .then((res) => { if (!cancelled) { setQuote(res); setQuoteFailed(false) } })
      // A failed quote must not block order taking — fall back to showing the
      // untaxed subtotal rather than wedging the till. It IS flagged though:
      // the order the server saves still carries correct tax, so a silent
      // fallback showed the cashier one total and charged another.
      .catch(() => { if (!cancelled) { setQuote(null); setQuoteFailed(true) } })
      .finally(() => { if (!cancelled) setQuoting(false) })

    return () => { cancelled = true }
  }, [cartItems])

  const taxAmount  = quote ? Number(quote.totals.taxAmount) : 0
  const grandTotal = quote ? Number(quote.totals.grossAmount) : subTotal
  const taxByComponent = quote?.totals?.taxByComponent || []

  // Items carry the priced snapshot so the order records what was charged.
  const buildOrderItems = () => {
    const byRef = new Map((quote?.lines || []).map((l) => [l.ref, l]))
    return cartItems.map((c) => {
      const priced = byRef.get(c.lineKey)
      return {
        id: c.id,
        name: c.name,
        price: priced ? priced.unitAmount : c.price,
        basePrice: priced ? priced.baseAmount : c.basePrice,
        variantAmount: priced ? priced.addOnAmount : c.variantAmount,
        // Sent so the server can re-resolve; the resolved objects come back on
        // the priced line and are what a reprint/repeat order reads.
        variantIds: c.variantIds || [],
        variants: priced ? priced.variants : c.variants,
        qty: c.qty,
        taxPct: c.taxPct,
        isTaxIncluded: priced ? priced.isTaxIncluded : c.isTaxIncluded,
        costInfoId: c.costInfoId,
        netAmount: priced ? priced.netAmount : null,
        taxAmount: priced ? priced.taxAmount : null,
        grossAmount: priced ? priced.grossAmount : null,
        taxComponents: priced ? priced.components : [],
      }
    })
  }

  // The selected table's active session, grouped into chronological rounds.
  const tableRounds = useMemo(
    () => buildTableRounds(activeOrders, selectedTable),
    [activeOrders, selectedTable],
  )

  // A counter sale is ONE order, not a session: the customer pays and leaves
  // with a token, so there is no table to come back to and add a round to.
  // buildRoundIndex already treats a table-less order as its own round 1, which
  // is exactly the shape the bill summary and settle modal expect.
  const counterRounds = useMemo(() => {
    if (!counterOrderId) return []
    const r = buildRoundIndex(activeOrders).get(counterOrderId)
    return r ? [r] : []
  }, [counterOrderId, activeOrders])

  // Everything downstream — the bill, the settle modal, the discounts — reads
  // this one list and does not care which kind of sale produced it.
  const sessionRounds = counterMode ? counterRounds : tableRounds

  // Whole-session bill (pre-discount) from the priced snapshots on each round.
  const sessionSummary = useMemo(
    () => summarizeSession(sessionRounds),
    [sessionRounds],
  )

  // Each round's KOT status: 'pending' unless a later stage (ready/…) exists.
  // A round is only deletable while its kitchen ticket is still pending.
  const kotStatusByOrder = useMemo(() => {
    const m = {}
    ;(kots || []).forEach((k) => {
      const oid = k.OrderId || k.orderId
      if (!oid) return
      const s = String(k.Status || '').toLowerCase() || 'pending'
      const prev = m[oid]
      // Keep the most advanced status — anything past 'pending' blocks deletion.
      if (!prev || (prev === 'pending' && s !== 'pending' && s !== 'cancelled')) m[oid] = s
    })
    return m
  }, [kots])

  // The drafts that actually count: a chosen type with a real number behind it,
  // coerced to the numeric shape the pricing engine and the bill both expect.
  // Everything that leaves this component reads THIS, never the raw drafts.
  const activeLineDiscounts = useMemo(() => {
    const out = {}
    Object.entries(lineDiscounts).forEach(([ref, d]) => {
      const value = Number(d?.value)
      if (value > 0) out[ref] = { type: d.type, value }
    })
    return out
  }, [lineDiscounts])

  // Priceable lines across every committed round — used to re-quote the settle
  // total with the discount folded in (discount BEFORE tax) via the same server
  // engine the cart uses, so the preview never drifts from the raised bill.
  const settleLines = useMemo(() =>
    sessionRounds.flatMap((r) =>
      (r.items || []).map((it, i) => ({
        costInfoId: it.costInfoId || it.CostInfoId,
        quantity: Number(it.qty ?? it.quantity ?? 1) || 1,
        variantIds:
          it.variantIds ||
          (Array.isArray(it.variants) ? it.variants.map((v) => v.id || v.Id).filter(Boolean) : []),
        ref: `${r.orderId}#${i}`,
        // The per-item discount, keyed by the same ref the bill will store it
        // under. The engine applies it to this line before tax, then spreads any
        // whole-bill discount on top.
        discount: activeLineDiscounts[`${r.orderId}#${i}`] || null,
      })),
    ).filter((l) => l.costInfoId),
  [sessionRounds, activeLineDiscounts])

  // Display labels for those lines, keyed by ref. Kept OUT of settleLines
  // because the quote endpoint rejects unknown keys — the wire shape is the
  // contract, and decorating it for the UI would 400 the whole settle.
  const settleLineLabels = useMemo(() => {
    const map = {}
    sessionRounds.forEach((r) => {
      (r.items || []).forEach((it, i) => {
        map[`${r.orderId}#${i}`] = itemLabel(it)
      })
    })
    return map
  }, [sessionRounds])

  // Re-quote (debounced) whenever the settle modal is open and the discount
  // changes. Falls back to a snapshot estimate when nothing is priceable.
  useEffect(() => {
    if (!settleOpen || settleLines.length === 0) { setSettleQuote(null); return }
    const value = Number(settleDiscount) || 0
    let cancelled = false
    const t = setTimeout(() => {
      posService
        .quotePricing(settleLines, value > 0 ? { type: settleDiscountType, value } : null)
        .then((res) => { if (!cancelled) setSettleQuote(res) })
        .catch(() => { if (!cancelled) setSettleQuote(null) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [settleOpen, settleDiscount, settleDiscountType, settleLines])

  // Numbers shown in the settle modal: prefer the live server quote; otherwise
  // estimate the discount effect from the session snapshot totals.
  //
  // `payable` is the gross ROUNDED TO THE NEAREST RUPEE, because that is what the
  // ledger will invoice (see roundPayable). Quoting the unrounded gross here made
  // "Exact" hand over less than the invoice asked for, and the sale posted
  // PARTIALLY_PAID over a few paise nobody could see.
  const settleTotals = useMemo(() => {
    const value = Number(settleDiscount) || 0
    if (settleQuote?.totals) {
      const t = settleQuote.totals
      const gross = Number(t.grossAmount) || 0
      const { payable, roundOff } = roundPayable(gross)
      return {
        subTotal: sessionSummary.subTotal,
        discount: Number(t.discountAmount) || 0,
        taxable: Number(t.netAmount) || 0,
        tax: Number(t.taxAmount) || 0,
        gross,
        roundOff,
        payable,
        taxByComponent: t.taxByComponent || [],
        estimated: false,
      }
    }
    // Fallback estimate: resolve a % into a ₹ amount off the subtotal first, so
    // both discount modes flow through the same amount-based estimator.
    const resolvedAmount = settleDiscountType === 'percent'
      ? (sessionSummary.subTotal * value) / 100
      : value
    const est = estimateAfterDiscount(sessionSummary, resolvedAmount)
    const { payable, roundOff } = roundPayable(est.total)
    return {
      subTotal: sessionSummary.subTotal,
      discount: est.discount,
      taxable: est.taxable,
      tax: est.tax,
      gross: est.total,
      roundOff,
      payable,
      taxByComponent: [],
      estimated: true,
    }
  }, [settleQuote, sessionSummary, settleDiscount, settleDiscountType])

  // The whole-bill part of the discount, on its own.
  //
  // Taken from the quote's per-line bill shares rather than from the input,
  // because the server has already resolved a percentage and capped the value at
  // what is actually being sold. Sending the raw input instead would disagree
  // with the payable the cashier just read whenever either applied.
  const billDiscountAmount = useMemo(() => {
    const lines = settleQuote?.lines
    if (Array.isArray(lines) && lines.length > 0) {
      const sum = lines.reduce((s, l) => s + (Number(l.billDiscountAmount) || 0), 0)
      return Math.round(sum * 100) / 100
    }
    // No quote: fall back to the typed amount, resolving a % off the subtotal.
    const value = Number(settleDiscount) || 0
    const resolved = settleDiscountType === 'percent'
      ? (sessionSummary.subTotal * value) / 100
      : value
    return Math.round(resolved * 100) / 100
  }, [settleQuote, settleDiscount, settleDiscountType, sessionSummary])

  // Per-line item discount in rupees, keyed by the ref the row was sent under —
  // the quote echoes `ref` back untouched. Lets each row show what its ₹ or %
  // actually took off, which is the only confirmation a % input ever gets.
  const lineDiscountOff = useMemo(() => {
    const map = {}
    const lines = settleQuote?.lines
    if (!Array.isArray(lines)) return map
    lines.forEach((l) => {
      if (l.ref) map[l.ref] = Number(l.itemDiscountAmount) || 0
    })
    return map
  }, [settleQuote])

  // What the per-item discounts came to, for the settle modal's breakdown.
  const itemDiscountAmount = useMemo(() => {
    const lines = settleQuote?.lines
    if (!Array.isArray(lines)) return 0
    const sum = lines.reduce((s, l) => s + (Number(l.itemDiscountAmount) || 0), 0)
    return Math.round(sum * 100) / 100
  }, [settleQuote])

  // ── Tenders ───────────────────────────────────────────────────────────────
  // Balance due is the number a cashier actually works to, so it drives both
  // the display and whether Settle is allowed.
  const payable = Number(settleTotals.payable) || 0
  const tendered = tenders.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const balanceDue = Math.round((payable - tendered) * 100) / 100
  const changeDue = balanceDue < 0 ? Math.abs(balanceDue) : 0

  const modeName = (id) => {
    const m = paymentModes.find((p) => (p.id || p.Id) === id)
    return m ? (m.Type || m.type || '') : ''
  }
  // Card/UPI/Wallet must carry a reference or the takings cannot be reconciled.
  const needsRef = (id) => ['card', 'upi', 'wallet'].includes(modeName(id).toLowerCase())
  const missingRef = tenders.some((t) => needsRef(t.paymentModeId) && !String(t.refNo || '').trim())

  const addTender = (amount) => {
    const first = paymentModes[0]
    if (!first) return
    setTenders((prev) => [...prev, {
      key: `t${Date.now()}${prev.length}`,
      paymentModeId: first.id || first.Id,
      amount: amount !== undefined ? amount : Math.max(0, balanceDue),
      refNo: '',
      // Auto-seeded rows track the payable; a manual edit pins them.
      auto: amount !== undefined,
    }])
  }
  const updateTender = (key, patch) =>
    setTenders((prev) => prev.map((t) => (
      t.key === key
        // Editing the amount takes ownership of the row, so it stops tracking.
        ? { ...t, ...patch, auto: patch.amount !== undefined ? false : t.auto }
        : t
    )))
  const removeTender = (key) => setTenders((prev) => prev.filter((t) => t.key !== key))

  // Seed one tender for the full payable the moment the modal opens — the
  // common case is a single payment, and this makes it a one-tap settle.
  useEffect(() => {
    if (!settleOpen) { setTenders([]); return }
    if (paymentModes.length === 0 || payable <= 0) return

    setTenders((prev) => {
      if (prev.length === 0) {
        const first = paymentModes[0]
        return [{ key: 't0', paymentModeId: first.id || first.Id, amount: payable, refNo: '', auto: true }]
      }
      // Keep a single untouched row in step with the payable — otherwise
      // changing the discount leaves a stale amount and a phantom balance.
      if (prev.length === 1 && prev[0].auto) {
        return [{ ...prev[0], amount: payable }]
      }
      return prev
    })
    // Deliberately not keyed on `tenders`: re-seeding on every edit would fight
    // the cashier mid-entry.
  }, [settleOpen, paymentModes, payable])

  // Picking a table targets its latest round for KOT firing / context.
  useEffect(() => {
    if (!selectedTable) { setSelectedOrderId(null); return }
    const rounds = buildTableRounds(activeOrders, selectedTable)
    setSelectedOrderId(rounds.length ? rounds[rounds.length - 1].orderId : null)
  }, [selectedTable, activeOrders])

  // Selecting a table RESUMES it: fetch that table's live rounds from the server
  // rather than trusting the list loaded at mount.
  //
  // This matters on the second visit to an occupied table. The mount-time list is
  // one page deep and already stale by the time a shift is busy — another till may
  // have added a round, or settled the table entirely. Asking for this table
  // specifically is both correct and cheap, and it is what makes "select an
  // occupied table and carry on" trustworthy rather than usually-right.
  useEffect(() => {
    if (!selectedTable) { setSessionLoading(false); return }
    let cancelled = false
    setSessionLoading(true)
    posService
      .getOrders({ tableId: selectedTable, openOnly: true, limit: MAX_LIMIT })
      .then((rows) => {
        if (cancelled) return
        // Merge rather than replace: activeOrders also backs the Transfer sheet,
        // which needs to know about tables other than this one.
        setActiveOrders((prev) => {
          const fresh = Array.isArray(rows) ? rows : []
          const freshIds = new Set(fresh.map((o) => o.id || o.Id))
          return [
            // Drop this table's stale rows — including any that have since been
            // settled, so a closed table stops looking occupied.
            ...prev.filter((o) => o.TableId !== selectedTable && !freshIds.has(o.id || o.Id)),
            ...fresh,
          ]
        })
      })
      // A failed refresh falls back to the list already in hand rather than
      // emptying the screen — stale context beats no context at a till.
      .catch(() => { if (!cancelled) toast.warn('Could not refresh this table — showing last known order') })
      .finally(() => { if (!cancelled) setSessionLoading(false) })
    return () => { cancelled = true }
  }, [selectedTable])

  // The cart belongs to the table it was built for. Switching tables must not
  // carry someone else's items across — that bills the wrong guest.
  const handleTableChange = (tableId) => {
    if (tableId !== selectedTable && cartItems.length > 0) {
      setCartItems([])
      toast.info('Cart cleared — it belonged to the previous table')
    }
    // Leaving the counter is the same kind of move: whatever was on it was for
    // the customer standing there, not for the table being opened.
    setCounterMode(false)
    setCounterOrderId(null)
    setSelectedTable(tableId)
  }

  // Switch the till to counter service. No table, no session to resume — each
  // customer is one order, paid for on the spot.
  const handlePickCounter = () => {
    if (cartItems.length > 0) {
      setCartItems([])
      toast.info('Cart cleared — it belonged to the previous table')
    }
    setSelectedTable('')
    setSelectedOrderId(null)
    setCounterOrderId(null)
    setCounterMode(true)
  }

  // Has this round reached the kitchen? The presence of a ticket is the real
  // answer — the order's own 'fired' status is only a shadow of it, and the two
  // can differ if a ticket was cancelled. Used to label the button and to warn
  // before settling.
  const isRoundSent = (r) => !!kotStatusByOrder[r?.orderId] || /fired/i.test(String(r?.status || ''))
  const selectedRound = sessionRounds.find((r) => r.orderId === selectedOrderId) || null
  const selectedSent = isRoundSent(selectedRound)

  // Rounds nobody sent to the kitchen. Settling is still allowed — a drink
  // served from the counter never needs a ticket — but it must not be silent.
  const unsentRounds = sessionRounds.filter((r) => !isRoundSent(r))

  // Delete a whole round even after its KOT fired — the customer changed the
  // order. The server pulls the KOT from the kitchen and frees the table.
  const handleDeleteRound = async () => {
    if (!deleteTarget) return
    setDeletingRound(true)
    try {
      await posService.deleteOrder(deleteTarget.orderId)
      toast.success(`Round ${deleteTarget.round} deleted`)
      const lastRound = sessionRounds.length <= 1
      setDeleteTarget(null)
      if (lastRound) setSelectedTable('')
      else if (selectedOrderId === deleteTarget.orderId) setSelectedOrderId(null)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to delete round')
    } finally {
      setDeletingRound(false)
    }
  }

  // Append the cart to the selected table's session as a new round (new order).
  const handleAddRound = async () => {
    if (!selectedTable) { toast.warn('Select a table first'); return }
    if (cartItems.length === 0) { toast.warn('Add items to cart first'); return }
    const isFirst = sessionRounds.length === 0
    try {
      const tableObj = tables.find((t) => (t.id || t.Id) === selectedTable)
      // OrderNo comes from the server's numbering series. It used to be minted
      // here from the last 6 digits of Date.now(), which wraps every ~16m40s and
      // then collides with UNIQUE (OrderNo, TenantId) — the round just failed.
      const order = await posService.createOrder({
        TableId: selectedTable,
        OrderType: 'dinein',
        Items: buildOrderItems(),
        // Null for a walk-in — the settle path already carries this through to
        // the ledger contact and the CRM projection.
        CustomerId: customer?.Id || null,
        BranchDetailId: tableObj?.BranchDetailId || null,
      })
      const orderId = order.id || order.Id
      if (isFirst) {
        // First round opens the session and marks the table occupied
        await posService.updateTable(selectedTable, { Status: 'occupied', CurrentOrderId: orderId })
      }
      // Placing a round does NOT send it to the kitchen — that is a separate,
      // deliberate tap. Say so, because a waiter who assumes otherwise is how a
      // round ends up never being cooked.
      const roundNo = isFirst ? 1 : sessionRounds.length + 1
      toast.success(`Round ${roundNo} added — press Send KOT when it is ready to cook`)
      setCartItems([])
      setCustomer(null)
      setSelectedOrderId(orderId)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add round')
    }
  }

  // Counter service: commit the cart as one takeaway order, send it to the
  // kitchen, and go straight to payment.
  //
  // The order is created BEFORE the settle modal opens so the bill is priced by
  // the same server path a dine-in bill goes through — the alternative, billing
  // a cart the server has never seen, is how the till and the invoice end up
  // disagreeing. If the cashier abandons the modal, the order is left unsettled
  // and can be finished from the queue rather than being lost.
  //
  // The branch comes from the items themselves: pos_item_meta.BranchDetailId is
  // NOT NULL, and a till necessarily sells one branch's menu — so there is
  // nothing to ask the cashier.
  const handleCounterOrder = async () => {
    if (cartItems.length === 0) { toast.warn('Add items to cart first'); return }
    const branchId = cartItems.find((c) => c.meta?.BranchDetailId)?.meta.BranchDetailId || null

    setCounterBusy(true)
    try {
      const order = await posService.createOrder({
        TableId: null,
        OrderType: 'takeaway',
        Items: buildOrderItems(),
        CustomerId: customer?.Id || null,
        BranchDetailId: branchId,
      })
      const orderId = order.id || order.Id
      // Counter food is being made now — there is no later moment to decide to
      // send it, which is why this fires the ticket rather than leaving it to a
      // second tap the way a dine-in round does.
      try {
        await posService.fireKot(orderId)
      } catch {
        toast.warn('Order placed, but the kitchen ticket did not send — check the KDS')
      }
      setCartItems([])
      setCustomer(null)
      setCounterOrderId(orderId)
      await load()
      setSettleOpen(true)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to place the counter order')
    } finally {
      setCounterBusy(false)
    }
  }

  // Reverse a committed transfer by replaying the server-supplied inverse.
  const runUndo = async (undo) => {
    try {
      await posService.transferOrder(undo)
      toast.success('Transfer undone')
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not undo the transfer')
    }
  }

  const handleTransfer = async (payload) => {
    if (!payload?.toTableId) { toast.warn('Pick a destination table'); return }
    setTransferBusy(true)
    try {
      const res = await posService.transferOrder(payload)
      setTransferOpen(false)
      // Offer an immediate Undo; the server hands back the exact inverse.
      const undo = res?.undo
      toast.success(
        <span className="fd-undo-toast">
          <span>Items transferred</span>
          {undo && <button onClick={() => runUndo(undo)}>Undo</button>}
        </span>,
        { autoClose: 8000 },
      )
      // Moving a whole table clears the current selection.
      if (payload.scope === 'orders' && payload.orderIds?.length === sessionRounds.length) {
        setSelectedTable('')
      }
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to transfer')
    } finally {
      setTransferBusy(false)
    }
  }

  // Send this round to the kitchen. The server is send-once: a round that
  // already has a live ticket gets no second one, so a double-tap cannot put the
  // same food on the pass twice. The toast says which happened.
  const handleSendKot = async () => {
    if (!selectedOrderId) { toast.warn('Select a round first'); return }
    try {
      const kot = await posService.fireKot(selectedOrderId)
      if (kot?.AlreadySent) {
        toast.info(`Already in the kitchen (${kot.KotNo || 'KOT'})`)
      } else {
        toast.success(`Sent to the kitchen (${kot?.KotNo || 'KOT'})`)
      }
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to send to the kitchen')
    }
  }

  const handleSettleBill = async () => {
    if (!selectedTable && !counterMode) { toast.warn('Select a table first'); return }
    if (sessionRounds.length === 0) { toast.warn('No active order to settle'); return }
    if (tenders.length === 0) { toast.warn('Add at least one payment'); return }
    if (missingRef) { toast.warn('Enter a reference number for card, UPI and wallet payments'); return }
    setSettling(true)
    try {
      // The server recomputes the bill from every round it covers and applies
      // the discount BEFORE tax, so no totals are calculated here. Sending
      // OrderIds is what lets it do that — OrderId alone only named round 1.
      //
      // Discount is sent as TWO separate things, and conflating them would
      // double-count: pos_bill.Discount is the whole-bill reduction only, while
      // the per-item ones travel as LineDiscounts and are re-applied per line.
      //
      // The bill takes a flat ₹ figure, so a % is resolved here — and resolved
      // from the quote's own per-line bill shares rather than by multiplying the
      // subtotal, because the server already capped and apportioned it.
      const discount = billDiscountAmount
      // BillNo, like OrderNo, is issued by the server's numbering series.
      const bill = await posService.createBill({
        OrderIds: sessionRounds.map((r) => r.orderId),
        Discount: discount,
        LineDiscounts: activeLineDiscounts,
        // Status is NOT sent: a bill is born 'unpaid' server-side and settling
        // is what changes that. This used to send 'Pending', a value no reader
        // in either codebase compares against — the bill was invisible to every
        // status filter it should have appeared in.
        BranchDetailId: sessionRounds[0].order.BranchDetailId || null,
      })
      const billId = bill.id || bill.Id
      // One tender per row — the server turns each into a paymentbreakup with
      // its own instrument, and posts the whole thing as a ledger document.
      const settled = await posService.settleBill(billId, {
        Tenders: tenders.map((t) => ({
          paymentModeId: t.paymentModeId,
          amount: Number(t.amount) || 0,
          refNo: String(t.refNo || '').trim() || null,
        })),
        Discount: discount,
        LineDiscounts: activeLineDiscounts,
      })

      const fullySettled = !(Number(settled?.BalanceDue) > 0)
      if (fullySettled) {
        // Close every round; free the table when there was one. A counter sale
        // has none — the customer left with a token instead.
        await Promise.all(sessionRounds.map((r) => posService.updateOrder(r.orderId, { Status: 'closed' })))
        if (selectedTable) {
          await posService.updateTable(selectedTable, { Status: 'free', CurrentOrderId: null })
        }
      }

      // The invoice number is the customer-facing artefact, so it headlines the
      // confirmation rather than a generic success toast.
      setSettledInvoice({
        transactionNo: settled?.TransactionNo || null,
        total: Number(settled?.Total) || payable,
        balanceDue: Number(settled?.BalanceDue) || 0,
        tenders: tenders.map((t) => ({ mode: modeName(t.paymentModeId), amount: Number(t.amount) || 0, refNo: t.refNo })),
        // Minted by the server inside the settle transaction. It headlines the
        // confirmation because it is the only thing the customer walks away
        // with — nobody can call a number that was never shown to the cashier.
        tokenLabel: settled?.TokenLabel || null,
      })
      toast.success(fullySettled ? 'Bill settled and posted to ledger' : 'Partial payment recorded')
      setSettleOpen(false)
      setSettleDiscount(0)
      setSettleDiscountType('amount')
      // Per-item discounts belong to the bill just settled — carrying them into
      // the next table would silently give the same dish away twice.
      setLineDiscounts({})
      setDiscountMode('bill')
      setTenders([])
      if (fullySettled) {
        setSelectedOrderId(null)
        setSelectedTable('')
        // The till STAYS on the counter — the next customer is already there.
        // Only the finished order is let go of.
        setCounterOrderId(null)
      }
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to settle bill')
    } finally {
      setSettling(false)
    }
  }

  if (loading) return <div className="fd-loading">Loading billing...</div>

  return (
    <div className="fd-billing">
      {/* One bar, always in the same place: what this screen is, which table is
          being served, and how to leave it. When nothing is selected the bar is
          just the title — there is nothing to say yet. */}
      <div className="fd-billing-bar">
        <h1>🧾 Billing &amp; KOT</h1>
        {selectedTable && (
          <div className="fd-billing-bar-table">
            <span className={`fd-table-chip ${selectedTableMeta.key}`}>
              <i className="dot" aria-hidden="true" />
              <span className="name">{selectedTableName}</span>
              {sessionRounds.length > 0 && (
                <span className="rounds">
                  Round {sessionRounds.length} · ₹{money(sessionSummary.total)}
                </span>
              )}
            </span>
            <button
              type="button"
              className="fd-btn fd-btn-outline fd-btn-sm"
              onClick={() => handleTableChange('')}
            >
              Change table
            </button>
          </div>
        )}
        {counterMode && (
          <div className="fd-billing-bar-table">
            <span className="fd-table-chip free">
              <i className="dot" aria-hidden="true" />
              <span className="name">🎫 Counter</span>
              <span className="rounds">Takeaway · pay first</span>
            </span>
            <button
              type="button"
              className="fd-btn fd-btn-outline fd-btn-sm"
              onClick={() => handleTableChange('')}
            >
              Back to floor plan
            </button>
          </div>
        )}
      </div>

      {/* Choosing a table IS the first screen, not an empty state pointing at a
          control elsewhere. One tap instead of open-list-then-pick, and the room
          answers "who is free / who is running / how big is their bill" while
          you look at it. */}
      {menuLocked ? (
        <FloorPlanPicker
          floors={floors}
          tables={tables}
          orders={activeOrders}
          onPick={handleTableChange}
          onPickCounter={handlePickCounter}
        />
      ) : (
      <div className="fd-billing-layout">
        <div className="fd-menu-panel">
          <div className="fd-menu-panel-head">
            <span className="fd-menu-panel-title">Menu Items</span>
          </div>
          <input
            className="fd-menu-search"
            placeholder="Search menu..."
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
          />
          {filteredMenu.length === 0 ? (
            <div className="fd-empty">No menu items found.</div>
          ) : (
            <div className="fd-menu-grid">
              {filteredMenu.map((meta) => {
                const id = meta.id || meta.Id
                const name = itemName(meta, itemDetails[meta.ItemDetailId])
                const price = itemPrice(meta)
                const isVeg = meta.FoodTypeIsVeg === 1 || meta.FoodTypeIsVeg === true
                return (
                  <div
                    key={id}
                    className="fd-menu-item-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleMenuClick(meta)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleMenuClick(meta) }
                    }}
                  >
                    {meta.FoodTypeName && (
                      <span className={`food-type-badge ${isVeg ? 'veg' : 'nonveg'}`}>
                        {meta.FoodTypeName}
                      </span>
                    )}
                    <div className="item-name">{name || '(unnamed)'}</div>
                    {price > 0 && (
                      <div className="item-price">
                        ₹{money(price)}
                        {/* Whether the printed price already contains tax, and
                            at what rate. Colour-coded so staff can tell at a
                            glance whether the total will grow at the till. */}
                        {itemTaxRate(meta) > 0 && (
                          <span className={`tax-flag ${meta?.TaxBreakdown?.isTaxIncluded ? 'incl' : 'excl'}`}>
                            {meta?.TaxBreakdown?.isTaxIncluded
                              ? `incl. ${itemTaxRate(meta)}% tax`
                              : `+ ${itemTaxRate(meta)}% tax`}
                          </span>
                        )}
                      </div>
                    )}
                    {variantsFor(meta).length > 0 && (
                      <div className="item-has-options">Options available</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Cart / order panel — the till's working surface. Scrolls internally
            so the totals and actions stay pinned no matter how long the order
            gets. The table lives in the header bar now, not here. */}
        <div className="fd-cart-panel">
          <div className="fd-cart-scroll">

          {/* Resuming an occupied table is a state change worth announcing —
              the items below are someone else's order, not a fresh one. */}
          {selectedTable && sessionLoading && (
            <div className="fd-session-loading" role="status">Loading this table's order…</div>
          )}
          {selectedTable && !sessionLoading && sessionRounds.length > 0 && (
            <div className="fd-session-resumed" role="status">
              Resuming a running order — {sessionRounds.length}
              {sessionRounds.length === 1 ? ' round' : ' rounds'} already placed.
              New items start Round {sessionRounds.length + 1}.
            </div>
          )}

          {/* A counter order that has been placed but not yet paid for. Shown
              so "Resume payment" has something to point at — otherwise the cart
              is empty and the screen looks like nothing happened. */}
          {counterMode && sessionRounds.length > 0 && (
            <div className="fd-session-panel">
              <div className="fd-session-resumed" role="status">
                Order placed and sent to the kitchen — waiting on payment.
              </div>
              <BillSummary rounds={sessionRounds} title="Counter order" />
            </div>
          )}

          {/* Active session for the selected table (filtered by table) */}
          {selectedTable && (
            sessionRounds.length > 0 ? (
              <div className="fd-session-panel">
                <div className="fd-cart-table-selector">
                  <label>Active Order Round</label>
                  <select
                    value={selectedOrderId || ''}
                    onChange={(e) => setSelectedOrderId(e.target.value || null)}
                  >
                    {sessionRounds.map((r) => (
                      <option key={r.orderId} value={r.orderId}>
                        Round {r.round} — {r.orderNo}{r.time ? ` (${formatRoundTime(r.time)})` : ''}{isRoundSent(r) ? ' · in kitchen' : ' · not sent'}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Each round shows its number + order no. with a "KOT fired"
                    badge and a Delete button inline (delete works even after the
                    KOT fired — customer changed the order). */}
                <div className="fd-session-rounds">
                  <RoundsTimeline
                    rounds={sessionRounds}
                    showPricing
                    onDeleteRound={(r) => setDeleteTarget(r)}
                    kotStatusByOrder={kotStatusByOrder}
                  />
                </div>
                {/* Whole-session bill: per-round totals, item-wise GST and the
                    grand total with its CGST/SGST breakup. */}
                <BillSummary rounds={sessionRounds} />
              </div>
            ) : (
              <div className="fd-empty" style={{ padding: '10px 0' }}>
                No active order — the next items will start Round 1.
              </div>
            )
          )}

          {/* Who this is for. Above the cart because it is asked at the start
              of an order, and skippable because a queue must never wait on it. */}
          <CustomerPicker value={customer} onChange={setCustomer} />

          {/* Cart items */}
          <div className="fd-cart-items">
            {cartItems.length === 0 ? (
              <div className="fd-cart-empty">Tap menu items to add</div>
            ) : cartItems.map((c) => (
              <div key={c.lineKey} className="fd-cart-row">
                <span className="ci-name">
                  {c.name || '(item)'}
                  {/* Chosen options and what each added, so the line price is
                      explainable rather than a mystery total. */}
                  {c.variants?.length > 0 && (
                    <span className="ci-variants">
                      {c.variants.map((v) => (
                        <span className="ci-variant-chip" key={v.id}>
                          {v.name}{v.price > 0 ? ` +₹${money(v.price)}` : ''}
                        </span>
                      ))}
                    </span>
                  )}
                  {c.isTaxIncluded && <span className="tax-flag incl">incl. tax</span>}
                </span>
                <div className="ci-qty-btns">
                  <button onClick={() => changeQty(c.lineKey, -1)}>−</button>
                  <span className="ci-qty">{c.qty}</span>
                  <button onClick={() => changeQty(c.lineKey, +1)}>+</button>
                </div>
                <span className="ci-price">₹{money(c.price * c.qty)}</span>
              </div>
            ))}
          </div>

          {/* Totals — tax and grand total come from the server quote, so the
              till always agrees with the bill that gets raised. */}
          {cartItems.length > 0 && (
            <div className="fd-cart-totals">
              <div className="total-row"><span>Subtotal</span><span>₹{money(subTotal)}</span></div>

              {/* One row per tax component (CGST / SGST / …) — this is the
                  invoice footer, and it sums exactly to the Tax row. */}
              {taxByComponent.map((c) => (
                <div className="total-row tax-component" key={c.name || c.id}>
                  <span>{c.name}{c.rate ? ` @ ${c.rate}%` : ''}</span>
                  <span>₹{money(c.amount)}</span>
                </div>
              ))}

              <div className="total-row">
                <span>Tax{quoting ? ' …' : ''}</span>
                <span>₹{money(taxAmount)}</span>
              </div>
              <div className="total-row grand"><span>Total</span><span>₹{money(grandTotal)}</span></div>

              {/* The saved order still gets correct server-computed tax, so this
                  total is the one that is wrong — say so rather than letting the
                  cashier quote a figure the bill will not match. */}
              {quoteFailed && !quoting && (
                <div className="total-row tax-unavailable">
                  Tax could not be calculated — this total is incomplete. The bill
                  will show the correct amount.
                </div>
              )}
            </div>
          )}

          </div>{/* /fd-cart-scroll */}

          {/* Actions are PINNED below the scroll area and ranked, rather than
              four identical bars. Four equal buttons make the cashier read all
              of them every time; one obvious next step and a row of follow-ups
              can be hit without looking. */}
          <div className="fd-cart-actions">
            {/* Counter service collapses order → kitchen → payment into one
                press. There is no second visit to add a round to, and the food
                is being made now, so nothing is left for the cashier to
                remember. Dine-in keeps its three deliberate steps. */}
            {counterMode ? (
              <>
                <button
                  className="fd-btn fd-btn-success fd-btn-lg"
                  onClick={handleCounterOrder}
                  disabled={counterBusy || cartItems.length === 0}
                >
                  {counterBusy ? 'Placing…' : 'Place & Pay'}
                </button>
                {sessionRounds.length > 0 && (
                  <div className="fd-cart-actions-row">
                    {/* The customer walked off mid-payment, or the modal was
                        closed by accident: the order is still there and can be
                        settled rather than stranded. */}
                    <button
                      className="fd-btn fd-btn-outline"
                      onClick={() => setSettleOpen(true)}
                    >
                      Resume payment
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  className="fd-btn fd-btn-primary fd-btn-lg"
                  onClick={handleAddRound}
                  disabled={!selectedTable || cartItems.length === 0}
                >
                  {sessionRounds.length > 0 ? `Add Round ${sessionRounds.length + 1}` : 'Start Order'}
                </button>

                <div className="fd-cart-actions-row">
                  {/* Send-once on the server, so this stays enabled: pressing it on a
                      round that is already cooking reports that rather than
                      duplicating the ticket. */}
                  <button
                    className="fd-btn fd-btn-warning"
                    onClick={handleSendKot}
                    disabled={!selectedOrderId}
                    title={selectedSent
                      ? 'This round is already in the kitchen'
                      : 'Send this round to the kitchen'}
                  >
                    {selectedSent ? 'Sent ✓' : 'Send KOT'}
                  </button>
                  <button
                    className="fd-btn fd-btn-success"
                    onClick={() => setSettleOpen(true)}
                    disabled={sessionRounds.length === 0}
                  >
                    Settle Bill
                  </button>
                </div>
              </>
            )}

            {/* Rarely used and never urgent, so it stays out of the way of the
                two buttons a cashier presses all shift. */}
            <div className="fd-cart-actions-minor">
              {/* Transferring needs a table to transfer between. */}
              {!counterMode && (
                <button
                  type="button"
                  className="fd-link-btn"
                  onClick={() => setTransferOpen(true)}
                  disabled={sessionRounds.length === 0}
                >
                  Transfer table
                </button>
              )}
              {cartItems.length > 0 && (
                <button type="button" className="fd-link-btn" onClick={() => setCartItems([])}>
                  Clear cart
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Variant picker — opens when a menu item offers options. Entirely
          optional: Skip adds the plain item, so it never blocks fast service. */}
      {variantPick && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Choose options">
          <div className="fd-variant-modal">
            <h3>
              {itemName(variantPick.meta, itemDetails[variantPick.meta.ItemDetailId])}
            </h3>
            <p className="fd-variant-hint">
              Choose any options to add. Each adds to the item price before tax.
            </p>

            <div className="fd-variant-list">
              {variantsFor(variantPick.meta).map((v) => {
                const vid = v.id || v.Id
                const price = Number(v.Price ?? v.price) || 0
                const checked = variantPick.selected.some((x) => (x.id || x.Id) === vid)
                return (
                  <label key={vid} className={`fd-variant-option ${checked ? 'is-selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setVariantPick((prev) => ({
                        ...prev,
                        selected: checked
                          ? prev.selected.filter((x) => (x.id || x.Id) !== vid)
                          : [...prev.selected, v],
                      }))}
                    />
                    <span className="fd-variant-name">{v.Name || v.name}</span>
                    <span className="fd-variant-price">
                      {price > 0 ? `+₹${money(price)}` : 'No extra charge'}
                    </span>
                  </label>
                )
              })}
            </div>

            {/* Running total so the effect of each option is obvious. */}
            <div className="fd-variant-total">
              <span>Item total</span>
              <span>
                ₹{money(
                  itemPrice(variantPick.meta) +
                  variantPick.selected.reduce((s, v) => s + (Number(v.Price ?? v.price) || 0), 0),
                )}
              </span>
            </div>

            <div className="fd-variant-actions">
              <button
                className="fd-btn fd-btn-success"
                onClick={() => { addToCart(variantPick.meta, variantPick.selected); setVariantPick(null) }}
              >
                Add to Order
              </button>
              <button
                className="fd-btn fd-btn-outline"
                onClick={() => { addToCart(variantPick.meta, []); setVariantPick(null) }}
              >
                Skip Options
              </button>
              <button className="fd-btn fd-btn-outline" onClick={() => setVariantPick(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer sheet — move items or whole rounds to another table. */}
      <TransferSheet
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onConfirm={handleTransfer}
        busy={transferBusy}
        sourceTableId={selectedTable}
        sourceTableLabel={(() => {
          const t = tables.find((x) => (x.id || x.Id) === selectedTable)
          if (!t) return 'Table'
          const f = floors.find((x) => (x.id || x.Id) === t.FloorId)
          return `${f ? `${f.Name || f.name} - ` : ''}${t.Name || t.name}`
        })()}
        rounds={sessionRounds}
        activeOrderId={selectedOrderId}
        tables={tables}
        floors={floors}
      />

      {/* Delete round confirmation — allowed even after the KOT has fired. */}
      {deleteTarget && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Delete round">
          <div className="fd-confirm-modal">
            <h3>Delete Round {deleteTarget.round}?</h3>
            <p>
              This removes the whole round
              {deleteTarget.orderNo ? <> (<b>{deleteTarget.orderNo}</b>)</> : null} from the order.
              {isRoundSent(deleteTarget)
                ? ' It is already in the kitchen — its ticket will be pulled from the pass.'
                : ''}
            </p>
            <p className="fd-confirm-sub">Use this when the customer changes their order.</p>
            <div className="fd-confirm-actions">
              <button className="fd-btn fd-btn-outline" onClick={() => setDeleteTarget(null)} disabled={deletingRound}>
                Keep round
              </button>
              <button className="fd-btn fd-btn-danger" onClick={handleDeleteRound} disabled={deletingRound}>
                {deletingRound ? 'Deleting…' : 'Delete round'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Posted-to-ledger confirmation. The invoice number is the
          customer-facing artefact, so it leads. */}
      {settledInvoice && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Bill settled">
          <div className="fd-invoice-modal">
            <div className="fd-invoice-tick">✓</div>
            <h3>{settledInvoice.balanceDue > 0 ? 'Partial payment recorded' : 'Posted to ledger'}</h3>
            {/* The token OUTRANKS the invoice number here. The customer is
                standing at the counter waiting to be told a number; the invoice
                is for the books. Nobody can call a token that was never shown
                to the person taking the money. */}
            {settledInvoice.tokenLabel && (
              <div className="fd-invoice-token">
                <span>Token</span>
                <strong>{settledInvoice.tokenLabel}</strong>
                <em>Tell the customer this number</em>
              </div>
            )}
            {settledInvoice.transactionNo && (
              <div className="fd-invoice-no">
                <span>Invoice</span>
                <strong>{settledInvoice.transactionNo}</strong>
              </div>
            )}
            <div className="fd-invoice-total">₹{money(settledInvoice.total)}</div>
            <ul className="fd-invoice-tenders">
              {settledInvoice.tenders.map((t, i) => (
                <li key={i}>
                  <span>{t.mode}</span>
                  <span>
                    ₹{money(t.amount)}
                    {t.refNo ? <em> · ref {t.refNo}</em> : null}
                  </span>
                </li>
              ))}
            </ul>
            {settledInvoice.balanceDue > 0 && (
              <div className="fd-settle-warn" role="alert">
                ₹{money(settledInvoice.balanceDue)} still outstanding on this bill.
              </div>
            )}
            <button className="fd-btn fd-btn-success" onClick={() => setSettledInvoice(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Settle Bill modal */}
      {settleOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
          padding: 16, boxSizing: 'border-box'
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: '100%', maxWidth: 420, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxSizing: 'border-box', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Settle Bill</h3>

            {/* The full bill being settled: every round, item-wise GST and the
                pre-discount grand total. */}
            <BillSummary rounds={sessionRounds} title="Bill" defaultOpenBreakup />

            <div className="fd-settle-form" style={{ marginTop: 16 }}>
              {/* ── Tenders ────────────────────────────────────────────────
                  One row per way the customer paid. Each becomes a
                  paymentbreakup in the ledger, so a split settlement is
                  recorded rather than flattened into a single "paid". */}
              <div className="fd-tenders">
                <div className="fd-tenders-head">
                  <label>Payments</label>
                  <button
                    type="button" className="fd-link-btn"
                    onClick={() => addTender()}
                    disabled={paymentModes.length === 0}
                  >
                    + Add payment
                  </button>
                </div>

                {paymentModes.length === 0 ? (
                  <div className="fd-tender-empty fd-tender-nomodes" role="alert">
                    No payment modes set up for this outlet. Add Cash / Card / UPI under{' '}
                    <b>Master Data → Payment Modes</b>, then reopen Settle.
                  </div>
                ) : tenders.length === 0 ? (
                  <div className="fd-tender-empty">No payment added yet.</div>
                ) : null}

                {tenders.map((t) => (
                  <div className="fd-tender-row" key={t.key}>
                    <select
                      aria-label="Payment mode"
                      value={t.paymentModeId}
                      onChange={(e) => updateTender(t.key, { paymentModeId: e.target.value })}
                    >
                      {paymentModes.map((m) => (
                        <option key={m.id || m.Id} value={m.id || m.Id}>{m.Type || m.type}</option>
                      ))}
                    </select>
                    <input
                      type="number" min="0" step="0.01"
                      aria-label="Amount"
                      value={t.amount}
                      onChange={(e) => updateTender(t.key, { amount: e.target.value })}
                    />
                    {/* Reference only appears where reconciliation needs it, so
                        the cash path stays two taps. */}
                    {needsRef(t.paymentModeId) && (
                      <input
                        type="text"
                        aria-label="Reference number"
                        placeholder="Ref no."
                        value={t.refNo || ''}
                        onChange={(e) => updateTender(t.key, { refNo: e.target.value })}
                      />
                    )}
                    <button
                      type="button" className="fd-tender-remove"
                      aria-label="Remove payment"
                      onClick={() => removeTender(t.key)}
                    >×</button>
                  </div>
                ))}

                {/* Quick tender — the biggest speed win on a real till. */}
                {paymentModes.length > 0 && (
                <div className="fd-quick-tender">
                  <button type="button" onClick={() => { setTenders([]); addTender(payable) }}>
                    Exact ₹{money(payable)}
                  </button>
                  {[500, 1000, 2000]
                    .filter((n) => n > payable)
                    .slice(0, 2)
                    .map((n) => (
                      <button key={n} type="button" onClick={() => { setTenders([]); addTender(n) }}>
                        ₹{n}
                      </button>
                    ))}
                </div>
                )}
              </div>
              <div>
                <div className="fd-discount-head">
                  <label htmlFor="settle-discount">Discount</label>
                  {/* Whole bill or specific dishes. Both can apply at once — the
                      toggle only chooses which controls are on screen — and they
                      are stored and reported separately, because "we discounted
                      this dish" is a decision while "this dish's share of 10%
                      off" is an accounting artefact. */}
                  <div className="fd-discount-mode" role="group" aria-label="Discount scope">
                    <button
                      type="button"
                      className={discountMode === 'bill' ? 'is-active' : ''}
                      aria-pressed={discountMode === 'bill'}
                      onClick={() => setDiscountMode('bill')}
                    >
                      Whole bill
                    </button>
                    <button
                      type="button"
                      className={discountMode === 'item' ? 'is-active' : ''}
                      aria-pressed={discountMode === 'item'}
                      onClick={() => setDiscountMode('item')}
                    >
                      Per item
                    </button>
                  </div>
                </div>

                {discountMode === 'item' && (
                  <div className="fd-item-discounts">
                    {settleLines.length === 0 ? (
                      <div className="fd-tender-empty">No priceable lines to discount.</div>
                    ) : settleLines.map((l) => {
                      const current = lineDiscounts[l.ref] || { type: 'amount', value: '' }
                      // Keep the draft exactly as typed — including a blank
                      // value under a chosen ₹/%. Pricing reads
                      // activeLineDiscounts, which ignores blanks, so an
                      // in-progress row still discounts nothing.
                      const setFor = (patch) => setLineDiscounts((prev) => ({
                        ...prev,
                        [l.ref]: { ...(prev[l.ref] || current), ...patch },
                      }))
                      return (
                        <div className="fd-item-discount-row" key={l.ref}>
                          <span className="fd-item-discount-name">
                            {settleLineLabels[l.ref] || 'Item'}
                            <span className="fd-bill-gst-qty">×{l.quantity}</span>
                          </span>
                          <div className="fd-discount-toggle" role="group" aria-label={`Discount type for ${settleLineLabels[l.ref] || 'item'}`}>
                            <button
                              type="button"
                              className={current.type === 'amount' ? 'is-active' : ''}
                              aria-pressed={current.type === 'amount'}
                              onClick={() => setFor({ type: 'amount' })}
                            >₹</button>
                            <button
                              type="button"
                              className={current.type === 'percent' ? 'is-active' : ''}
                              aria-pressed={current.type === 'percent'}
                              onClick={() => setFor({ type: 'percent' })}
                            >%</button>
                          </div>
                          <input
                            type="number"
                            min="0"
                            max={current.type === 'percent' ? 100 : undefined}
                            step={current.type === 'percent' ? 1 : 0.01}
                            aria-label={
                              `Discount for ${settleLineLabels[l.ref] || 'item'}`
                              + ` (${current.type === 'percent' ? 'percent' : 'rupees'})`
                            }
                            placeholder={current.type === 'percent' ? '0%' : '0'}
                            value={current.value}
                            onChange={(e) => setFor({ value: e.target.value })}
                          />
                          {/* What it actually took off, from the server quote.
                              A percentage means nothing to a cashier until it
                              is a rupee figure, and this is the only place the
                              two can be checked against each other. */}
                          <span className="fd-item-discount-off">
                            {lineDiscountOff[l.ref] > 0 ? `−₹${money(lineDiscountOff[l.ref])}` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Only in bill mode. Two ₹/% toggles on screen at once — one
                    per dish, one for the bill — read as one broken control, and
                    a cashier discounting a single dish would flip the wrong
                    one. A bill discount typed earlier still applies; the note
                    below says so rather than letting it vanish silently. */}
                {discountMode === 'item' && billDiscountAmount > 0 && (
                  <small className="fd-settle-note">
                    A whole-bill discount of −₹{money(billDiscountAmount)} is still applied.
                    Switch to Whole bill to change it.
                  </small>
                )}

                {discountMode === 'bill' && (
                <>
                <div className="fd-discount-field">
                  {/* Choose how the value is read: a flat ₹ amount or a % of the
                      subtotal. The suffix and max adjust to match. */}
                  <div className="fd-discount-toggle" role="group" aria-label="Amount or percent">
                    <button
                      type="button"
                      className={settleDiscountType === 'amount' ? 'is-active' : ''}
                      aria-pressed={settleDiscountType === 'amount'}
                      onClick={() => setSettleDiscountType('amount')}
                    >
                      ₹
                    </button>
                    <button
                      type="button"
                      className={settleDiscountType === 'percent' ? 'is-active' : ''}
                      aria-pressed={settleDiscountType === 'percent'}
                      onClick={() => setSettleDiscountType('percent')}
                    >
                      %
                    </button>
                  </div>
                  <div className="fd-discount-input">
                    <input
                      id="settle-discount"
                      type="number"
                      min="0"
                      max={settleDiscountType === 'percent' ? 100 : undefined}
                      step={settleDiscountType === 'percent' ? 1 : 0.01}
                      value={settleDiscount}
                      onChange={(e) => setSettleDiscount(e.target.value)}
                      placeholder="0"
                    />
                    <span className="fd-discount-suffix">
                      {settleDiscountType === 'percent' ? '%' : '₹'}
                    </span>
                  </div>
                </div>
                <small className="fd-settle-note">
                  {/* The BILL share, not settleTotals.discount — that is the
                      item and bill discounts combined, so quoting it here
                      overstated what the percentage had done. */}
                  {settleDiscountType === 'percent'
                    ? `${Number(settleDiscount) || 0}% of the subtotal = −₹${money(billDiscountAmount)}, applied before tax.`
                    : 'Applied before tax — the discount reduces the taxable amount.'}
                </small>
                </>
                )}
              </div>
            </div>

            {/* Payable — updates live as the discount changes. */}
            <div className="fd-settle-payable">
              <div className="fd-settle-payable-row">
                <span>Subtotal</span><span>₹{money(settleTotals.subTotal)}</span>
              </div>
              {/* Split out ONLY when both kinds apply. With one kind the split
                  would just restate the total on the row below it, and a
                  cashier reading two identical figures has to work out that
                  they are the same number. */}
              {itemDiscountAmount > 0 && billDiscountAmount > 0 && (
                <>
                  <div className="fd-settle-payable-row fd-settle-discount fd-settle-payable-sub">
                    <span>Item discounts</span><span>−₹{money(itemDiscountAmount)}</span>
                  </div>
                  <div className="fd-settle-payable-row fd-settle-discount fd-settle-payable-sub">
                    <span>Bill discount</span><span>−₹{money(billDiscountAmount)}</span>
                  </div>
                </>
              )}
              {settleTotals.discount > 0 && (
                <div className="fd-settle-payable-row fd-settle-discount">
                  <span>Discount</span><span>−₹{money(settleTotals.discount)}</span>
                </div>
              )}
              {settleTotals.taxByComponent.map((c) => (
                <div className="fd-settle-payable-row fd-settle-payable-sub" key={c.name}>
                  <span>{c.name}{c.rate ? ` @ ${c.rate}%` : ''}</span><span>₹{money(c.amount)}</span>
                </div>
              ))}
              <div className="fd-settle-payable-row">
                <span>Tax</span><span>₹{money(settleTotals.tax)}</span>
              </div>
              {/* The paise the till cannot hand over. Shown here because the
                  invoice books it as RoundOff, and a cashier who is asked for
                  ₹639.00 on a ₹638.88 bill needs to see where the 12p came
                  from — the alternative is being 12p short and not knowing. */}
              {settleTotals.roundOff !== 0 && (
                <div className="fd-settle-payable-row fd-settle-payable-sub">
                  <span>Round off</span>
                  <span>
                    {settleTotals.roundOff < 0 ? '−' : '+'}₹{money(Math.abs(settleTotals.roundOff))}
                  </span>
                </div>
              )}
              <div className="fd-settle-payable-row fd-settle-payable-grand">
                <span>Amount Payable</span><span>₹{money(settleTotals.payable)}</span>
              </div>
              {/* Balance due is the hero: red while short, green when covered.
                  Cashiers work to this number, so it gets the emphasis. */}
              <div className={`fd-settle-balance ${balanceDue > 0 ? 'is-short' : 'is-ok'}`}>
                <div className="fd-settle-payable-row">
                  <span>Tendered</span><span>₹{money(tendered)}</span>
                </div>
                <div className="fd-settle-payable-row fd-settle-balance-row">
                  <span>{balanceDue > 0 ? 'Balance Due' : changeDue > 0 ? 'Change' : 'Balance Due'}</span>
                  <span>₹{money(balanceDue > 0 ? balanceDue : changeDue)}</span>
                </div>
              </div>
            </div>

            {/* Settling is still allowed — a drink poured at the counter never
                needs a ticket — but a round the kitchen never saw must not slip
                past silently. */}
            {unsentRounds.length > 0 && (
              <div className="fd-settle-warn is-soft" role="status">
                {unsentRounds.length === 1 ? 'Round' : 'Rounds'}{' '}
                {unsentRounds.map((r) => r.round).join(', ')}{' '}
                {unsentRounds.length === 1 ? 'was' : 'were'} never sent to the kitchen.
                Settle anyway if that is intended.
              </div>
            )}

            {/* Say WHY settling is blocked rather than showing a mute button. */}
            {missingRef && (
              <div className="fd-settle-warn" role="alert">
                Enter a reference number for card, UPI and wallet payments.
              </div>
            )}
            {balanceDue > 0 && tenders.length > 0 && (
              <div className="fd-settle-warn" role="alert">
                ₹{money(balanceDue)} still due — settling now records a partial payment.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                className="fd-btn fd-btn-success"
                onClick={handleSettleBill}
                disabled={settling || tenders.length === 0 || missingRef}
              >
                {settling
                  ? 'Settling...'
                  : balanceDue > 0
                    ? `Save Partial ₹${money(tendered)}`
                    : `Settle & Post ₹${money(settleTotals.payable)}`}
              </button>
              <button className="fd-btn fd-btn-outline" onClick={() => setSettleOpen(false)} disabled={settling}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Billing
