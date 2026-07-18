import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { APP_CONFIG } from '../../constants'
import RoundsTimeline from '../../components/frontdesk/RoundsTimeline'
import TableSelect from '../../components/frontdesk/TableSelect'
import { buildTableRounds, formatRoundTime } from '../../utils/posRounds'

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

const taxPct = (meta) => {
  const prices = meta?.Prices
  if (Array.isArray(prices) && prices.length > 0) return Number(prices[0].tax || prices[0].Tax || 0)
  if (typeof prices === 'object' && prices !== null) return Number(prices.tax || prices.Tax || 0)
  return 0
}

// Generate order number
const nextOrderNo = () => `ORD-${Date.now().toString().slice(-6)}`
const nextBillNo  = () => `BILL-${Date.now().toString().slice(-6)}`
const nextKotNo   = () => `KOT-${Date.now().toString().slice(-6)}`

const Billing = () => {
  const [tables, setTables]     = useState([])
  const [floors, setFloors]     = useState([])
  const [menu, setMenu]         = useState([])
  const [itemDetails, setItemDetails] = useState({})
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
  const [settleMethod, setSettleMethod] = useState('Cash')
  const [settling, setSettling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, f, m, orders] = await Promise.all([
        posService.getTables(),
        posService.getFloors(),
        posService.getItemMeta(),
        posService.getOrders({ limit: MAX_LIMIT }),
      ])
      setTables(t)
      setFloors(f)
      setMenu(m)
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

  const addToCart = (meta) => {
    const id = meta.id || meta.Id
    setCartItems((prev) => {
      const existing = prev.find((c) => c.id === id)
      if (existing) return prev.map((c) => c.id === id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, {
        id,
        name: itemName(meta, itemDetails[meta.ItemDetailId]),
        price: itemPrice(meta),
        taxPct: taxPct(meta),
        qty: 1,
        meta,
      }]
    })
  }

  const changeQty = (id, delta) => {
    setCartItems((prev) => {
      const updated = prev.map((c) => c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c)
      return updated.filter((c) => c.qty > 0)
    })
  }

  const subTotal   = cartItems.reduce((s, c) => s + c.price * c.qty, 0)
  const taxAmount  = cartItems.reduce((s, c) => s + (c.price * c.qty * (c.taxPct / 100)), 0)
  const grandTotal = subTotal + taxAmount

  const buildOrderItems = () => cartItems.map((c) => ({
    id: c.id,
    name: c.name,
    price: c.price,
    qty: c.qty,
    taxPct: c.taxPct,
  }))

  // The selected table's active session, grouped into chronological rounds.
  const sessionRounds = useMemo(
    () => buildTableRounds(activeOrders, selectedTable),
    [activeOrders, selectedTable],
  )

  // Picking a table targets its latest round for KOT firing / context.
  useEffect(() => {
    if (!selectedTable) { setSelectedOrderId(null); return }
    const rounds = buildTableRounds(activeOrders, selectedTable)
    setSelectedOrderId(rounds.length ? rounds[rounds.length - 1].orderId : null)
  }, [selectedTable, activeOrders])

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
      // Aggregate every round of the table's session into a single bill
      const sessSub = sessionRounds.reduce((s, r) => s + (Number(r.order.SubTotal) || 0), 0)
      const sessTax = sessionRounds.reduce((s, r) => s + (Number(r.order.TaxAmount) || 0), 0)
      const sessTot = sessionRounds.reduce((s, r) => s + (Number(r.order.Total) || 0), 0)
      const discount = Number(settleDiscount) || 0
      const payable  = Math.max(0, sessTot - discount)
      const bill = await posService.createBill({
        BillNo: nextBillNo(),
        OrderId: sessionRounds[0].orderId,
        SubTotal: sessSub,
        TaxAmount: sessTax,
        Discount: discount,
        Total: payable,
        Status: 'Pending',
        BranchDetailId: sessionRounds[0].order.BranchDetailId || null,
      })
      const billId = bill.id || bill.Id
      await posService.settleBill(billId, {
        Payments: [{ method: settleMethod, amount: payable }],
        Discount: discount,
        Total: payable,
      })
      // Close every round and free the table
      await Promise.all(sessionRounds.map((r) => posService.updateOrder(r.orderId, { Status: 'Closed' })))
      await posService.updateTable(selectedTable, { Status: 'Available', CurrentOrderId: null })
      toast.success('Bill settled successfully')
      setSettleOpen(false)
      setSettleDiscount(0)
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
                const ft = (meta.FoodType || '').toLowerCase()
                return (
                  <div key={id} className="fd-menu-item-card" onClick={() => addToCart(meta)}>
                    {meta.FoodType && (
                      <span className={`food-type-badge ${ft.includes('veg') && !ft.includes('non') ? 'veg' : 'nonveg'}`}>
                        {meta.FoodType}
                      </span>
                    )}
                    <div className="item-name">{name || '(unnamed)'}</div>
                    {price > 0 && <div className="item-price">₹{price.toFixed(2)}</div>}
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
                        Round {r.round} — {r.orderNo}{r.time ? ` (${formatRoundTime(r.time)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fd-session-rounds">
                  <RoundsTimeline rounds={sessionRounds} />
                </div>
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
              <div key={c.id} className="fd-cart-row">
                <span className="ci-name">{c.name || '(item)'}</span>
                <div className="ci-qty-btns">
                  <button onClick={() => changeQty(c.id, -1)}>−</button>
                  <span className="ci-qty">{c.qty}</span>
                  <button onClick={() => changeQty(c.id, +1)}>+</button>
                </div>
                <span className="ci-price">₹{(c.price * c.qty).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          {cartItems.length > 0 && (
            <div className="fd-cart-totals">
              <div className="total-row"><span>Subtotal</span><span>₹{subTotal.toFixed(2)}</span></div>
              <div className="total-row"><span>Tax</span><span>₹{taxAmount.toFixed(2)}</span></div>
              <div className="total-row grand"><span>Total</span><span>₹{grandTotal.toFixed(2)}</span></div>
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
              disabled={!selectedOrderId}
            >
              Fire KOT
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

      {/* Settle Bill modal */}
      {settleOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 360, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Settle Bill</h3>
            <div className="fd-settle-form">
              <div>
                <label>Payment Method</label>
                <select value={settleMethod} onChange={(e) => setSettleMethod(e.target.value)}>
                  {['Cash', 'Card', 'UPI', 'Wallet'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Discount (₹)</label>
                <input type="number" min="0" value={settleDiscount} onChange={(e) => setSettleDiscount(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="fd-btn fd-btn-success" onClick={handleSettleBill} disabled={settling}>
                {settling ? 'Settling...' : 'Confirm & Settle'}
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
