import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import qrService from '../../services/qrService'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'
import { formatForDisplay } from '../../utils/phone'
import LineOptions from '../../components/frontdesk/LineOptions'
import '../../components/frontdesk/qr.css'

const POLL_MS = 15000

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const ago = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} min ago`
  return `${Math.floor(mins / 60)} h ${mins % 60} min ago`
}

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** The drawer where one guest order is accepted or rejected (S3). */
const ReviewDrawer = ({ order, canDecide, reasons, onClose, onDone }) => {
  const [mode, setMode] = useState('review')
  const [reasonId, setReasonId] = useState(reasons[0]?.id || '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const c = order.customer
  const visitNo = c ? c.visits + 1 : null

  const accept = async () => {
    setBusy(true)
    try {
      const res = await qrService.acceptOrder(order.id)
      toast.success(`Sent to the kitchen${res?.kot?.KotNo ? ` — KOT ${res.kot.KotNo}` : ''}. The guest now sees "In the kitchen".`)
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not accept the order.')
      if (err.response?.status === 409) onDone()
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (!reasonId) { toast.error('Choose a reason.'); return }
    setBusy(true)
    try {
      await qrService.rejectOrder(order.id, { reasonId, note: note.trim() })
      toast.info('Order rejected. The guest sees the reason on their phone.')
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reject the order.')
      if (err.response?.status === 409) onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fd-qr-drawer-backdrop" onClick={onClose}>
      <aside className="fd-qr-drawer" role="dialog" aria-modal="true" aria-label={`QR order for table ${order.tableName}`} onClick={(e) => e.stopPropagation()}>
        <div className="fd-qr-drawer-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="fd-qr-pill">QR ORDER</span>
              <h2>Table {order.tableName}{order.floorName ? ` · ${order.floorName}` : ''}</h2>
            </div>
            <div className="fd-qr-order-sub">{order.orderNo} · placed {ago(order.placedAt)}</div>
          </div>
          <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="fd-qr-drawer-body">
          {c && (
            <div className="fd-qr-customer">
              <div className="fd-qr-avatar" aria-hidden="true">{(c.name || '?').charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{c.name || 'Guest'}</strong>
                  <span className="fd-qr-verified">WhatsApp verified</span>
                </div>
                <div className="fd-qr-order-sub">
                  {[formatForDisplay(c.phone), `${ordinal(visitNo)} visit`, c.totalSpent > 0 ? `${money(c.totalSpent)} spent` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          )}

          <div className="fd-qr-lines">
            {order.items.map((l, i) => (
              <div key={i} className="fd-qr-line">
                <div>
                  <strong>{l.quantity} × {l.name}</strong>
                  <div><LineOptions line={l} showPrices={false} /></div>
                </div>
                <span>{money(l.grossAmount ?? (Number(l.price) || 0) * (Number(l.quantity) || 1))}</span>
              </div>
            ))}
            <div className="fd-qr-line" style={{ fontWeight: 700, borderBottom: 0 }}>
              <span>Total</span><span>{money(order.total)}</span>
            </div>
          </div>

          {order.cookingInstructions && (
            <div className="fd-qr-note"><strong>Order note:</strong> {order.cookingInstructions}</div>
          )}

          {mode === 'rejecting' && (
            <div className="fd-qr-reject">
              <label htmlFor="qr-reason">Reason (the guest sees this)</label>
              <select id="qr-reason" value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
                {reasons.length === 0 && <option value="">No reasons set up</option>}
                {reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <textarea rows={2} maxLength={200} placeholder="Optional note, e.g. Paneer Tikka is finished for tonight" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}

          {!canDecide && (
            <div className="fd-qr-note">You can see this order. Accepting or rejecting it needs order-taking access.</div>
          )}
        </div>

        {canDecide && (
          <div className="fd-qr-drawer-foot">
            {mode === 'review' ? (
              <>
                <button type="button" className="fd-btn fd-btn-outline" style={{ color: '#b03a2e', borderColor: '#b03a2e' }} onClick={() => setMode('rejecting')} disabled={busy}>Reject</button>
                <button type="button" className="fd-btn fd-btn-primary fd-qr-grow" onClick={accept} disabled={busy}>
                  {busy ? 'Sending…' : 'Accept and send to kitchen'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="fd-btn fd-btn-outline" onClick={() => setMode('review')} disabled={busy}>Back</button>
                <button type="button" className="fd-btn fd-btn-danger fd-qr-grow" onClick={reject} disabled={busy || !reasonId}>
                  {busy ? 'Rejecting…' : 'Reject order'}
                </button>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

/**
 * Orders guests placed from the QR code on their table, waiting for a decision.
 *
 * Nothing a guest orders is cooked until somebody here presses Accept, which
 * fires the KOT. Polls, oldest first, so the table waiting longest is on top.
 */
const QrOrders = () => {
  const { user } = useAuth()
  const canDecide = hasScope(user, [SCOPES.POS_ORDER_WRITE, SCOPES.POS_QR_WRITE, SCOPES.TENANT_ADMIN])

  const [orders, setOrders] = useState([])
  const [reasons, setReasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    try {
      const list = await qrService.getPendingOrders()
      setOrders(Array.isArray(list) ? list : [])
    } catch (err) {
      if (err.response?.status !== 401) toast.error(err.response?.data?.message || 'Could not load QR orders.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    qrService.getRejectionReasons().then((r) => setReasons(r || [])).catch(() => setReasons([]))
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const open = orders.find((o) => o.id === openId)

  return (
    <div className="fd-crud-page">
      <h1>QR Orders</h1>
      <p className="fd-page-sub">Orders guests placed from their table. Accept sends it to the kitchen; reject tells the guest why. Refreshes every 15 seconds.</p>

      {loading && <div className="fd-empty">Loading…</div>}
      {!loading && orders.length === 0 && <div className="fd-empty">No QR orders waiting. New ones appear here automatically.</div>}

      <div className="fd-qr-queue">
        {orders.map((o) => (
          <button key={o.id} type="button" className="fd-qr-order" onClick={() => setOpenId(o.id)}>
            <div>
              <div className="fd-qr-order-title">Table {o.tableName} · {o.customer?.name || 'Guest'}</div>
              <div className="fd-qr-order-sub">
                {o.items.reduce((s, l) => s + (Number(l.quantity) || 0), 0)} items · {money(o.total)} · {ago(o.placedAt)}
              </div>
            </div>
            <span className="fd-btn fd-btn-primary fd-btn-sm">Review</span>
          </button>
        ))}
      </div>

      {open && (
        <ReviewDrawer
          key={open.id}
          order={open}
          canDecide={canDecide}
          reasons={reasons}
          onClose={() => setOpenId(null)}
          onDone={() => { setOpenId(null); load() }}
        />
      )}
    </div>
  )
}

export default QrOrders
