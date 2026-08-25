import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { statusLabel } from '../../utils/posStatus'
import { APP_CONFIG, SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

const statusBadge = (status) => {
  const s = (status || '').toLowerCase()
  const cls = s === 'delivered' || s === 'completed' ? 'active' : s === 'cancelled' ? 'closed' : 'pending'
  return <span className={`fd-badge fd-badge-${cls}`}>{statusLabel(status || 'new')}</span>
}

const OnlineOrders = () => {
  // The queue is offered on POS_OPS:READ so anyone minding the shop can watch
  // it; accepting, completing or cancelling an order needs WRITE.
  const canDispatch = useCan(SCOPES.POS_OPS_WRITE)
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await posService.getOnlineOrders({ limit: MAX_LIMIT })
      setOrders(data)
    } catch {
      toast.error('Failed to load online orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleStatus = async (order, newStatus) => {
    const id = order.id || order.Id
    try {
      await posService.updateOnlineOrder(id, { Status: newStatus })
      toast.success(`Order updated to ${newStatus}`)
      load()
    } catch { toast.error('Failed to update order') }
  }

  const filtered = filter === 'all' ? orders : orders.filter((o) =>
    (o.Status || '').toLowerCase() === filter
  )

  return (
    <div className="fd-crud-page">
      <h1>🛒 Online Orders</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all', 'new', 'processing', 'delivered', 'cancelled'].map((f) => (
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
        <div className="fd-loading">Loading online orders...</div>
      ) : filtered.length === 0 ? (
        <div className="fd-empty">No orders in this category.</div>
      ) : (
        <table className="fd-table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>External Ref</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const oid = o.id || o.Id
              const s = (o.Status || '').toLowerCase()
              return (
                <tr key={oid}>
                  <td><strong>{o.Platform || '—'}</strong></td>
                  <td>{o.ExternalRef || '—'}</td>
                  <td>{statusBadge(o.Status)}</td>
                  <td>{o.CreatedOn ? new Date(o.CreatedOn).toLocaleString() : '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {(!s || s === 'new') && canDispatch && (
                      <button className="fd-btn fd-btn-warning" onClick={() => handleStatus(o, 'processing')}>Accept</button>
                    )}
                    {s === 'processing' && canDispatch && (
                      <button className="fd-btn fd-btn-success" onClick={() => handleStatus(o, 'delivered')}>Delivered</button>
                    )}
                    {s !== 'cancelled' && s !== 'delivered' && s !== 'completed' && canDispatch && (
                      <button className="fd-btn fd-btn-danger" onClick={() => handleStatus(o, 'cancelled')}>Cancel</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default OnlineOrders
