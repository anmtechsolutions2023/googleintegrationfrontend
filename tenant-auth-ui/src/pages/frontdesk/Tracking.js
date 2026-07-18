import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { APP_CONFIG } from '../../constants'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

const STAGES = ['New', 'Accepted', 'Processing', 'Out for Delivery', 'Delivered', 'Cancelled']

const stageIndex = (status) => {
  const s = (status || '').toLowerCase()
  if (s === 'new' || !s)           return 0
  if (s === 'accepted')            return 1
  if (s === 'processing')          return 2
  if (s === 'out for delivery')    return 3
  if (s === 'delivered')           return 4
  if (s === 'completed')           return 4
  if (s === 'cancelled')           return 5
  return 0
}

const ProgressBar = ({ status }) => {
  const idx = stageIndex(status)
  const cancelled = (status || '').toLowerCase() === 'cancelled'
  return (
    <div style={{ display: 'flex', gap: 0, marginTop: 10, flexWrap: 'nowrap', overflowX: 'auto' }}>
      {STAGES.slice(0, 5).map((stage, i) => (
        <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 60 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
            background: cancelled ? '#e74c3c' : i <= idx ? '#27ae60' : '#e1e5eb',
            border: '2px solid ' + (cancelled ? '#e74c3c' : i <= idx ? '#27ae60' : '#d0d4da'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 11, fontWeight: 700
          }}>
            {cancelled ? '✕' : i <= idx ? '✓' : i + 1}
          </div>
          <div style={{ fontSize: 10, color: '#7f8c8d', marginLeft: 4, marginRight: 4, whiteSpace: 'nowrap' }}>{stage}</div>
          {i < 4 && (
            <div style={{ flex: 1, height: 2, background: i < idx ? '#27ae60' : '#e1e5eb', minWidth: 8 }} />
          )}
        </div>
      ))}
    </div>
  )
}

const Tracking = () => {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('active')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await posService.getOnlineOrders({ limit: MAX_LIMIT })
      setOrders(data)
    } catch {
      toast.error('Failed to load tracking data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdvance = async (order) => {
    const id = order.id || order.Id
    const idx = stageIndex(order.Status)
    if (idx >= 4) return
    const nextStatus = STAGES[Math.min(idx + 1, 4)]
    try {
      await posService.updateOnlineOrder(id, { Status: nextStatus })
      toast.success(`Order moved to: ${nextStatus}`)
      load()
    } catch { toast.error('Failed to update order status') }
  }

  const filtered = orders.filter((o) => {
    const s = (o.Status || '').toLowerCase()
    if (filter === 'active')    return s !== 'delivered' && s !== 'cancelled' && s !== 'completed'
    if (filter === 'delivered') return s === 'delivered' || s === 'completed'
    if (filter === 'cancelled') return s === 'cancelled'
    return true
  })

  return (
    <div className="fd-crud-page">
      <h1>📍 Live Order Tracking</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['active', 'delivered', 'cancelled', 'all'].map((f) => (
          <button
            key={f}
            className={`fd-btn ${filter === f ? 'fd-btn-primary' : 'fd-btn-outline'}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button className="fd-btn fd-btn-outline" onClick={load} style={{ marginLeft: 'auto' }}>Refresh</button>
      </div>

      {loading ? (
        <div className="fd-loading">Loading orders...</div>
      ) : filtered.length === 0 ? (
        <div className="fd-empty">No orders in this category.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map((o) => {
            const oid = o.id || o.Id
            const idx = stageIndex(o.Status)
            const cancelled = (o.Status || '').toLowerCase() === 'cancelled'
            return (
              <div key={oid} style={{
                background: '#fff', borderRadius: 8, padding: 16,
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                borderLeft: `4px solid ${cancelled ? '#e74c3c' : idx >= 4 ? '#27ae60' : '#f39c12'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong style={{ fontSize: 14 }}>{o.Platform || 'Platform'} — #{o.ExternalRef || oid.slice(0, 8)}</strong>
                  <span style={{ fontSize: 12, color: '#7f8c8d' }}>
                    {o.CreatedOn ? new Date(o.CreatedOn).toLocaleTimeString() : ''}
                  </span>
                </div>
                <ProgressBar status={o.Status} />
                {!cancelled && idx < 4 && (
                  <div style={{ marginTop: 12 }}>
                    <button className="fd-btn fd-btn-success" onClick={() => handleAdvance(o)}>
                      Advance → {STAGES[Math.min(idx + 1, 4)]}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Tracking
