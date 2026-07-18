// Chronological "rounds" for a table's active dine-in session.
//
// Frontend-only model (no backend/schema change): a table's active session is
// the set of its open (non-closed) orders; each open order is one "round",
// numbered by creation time. Shared by Tables, KDS and Billing so all three
// screens present identical sequencing.

// Order Items may arrive as a JSON array or a JSON string — normalize to array.
export const parseOrderItems = (raw) => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return []
}

export const itemLabel = (item) =>
  item?.name || item?.Name || item?.ItemName || item?.itemName || 'Item'

export const itemQty = (item) =>
  Number(item?.qty ?? item?.Qty ?? item?.quantity ?? item?.Quantity ?? 1)

const orderTime = (o) => new Date(o?.CreatedOn || o?.createdAt || 0).getTime()

// An order still belongs to the live session until it is closed/settled.
export const isOpenOrder = (o) => {
  const s = (o?.Status || '').toLowerCase()
  return s !== 'closed' && s !== 'settled' && s !== 'cancelled'
}

// Build the ordered round list for a single table.
// Returns [{ round, orderId, orderNo, time, status, items, order }].
export const buildTableRounds = (orders, tableId) => {
  if (!tableId || !Array.isArray(orders)) return []
  return orders
    .filter((o) => o.TableId === tableId && isOpenOrder(o))
    .sort((a, b) => orderTime(a) - orderTime(b))
    .map((o, i) => ({
      round: i + 1,
      orderId: o.id || o.Id,
      orderNo: o.OrderNo,
      time: o.CreatedOn || o.createdAt || null,
      status: o.Status,
      items: parseOrderItems(o.Items),
      order: o,
    }))
}

export const formatRoundTime = (dt) => {
  if (!dt) return ''
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
