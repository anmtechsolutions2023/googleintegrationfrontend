import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { APP_CONFIG } from '../../constants'
import RoundsTimeline from '../../components/frontdesk/RoundsTimeline'
import BillSummary from '../../components/frontdesk/BillSummary'
import TransferSheet from '../../components/frontdesk/TransferSheet'
import TableSelect from '../../components/frontdesk/TableSelect'
import { buildTableRounds, formatRoundTime } from '../../utils/posRounds'
import { summarizeSession, estimateAfterDiscount } from '../../utils/posBilling'

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

const itemName = (meta, detail) => {
  if (detail) return detail.Name || detail.name || meta.ItemDetailId || ''
  return meta.ItemDetailId || ''
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

// Generate order number
const nextOrderNo = () => `ORD-${Date.now().toString().slice(-6)}`
const nextBillNo  = () => `BILL-${Date.now().toString().slice(-6)}`
const nextKotNo   = () => `KOT-${Date.now().toString().slice(-6)}`

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
  const [cartItems, setCartItems] = useState([])
  const [menuSearch, setMenuSearch] = useState('')
  const [activeOrders, setActiveOrders] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState(null)

  // settle bill modal
  const [settleOpen, setSettleOpen] = useState(false)
  const [settleDiscount, setSettleDiscount] = useState(0)
  // How the discount value is interpreted: a flat ₹ amount or a % of the subtotal.
  const [settleDiscountType, setSettleDiscountType] = useState('amount')
  const [settleMethod, setSettleMethod] = useState('Cash')
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
      const [t, f, m, orders, v, k] = await Promise.all([
        posService.getTables(),
        posService.getFloors(),
        posService.getItemMeta(),
        posService.getOrders({ limit: MAX_LIMIT }),
        posService.getVariants(),
        posService.getKots({ limit: MAX_LIMIT }),
      ])
      setTables(t)
      setFloors(f)
      setMenu(m)
      setVariants(v || [])
      setKots(Array.isArray(k) ? k : [])
      const open = orders.filter((o) => (o.Status || '').toLowerCase() !== 'closed')
      setActiveOrders(open)

      // Fetch item details for all ItemDetailIds (to show names)
      const ids = [...new Set(m.map((x) => x.ItemDetailId).filter(Boolean))]
      if (ids.length > 0) {
        const details = {}
        await Promise.allSettled(ids.map(async (id) => {
          try {
            const d = await posService.getItemDetail(id)
            if (d) details[id] = d
          } catch {}
        }))
        setItemDetails(details)
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

  // Clicking a menu card adds it straight away unless it offers options, in
  // which case the picker opens first. Opting in is optional — Skip adds the
  // plain item.
  const handleMenuClick = (meta) => {
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

    if (lines.length === 0) { setQuote(null); return }

    let cancelled = false
    setQuoting(true)
    posService
      .quotePricing(lines)
      .then((res) => { if (!cancelled) setQuote(res) })
      // A failed quote must not block order taking — fall back to showing the
      // untaxed subtotal rather than wedging the till.
      .catch(() => { if (!cancelled) setQuote(null) })
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
  const sessionRounds = useMemo(
    () => buildTableRounds(activeOrders, selectedTable),
    [activeOrders, selectedTable],
  )

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
      })),
    ).filter((l) => l.costInfoId),
  [sessionRounds])

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
  const settleTotals = useMemo(() => {
    const value = Number(settleDiscount) || 0
    if (settleQuote?.totals) {
      const t = settleQuote.totals
      return {
        subTotal: sessionSummary.subTotal,
        discount: Number(t.discountAmount) || 0,
        taxable: Number(t.netAmount) || 0,
        tax: Number(t.taxAmount) || 0,
        payable: Number(t.grossAmount) || 0,
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
    return {
      subTotal: sessionSummary.subTotal,
      discount: est.discount,
      taxable: est.taxable,
      tax: est.tax,
      payable: est.total,
      taxByComponent: [],
      estimated: true,
    }
  }, [settleQuote, sessionSummary, settleDiscount, settleDiscountType])

  // Picking a table targets its latest round for KOT firing / context.
  useEffect(() => {
    if (!selectedTable) { setSelectedOrderId(null); return }
    const rounds = buildTableRounds(activeOrders, selectedTable)
    setSelectedOrderId(rounds.length ? rounds[rounds.length - 1].orderId : null)
  }, [selectedTable, activeOrders])

  // A round whose KOT is already in the kitchen — used to fire-once and to label.
  const isRoundFired = (r) => /fired/i.test(String(r?.status || ''))
  const selectedRound = sessionRounds.find((r) => r.orderId === selectedOrderId) || null
  const selectedFired = isRoundFired(selectedRound)

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
      const order = await posService.createOrder({
        OrderNo: nextOrderNo(),
        TableId: selectedTable,
        OrderType: 'Dine-in',
        Status: 'Active',
        Items: buildOrderItems(),
        SubTotal: subTotal,
        TaxAmount: taxAmount,
        Total: grandTotal,
        BranchDetailId: tableObj?.BranchDetailId || null,
      })
      const orderId = order.id || order.Id
      if (isFirst) {
        // First round opens the session and marks the table occupied
        await posService.updateTable(selectedTable, { Status: 'Occupied', CurrentOrderId: orderId })
      }
      toast.success(isFirst ? 'Order started (Round 1)' : `Added Round ${sessionRounds.length + 1}`)
      setCartItems([])
      setSelectedOrderId(orderId)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add round')
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

  const handleFireKot = async () => {
    if (!selectedOrderId) { toast.warn('Select an order first'); return }
    try {
      await posService.fireKot(selectedOrderId)
      toast.success('KOT fired to kitchen')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to fire KOT')
    }
  }

  const handleSettleBill = async () => {
    if (!selectedTable) { toast.warn('Select a table first'); return }
    if (sessionRounds.length === 0) { toast.warn('No active order to settle'); return }
    setSettling(true)
    try {
      // The server recomputes the bill from every round it covers and applies
      // the discount BEFORE tax, so no totals are calculated here. Sending
      // OrderIds is what lets it do that — OrderId alone only named round 1.
      //
      // The bill takes a flat ₹ discount, so a % is sent as the resolved rupee
      // amount the preview already computed — the raised bill then matches the
      // payable the cashier saw, with no server-side percent handling needed.
      const discount = Math.round((Number(settleTotals.discount) || 0) * 100) / 100
      const bill = await posService.createBill({
        BillNo: nextBillNo(),
        OrderIds: sessionRounds.map((r) => r.orderId),
        Discount: discount,
        Status: 'Pending',
        BranchDetailId: sessionRounds[0].order.BranchDetailId || null,
      })
      const billId = bill.id || bill.Id
      const payable = Number(bill.Total) || 0
      await posService.settleBill(billId, {
        Payments: [{ method: settleMethod, amount: payable }],
        Discount: discount,
      })
      // Close every round and free the table
      await Promise.all(sessionRounds.map((r) => posService.updateOrder(r.orderId, { Status: 'Closed' })))
      await posService.updateTable(selectedTable, { Status: 'Available', CurrentOrderId: null })
      toast.success('Bill settled successfully')
      setSettleOpen(false)
      setSettleDiscount(0)
      setSettleDiscountType('amount')
      setSelectedOrderId(null)
      setSelectedTable('')
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to settle bill')
    } finally {
      setSettling(false)
    }
  }

  if (loading) return <div className="fd-loading">Loading billing...</div>

  const kotNo = nextKotNo

  return (
    <div className="fd-billing">
      <h1>🧾 Billing &amp; KOT</h1>

      <div className="fd-billing-layout">
        {/* Menu panel */}
        <div className="fd-menu-panel">
          <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: '#2c3e50' }}>
            Menu Items
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
                  <div key={id} className="fd-menu-item-card" onClick={() => handleMenuClick(meta)}>
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

        {/* Cart / order panel */}
        <div className="fd-cart-panel">
          <h3>Order</h3>

          {/* Table selector — colour-coded by occupancy status */}
          <div className="fd-cart-table-selector">
            <label>Table</label>
            <TableSelect
              tables={tables}
              floors={floors}
              value={selectedTable}
              onChange={setSelectedTable}
            />
          </div>

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
                        Round {r.round} — {r.orderNo}{r.time ? ` (${formatRoundTime(r.time)})` : ''}{isRoundFired(r) ? ' · KOT ✓' : ''}
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
            </div>
          )}

          {/* Actions */}
          <div className="fd-cart-actions">
            <button
              className="fd-btn fd-btn-primary"
              onClick={handleAddRound}
              disabled={!selectedTable || cartItems.length === 0}
            >
              {sessionRounds.length > 0 ? `Add Round ${sessionRounds.length + 1}` : 'Start Order'}
            </button>
            <button
              className="fd-btn fd-btn-warning"
              onClick={handleFireKot}
              disabled={!selectedOrderId || selectedFired}
              title={selectedFired ? 'This round has already been sent to the kitchen' : undefined}
            >
              {selectedFired ? 'KOT Fired ✓' : 'Fire KOT'}
            </button>
            <button
              className="fd-btn fd-btn-outline"
              onClick={() => setTransferOpen(true)}
              disabled={sessionRounds.length === 0}
            >
              Transfer
            </button>
            <button
              className="fd-btn fd-btn-success"
              onClick={() => setSettleOpen(true)}
              disabled={sessionRounds.length === 0}
            >
              Settle Bill
            </button>
            {cartItems.length > 0 && (
              <button className="fd-btn fd-btn-outline" onClick={() => setCartItems([])}>
                Clear Cart
              </button>
            )}
          </div>
        </div>
      </div>

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
              {isRoundFired(deleteTarget)
                ? ' Its KOT has already fired — it will be pulled from the kitchen.'
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
              <div>
                <label htmlFor="settle-method">Payment Method</label>
                <select
                  id="settle-method"
                  value={settleMethod}
                  onChange={(e) => setSettleMethod(e.target.value)}
                >
                  {['Cash', 'Card', 'UPI', 'Wallet'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="settle-discount">Discount</label>
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
                  {settleDiscountType === 'percent'
                    ? `${Number(settleDiscount) || 0}% of the subtotal = −₹${money(settleTotals.discount)}, applied before tax.`
                    : 'Applied before tax — the discount reduces the taxable amount.'}
                </small>
              </div>
            </div>

            {/* Payable — updates live as the discount changes. */}
            <div className="fd-settle-payable">
              <div className="fd-settle-payable-row">
                <span>Subtotal</span><span>₹{money(settleTotals.subTotal)}</span>
              </div>
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
              <div className="fd-settle-payable-row fd-settle-payable-grand">
                <span>Amount Payable</span><span>₹{money(settleTotals.payable)}</span>
              </div>
              <div className="fd-settle-pay-method">via {settleMethod}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="fd-btn fd-btn-success" onClick={handleSettleBill} disabled={settling}>
                {settling ? 'Settling...' : `Confirm & Settle ₹${money(settleTotals.payable)}`}
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
