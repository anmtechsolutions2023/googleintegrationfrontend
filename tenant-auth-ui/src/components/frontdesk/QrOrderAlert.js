import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import qrService from '../../services/qrService'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'
import { ROUTES } from '../../constants/routes'
import './qr.css'

const POLL_MS = 15000

/** The scopes the review queue admits — mirrors SCOPE_SETS.POS_QR_ORDER_READ. */
export const QR_ORDER_READ_SCOPES = [
  SCOPES.POS_QR_READ, SCOPES.POS_QR_WRITE, SCOPES.POS_ORDER_READ, SCOPES.POS_ORDER_WRITE, SCOPES.TENANT_ADMIN,
]

/**
 * "N QR orders waiting" — shown on floor screens so a guest's order is never
 * sitting unseen. Renders nothing when there is nothing to review or the user
 * cannot see the queue.
 */
const QrOrderAlert = () => {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const allowed = hasScope(user, QR_ORDER_READ_SCOPES)
  const [pending, setPending] = useState([])

  useEffect(() => {
    if (!allowed) return undefined
    let alive = true
    const load = () => qrService.getPendingOrders()
      .then((list) => { if (alive) setPending(Array.isArray(list) ? list : []) })
      .catch(() => {})
    load()
    const id = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [allowed])

  // Not on the inbox itself — the list below already is the alert.
  if (!allowed || pending.length === 0 || pathname.startsWith(ROUTES.FRONTDESK_QR_ORDERS)) return null
  const first = pending[0]
  const n = pending.length

  return (
    <Link to={ROUTES.FRONTDESK_QR_ORDERS} className="fd-qr-alert">
      <span aria-hidden="true">🔔</span>
      <span>
        <strong>{n} QR order{n === 1 ? '' : 's'} waiting for review</strong>
        {' · '}Table {first.tableName}{first.customer?.name ? ` · ${first.customer.name}` : ''}
      </span>
      <span className="fd-btn fd-btn-primary fd-btn-sm" style={{ flex: 'none' }}>Review</span>
    </Link>
  )
}

export default QrOrderAlert
