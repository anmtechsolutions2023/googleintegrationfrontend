import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import OrderDetailModal from './OrderDetailModal'

/**
 * The unified order-linking mechanism.
 *
 * Mounted ONCE (in FrontDeskLayout). Any descendant can render an order number
 * as a link with <OrderNoLink orderId=... />, and the single modal this
 * provider owns opens over whatever screen the user was on.
 *
 * Why a provider rather than a modal per page: an order number appears in the
 * ledger, on the dashboard, in the token queue and in the finance reports. Each
 * page holding its own open-order state would be four copies of the same
 * wiring, and four chances for them to drift into behaving differently.
 */
const OrderLinkContext = createContext({ openOrder: () => {} })

export const useOrderLink = () => useContext(OrderLinkContext)

export const OrderLinkProvider = ({ children }) => {
  const [orderId, setOrderId] = useState(null)

  const openOrder = useCallback((id) => { if (id) setOrderId(id) }, [])
  const close = useCallback(() => setOrderId(null), [])

  // Memoised so every consumer does not re-render when the open order changes.
  const value = useMemo(() => ({ openOrder }), [openOrder])

  return (
    <OrderLinkContext.Provider value={value}>
      {children}
      <OrderDetailModal orderId={orderId} onClose={close} />
    </OrderLinkContext.Provider>
  )
}

/**
 * An order number, as a link.
 *
 * A real <button>, not a styled span: it is activated by keyboard, announced as
 * a control, and carries a label saying what it opens. Falls back to plain text
 * when there is no id to open — a number with nothing behind it must not look
 * clickable.
 *
 * @param {string} [orderId] - The round to open.
 * @param {React.ReactNode} [children] - Defaults to the order number itself.
 */
export const OrderNoLink = ({ orderId, children, label, className = '' }) => {
  const { openOrder } = useOrderLink()
  const text = children ?? label ?? '—'

  if (!orderId) return <span className={`fd-order-no ${className}`}>{text}</span>

  return (
    <button
      type="button"
      className={`fd-order-link ${className}`}
      onClick={() => openOrder(orderId)}
      title="View this order"
      aria-label={`View order ${typeof text === 'string' ? text : ''}`}
    >
      {text}
    </button>
  )
}

export default OrderLinkProvider
