import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'
import './dailyStock.css'

/**
 * Menu → Stock & units → Today's Counts.
 *
 * The morning ritual: how many of each tracked dish the kitchen made today.
 * Separate from Menu Master because it is a different job done by a different
 * person at a different time — Menu Master decides what a dish IS, this decides
 * how many there are of it before service.
 *
 * ONLY TRACKED DISHES APPEAR. A dish is tracked by turning on "Track daily
 * quantity" on its Menu Master row, and that is deliberate: the stricter rule —
 * no count entered means the dish is not sold — would otherwise apply to the
 * whole menu and every soft drink would go dark each morning.
 *
 * Four states come back from the server and this screen shows all four, because
 * "nobody set a count" and "we ran out" are different problems with different
 * fixes and an operator has to tell them apart at a glance.
 */

const todayISO = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const STATE_LABEL = {
  available: 'Available',
  sold_out: 'Sold out',
  unavailable: 'Not set today',
  unlimited: 'Untracked',
}

/** One dish's row. The input is uncontrolled until blur so typing is not laggy. */
const Row = ({ item, canWrite, onSave, onClear, busy }) => {
  const [draft, setDraft] = useState(
    item.prepared === null || item.prepared === undefined ? '' : String(item.prepared),
  )

  // Re-seed when the server's answer changes under us (another till sold one).
  useEffect(() => {
    setDraft(item.prepared === null || item.prepared === undefined ? '' : String(item.prepared))
  }, [item.prepared])

  const dirty = String(draft).trim() !== (
    item.prepared === null || item.prepared === undefined ? '' : String(item.prepared)
  )

  return (
    <tr className={`ds-row is-${item.stockState}`}>
      <td className="ds-name">{item.name}</td>
      <td>
        <span className={`ds-pill is-${item.stockState}`}>
          {STATE_LABEL[item.stockState] || item.stockState}
        </span>
      </td>
      <td className="ds-num">
        <label className="ds-vis-hidden" htmlFor={`prep-${item.itemMetaId}`}>
          Prepared today for {item.name}
        </label>
        <input
          id={`prep-${item.itemMetaId}`}
          type="number"
          min="0"
          inputMode="numeric"
          className="ds-input"
          value={draft}
          disabled={!canWrite || busy}
          placeholder="—"
          onChange={(e) => setDraft(e.target.value)}
        />
      </td>
      <td className="ds-num">{item.sold ?? '—'}</td>
      <td className="ds-num">
        <strong className={item.stockState === 'sold_out' ? 'ds-zero' : ''}>
          {item.remaining === null ? '∞' : item.remaining}
        </strong>
      </td>
      <td className="ds-actions">
        {canWrite && (
          <>
            <button
              type="button"
              className="fd-btn fd-btn-primary ds-btn"
              disabled={busy || !dirty || String(draft).trim() === ''}
              onClick={() => onSave(item, Number(draft))}
            >
              Save
            </button>
            <button
              type="button"
              className="fd-btn ds-btn"
              disabled={busy || item.prepared === null || item.prepared === undefined}
              onClick={() => onClear(item)}
              title="Removes today's count — the dish stops being sold until you set one again"
            >
              Clear
            </button>
          </>
        )}
      </td>
    </tr>
  )
}

const DailyStock = () => {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const { user } = useAuth() || {}

  // The same people the server lets write — see posdailystock.routes.
  const canWrite = hasScope(user, [
    SCOPES.TENANT_ADMIN, SCOPES.POS_CONFIG_WRITE, SCOPES.POS_OPS_WRITE,
  ])

  useEffect(() => {
    posService.getPosBranches()
      .then((list) => {
        const rows = Array.isArray(list) ? list : []
        setBranches(rows)
        setBranchId((cur) => cur || rows[0]?.Id || rows[0]?.id || '')
      })
      .catch(() => toast.error('Could not load outlets'))
  }, [])

  const load = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const res = await posService.getDailyStock(branchId, date)
      setItems(Array.isArray(res?.items) ? res.items : [])
    } catch {
      toast.error('Could not load today\'s counts')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [branchId, date])

  useEffect(() => { load() }, [load])

  const save = async (item, qty) => {
    setBusyId(item.itemMetaId)
    try {
      const updated = await posService.setDailyStock(branchId, item.itemMetaId, qty, date)
      setItems((list) => list.map((i) => (
        i.itemMetaId === item.itemMetaId ? { ...i, ...updated } : i
      )))
      toast.success(`${item.name}: ${qty} prepared`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save that count')
    } finally {
      setBusyId('')
    }
  }

  const clear = async (item) => {
    setBusyId(item.itemMetaId)
    try {
      const updated = await posService.clearDailyStock(branchId, item.itemMetaId, date)
      setItems((list) => list.map((i) => (
        i.itemMetaId === item.itemMetaId
          ? { ...i, ...updated, prepared: null, sold: null, remaining: 0 }
          : i
      )))
      toast.info(`${item.name} is no longer available today`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not clear that count')
    } finally {
      setBusyId('')
    }
  }

  const unset = items.filter((i) => i.stockState === 'unavailable').length
  const out = items.filter((i) => i.stockState === 'sold_out').length

  return (
    <div className="fd-crud-page ds-page">
      <h1>Today&apos;s Counts</h1>
      <p className="ds-sub">
        How many of each tracked dish the kitchen made. A dish with no count is not
        sold — set one before service, or turn its tracking off under{' '}
        <b>Menu Master</b>.
      </p>

      <div className="fd-token-toolbar">
        <label htmlFor="ds-branch">Outlet</label>
        <select id="ds-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName || b.Name}</option>
          ))}
        </select>
        <label htmlFor="ds-date">Day</label>
        <input id="ds-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" className="fd-btn" onClick={load} disabled={loading}>Refresh</button>
      </div>

      {(unset > 0 || out > 0) && !loading && (
        <div className="ds-alert" role="status">
          {unset > 0 && <span><b>{unset}</b> {unset === 1 ? 'dish has' : 'dishes have'} no count today and will not be sold. </span>}
          {out > 0 && <span><b>{out}</b> sold out.</span>}
        </div>
      )}

      {loading && <div className="fd-empty">Loading…</div>}

      {!loading && items.length === 0 && (
        <div className="fd-empty">
          No dish on this outlet is tracked yet. Turn on <b>Track daily quantity</b> on a
          dish under <b>Menu → Menu Master</b>, and it will appear here.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                <th>Dish</th><th>State</th><th className="ds-num">Prepared</th>
                <th className="ds-num">Sold</th><th className="ds-num">Left</th><th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <Row
                  key={i.itemMetaId}
                  item={i}
                  canWrite={canWrite}
                  busy={busyId === i.itemMetaId}
                  onSave={save}
                  onClear={clear}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canWrite && items.length > 0 && (
        <p className="ds-sub">You can see the counts but not change them.</p>
      )}
    </div>
  )
}

export default DailyStock
