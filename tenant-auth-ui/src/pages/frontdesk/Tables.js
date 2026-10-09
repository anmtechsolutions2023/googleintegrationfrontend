import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { APP_CONFIG } from '../../constants'
import RoundsTimeline from '../../components/frontdesk/RoundsTimeline'
import { buildTableRounds } from '../../utils/posRounds'
import { statusLabel } from '../../utils/posStatus'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

// Live occupancy only. Tables are created, edited and deleted under
// Outlet → Floors & tables → Tables, beside the floors they belong to.

const Tables = () => {
  const [floors, setFloors]   = useState([])
  const [tables, setTables]   = useState([])
  const [orders, setOrders]   = useState([])
  const [activeFloor, setActiveFloor] = useState(null)
  const [loading, setLoading] = useState(true)

  // Table clicked for the round-by-round detail view
  const [detailTableId, setDetailTableId] = useState(null)

  const detailTable = useMemo(
    () => tables.find((t) => (t.id || t.Id) === detailTableId) || null,
    [tables, detailTableId],
  )
  const detailRounds = useMemo(
    () => buildTableRounds(orders, detailTableId),
    [orders, detailTableId],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // allSettled: the floor plan is the screen. Orders only mark which
      // tables are occupied, so a refused order list should cost the badges,
      // not the plan.
      const [f, t, o] = (await Promise.allSettled([
        // Without a limit the API returns its default page of 10.
        posService.getFloors({ limit: MAX_LIMIT }),
        posService.getTables({ limit: MAX_LIMIT }),
        posService.getOrders({ limit: MAX_LIMIT }),
      ])).map((r) => (r.status === 'fulfilled' ? r.value : null))

      if (f === null || t === null) toast.error('Failed to load floor/table data')
      setFloors(f || [])
      setTables(t || [])
      setOrders(o || [])
      if ((f || []).length > 0 && !activeFloor) setActiveFloor(f[0].id || f[0].Id)
    } catch {
      toast.error('Failed to load floor/table data')
    } finally {
      setLoading(false)
    }
  }, [activeFloor])

  useEffect(() => { load() }, []) // eslint-disable-line

  const visibleTables = activeFloor
    ? tables.filter((t) => t.FloorId === activeFloor)
    : tables

  const statusClass = (status) => {
    const s = (status || '').toLowerCase()
    if (s === 'occupied') return 'occupied'
    if (s === 'reserved') return 'reserved'
    return ''
  }

  if (loading) return <div className="fd-loading">Loading tables...</div>

  return (
    <div className="fd-tables-view">
      <div className="content-header">
        <h1>🪑 Tables</h1>
        <div className="content-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={load}>🔄 Refresh</button>
        </div>
      </div>


      <div className="fd-floor-tabs">
        <button
          className={`fd-floor-tab ${!activeFloor ? 'active' : ''}`}
          onClick={() => setActiveFloor(null)}
        >
          All Floors
        </button>
        {floors.map((f) => {
          const fid = f.id || f.Id
          return (
            <button
              key={fid}
              className={`fd-floor-tab ${activeFloor === fid ? 'active' : ''}`}
              onClick={() => setActiveFloor(fid)}
            >
              {f.Name || f.name}
            </button>
          )
        })}
      </div>

      {visibleTables.length === 0 ? (
        <div className="fd-empty">No tables found for this floor.</div>
      ) : (
        <div className="fd-table-grid">
          {visibleTables.map((t) => {
            const tid = t.id || t.Id
            const sc  = statusClass(t.Status)
            return (
              <div
                key={tid}
                className={`fd-table-card ${sc}`}
                onClick={() => setDetailTableId(tid)}
                title="View order rounds"
              >
                <div className="table-name">{t.Name || t.name}</div>
                {t.Capacity != null && (
                  <div className="table-cap">Capacity: {t.Capacity}</div>
                )}
                {t.Status && (
                  <div className="table-status">{statusLabel(t.Status)}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#7f8c8d' }}>
        <span style={{ display: 'inline-block', width: 14, height: 14, background: '#fff', border: '2px solid #e1e5eb', borderRadius: 3 }} /> Available
        <span style={{ display: 'inline-block', width: 14, height: 14, background: '#ffeaa7', border: '2px solid #f39c12', borderRadius: 3, marginLeft: 12 }} /> Occupied
        <span style={{ display: 'inline-block', width: 14, height: 14, background: '#dfe6e9', border: '2px solid #636e72', borderRadius: 3, marginLeft: 12 }} /> Reserved
      </div>

      {detailTable && (
        <div className="fd-modal-overlay" onClick={() => setDetailTableId(null)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fd-modal-header">
              <h3>
                🪑 {detailTable.Name || detailTable.name}
                {detailTable.Status ? ` (${statusLabel(detailTable.Status)})` : ''}
              </h3>
              <button className="fd-modal-close" onClick={() => setDetailTableId(null)}>✕</button>
            </div>
            <RoundsTimeline
              rounds={detailRounds}
              emptyMessage="This table has no active orders."
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default Tables
