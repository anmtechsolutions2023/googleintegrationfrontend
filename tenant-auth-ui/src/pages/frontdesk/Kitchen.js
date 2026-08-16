import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { APP_CONFIG } from '../../constants'
import RoundsTimeline from '../../components/frontdesk/RoundsTimeline'
import {
  buildTableRounds, buildRoundIndex, itemLabel, itemQty, itemVariants, formatRoundTime,
} from '../../utils/posRounds'
import { normalizeStatus, statusLabel, isKotPending } from '../../utils/posStatus'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

// The pass is a live surface — a cook does not think to press Refresh, and a
// ticket that arrives only when someone does is a ticket that arrives late.
const POLL_MS = 15000

const money = (n) => (Number(n) || 0).toFixed(2)

const Kitchen = () => {
  const [kots, setKots]       = useState([])
  const [orders, setOrders]   = useState([])
  const [tables, setTables]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('pending')

  // KOT card clicked → show that table's rounds, with this ticket's round marked.
  const [detail, setDetail] = useState(null) // { tableId, orderId }

  // Polling must not flash the loading state over a screen the kitchen is
  // reading; only the first load does.
  const loadedOnce = useRef(false)

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true)
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
      // A failed poll must not bury the pass in toasts.
      if (!loadedOnce.current) toast.error('Failed to load KOTs')
    } finally {
      loadedOnce.current = true
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const tableName = useCallback(
    (id) => {
      const t = tables.find((x) => (x.id || x.Id) === id)
      return t ? (t.Name || t.name) : id
    },
    [tables],
  )

  // Which round each order is, so a ticket can say "Round 2 · ORD-0007" instead
  // of just an opaque number. pos_kot.OrderId was always returned and the orders
  // were always loaded — nothing joined them.
  const roundIndex = useMemo(() => buildRoundIndex(orders), [orders])

  // Closed rounds are included: a table can be settled while its ticket is still
  // at the pass, and excluding them left this popup empty next to a tile that
  // was plainly still cooking.
  const detailRounds = useMemo(
    () => buildTableRounds(orders, detail?.tableId, { includeClosed: true }),
    [orders, detail],
  )

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
    const s = normalizeStatus(status)
    if (s === 'ready')     return 'ready'
    if (s === 'cancelled') return 'cancelled'
    return 'pending'
  }

  const filtered = kots.filter((k) => {
    if (filter === 'pending') return isKotPending(k)
    if (filter === 'ready')   return normalizeStatus(k.Status) === 'ready'
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

  // Clicking a ticket opens its table's rounds with this round marked. A
  // takeaway ticket has no table, so it opens on its own round rather than
  // doing nothing at all, which is what it used to do.
  const openDetail = (kot) => {
    const orderId = kot.OrderId || kot.orderId || null
    if (!kot.TableId && !orderId) return
    setDetail({ tableId: kot.TableId || null, orderId })
  }

  const singleRound = useMemo(() => {
    if (!detail || detail.tableId || !detail.orderId) return []
    const r = roundIndex.get(detail.orderId)
    return r ? [r] : []
  }, [detail, roundIndex])

  const shownRounds = detail?.tableId ? detailRounds : singleRound

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
            const round = roundIndex.get(kot.OrderId || kot.orderId)
            return (
              <div
                key={id}
                className={`fd-kds-card status-${sc}`}
                onClick={() => openDetail(kot)}
                title="View this table's order rounds"
              >
                <div className="fd-kds-header">
                  {/* The round is what a cook actually needs — which pass of this
                      table this is. The ticket number is reference, so it goes
                      underneath rather than headlining. */}
                  <span className="kot-round">
                    {round ? `Round ${round.round}` : 'Round —'}
                    {round?.orderNo && <span className="kot-orderno"> · {round.orderNo}</span>}
                  </span>
                  <span className={`fd-kds-status ${sc}`}>{statusLabel(kot.Status || 'pending')}</span>
                </div>

                <div className="fd-kds-submeta">
                  <span className="kot-no">{kot.KotNo}</span>
                  {kot.TableId && <span className="kot-table">Table: {tableName(kot.TableId)}</span>}
                </div>

                <ul className="fd-kds-items">
                  {items.length > 0 ? items.map((item, i) => (
                    <li key={i}>
                      <div className="kot-item-main">
                        {/* Shared helpers, so a tile and the popup can never
                            label the same line differently. They also replace a
                            JSON.stringify fallback that dumped raw JSON onto
                            the pass when a line had no name. */}
                        <span className="kot-item-qty">{itemQty(item)}x</span> {itemLabel(item)}
                      </div>
                      {/* Chosen options are cooking instructions — the kitchen
                          needs these more than anyone. Prices are shown because
                          the round view shows them, and a cook comparing the two
                          should see the same line twice, not two versions of it. */}
                      {itemVariants(item).length > 0 && (
                        <div className="kot-item-variants">
                          {itemVariants(item).map((v, vi) => (
                            <span className="ci-variant-chip" key={v.id || vi}>
                              {v.name}{Number(v.price) > 0 ? ` +₹${money(v.price)}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  )) : (
                    <li style={{ color: '#aaa', fontStyle: 'italic' }}>No item details</li>
                  )}
                </ul>

                <div className="fd-kds-times">
                  {round?.time && <span>Placed: {formatRoundTime(round.time)}</span>}
                  {kot.FiredAt && <span>Fired: {new Date(kot.FiredAt).toLocaleTimeString()}</span>}
                </div>

                {sc === 'pending' && (
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

      {detail && (
        <div className="fd-modal-overlay" onClick={() => setDetail(null)}>
          <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fd-modal-header">
              <h3>
                🪑 {detail.tableId ? tableName(detail.tableId) : 'Takeaway'} — Order Rounds
              </h3>
              <button className="fd-modal-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <RoundsTimeline
              rounds={shownRounds}
              highlightOrderId={detail.orderId}
              emptyMessage="No orders found for this ticket."
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default Kitchen
