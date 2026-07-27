import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { APP_CONFIG } from '../../constants'
import RoundsTimeline from '../../components/frontdesk/RoundsTimeline'
import { buildTableRounds, itemVariants } from '../../utils/posRounds'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

const Kitchen = () => {
  const [kots, setKots]       = useState([])
  const [orders, setOrders]   = useState([])
  const [tables, setTables]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('pending')

  // KOT card clicked → show the table's full round-by-round context
  const [detailTableId, setDetailTableId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [k, o, t] = await Promise.all([
        posService.getKots({ limit: MAX_LIMIT }),
        posService.getOrders({ limit: MAX_LIMIT }),
        posService.getTables({ limit: MAX_LIMIT }),
      ])
      setKots(k)
      setOrders(o)
      setTables(t)
    } catch {
      toast.error('Failed to load KOTs')
    } finally {
      setLoading(false)
    }
  }, [])

  const tableName = useCallback(
    (id) => {
      const t = tables.find((x) => (x.id || x.Id) === id)
      return t ? (t.Name || t.name) : id
    },
    [tables],
  )

  const detailRounds = useMemo(
    () => buildTableRounds(orders, detailTableId),
    [orders, detailTableId],
  )

  useEffect(() => { load() }, [load])

  const handleReady = async (kotId) => {
    try {
      await posService.markKotReady(kotId)
      toast.success('KOT marked as ready')
      load()
    } catch {
      toast.error('Failed to mark KOT ready')
    }
  }

  const statusClass = (status) => {
    const s = (status || '').toLowerCase()
    if (s === 'ready')    return 'ready'
    if (s === 'fired')    return 'fired'
    return 'pending'
  }

  const filtered = kots.filter((k) => {
    const s = (k.Status || '').toLowerCase()
    if (filter === 'pending') return s !== 'ready' && s !== 'delivered'
    if (filter === 'ready')   return s === 'ready'
    return true
  })

  const parseItems = (raw) => {
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return [] }
    }
    return []
  }

  return (
    <div className="fd-kitchen">
      <h1>👨‍🍳 Kitchen Display (KDS)</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['pending', 'ready', 'all'].map((f) => (
          <button
            key={f}
            className={`fd-btn ${filter === f ? 'fd-btn-primary' : 'fd-btn-outline'}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button className="fd-btn fd-btn-outline" onClick={load} style={{ marginLeft: 'auto' }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="fd-loading">Loading KOTs...</div>
      ) : filtered.length === 0 ? (
        <div className="fd-empty">No KOTs to display.</div>
      ) : (
        <div className="fd-kds-grid">
          {filtered.map((kot) => {
            const id = kot.id || kot.Id
            const sc = statusClass(kot.Status)
            const items = parseItems(kot.Items)
            return (
              <div
                key={id}
                className={`fd-kds-card status-${sc}`}
                onClick={() => kot.TableId && setDetailTableId(kot.TableId)}
                title={kot.TableId ? 'View order rounds for this table' : undefined}
              >
                <div className="fd-kds-header">
                  <span className="kot-no">KOT #{kot.KotNo}</span>
                  <span className={`fd-kds-status ${sc}`}>{kot.Status || 'Pending'}</span>
                </div>
                {kot.TableId && (
                  <div className="kot-table" style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 8 }}>
                    Table: {tableName(kot.TableId)}
                  </div>
                )}
                <ul className="fd-kds-items">
                  {items.length > 0 ? items.map((item, i) => (
                    <li key={i}>
                      <div className="kot-item-main">
                        {item.name || item.Name || item.ItemName || JSON.stringify(item)} × {item.qty || item.Qty || item.quantity || 1}
                      </div>
                      {/* Chosen options are cooking instructions — the kitchen
                          needs these more than anyone. */}
                      {itemVariants(item).length > 0 && (
                        <div className="kot-item-variants">
                          {itemVariants(item).map((v, vi) => (
                            <span className="ci-variant-chip" key={v.id || vi}>{v.name}</span>
                          ))}
                        </div>
                      )}
                    </li>
                  )) : (
                    <li style={{ color: '#aaa', fontStyle: 'italic' }}>No item details</li>
                  )}
                </ul>
                {kot.FiredAt && (
                  <div className="fd-kds-fired-at">
                    Fired: {new Date(kot.FiredAt).toLocaleTimeString()}
                  </div>
                )}
                {sc !== 'ready' && (
                  <button
                    className="fd-btn fd-btn-success"
                    style={{ width: '100%' }}
                    onClick={(e) => { e.stopPropagation(); handleReady(id) }}
                  >
                    Mark Ready
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {detailTableId && (
        <div className="fd-modal-overlay" onClick={() => setDetailTableId(null)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fd-modal-header">
              <h3>🪑 {tableName(detailTableId)} — Order Rounds</h3>
              <button className="fd-modal-close" onClick={() => setDetailTableId(null)}>✕</button>
            </div>
            <RoundsTimeline
              rounds={detailRounds}
              emptyMessage="No active orders for this table."
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default Kitchen
