import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'
import useOrderQueue, { idOf, slaSecondsLeft } from '../../hooks/useOrderQueue'
import PortalStrip from '../../components/frontdesk/PortalStrip'
import OrderCard from '../../components/frontdesk/OrderCard'
import OrderDetailPanel from '../../components/frontdesk/OrderDetailPanel'
import RejectReasonDialog from '../../components/frontdesk/RejectReasonDialog'
import { statusLabel } from '../../utils/posStatus'

// The expo screen.
//
// ── What changed, and why ───────────────────────────────────────────────────
// This was a five-column table sorted by nothing in particular with a Refresh
// button. Aggregators enforce an accept SLA of about two minutes; a queue that
// only updates when somebody remembers to click Refresh drops orders, and the
// penalty is a rating hit and a suspended store.
//
// So three things are different: it groups by URGENCY rather than by portal
// (staff work the queue by what needs doing — a Zomato and a Swiggy order both
// due in 40 seconds belong next to each other), it updates itself, and it makes
// a noise when something arrives.
//
// It also absorbs what /frontdesk/tracking was doing. Two pages over one table
// that disagreed about the workflow was the bug; one page with two views is the
// fix — see the `grouping` toggle.

const TONE_COLOR = {
  danger: '#c0392b',
  warning: '#e67e22',
  success: '#1e8449',
  muted: '#7f8c8d',
}

// Stage view — what the tracking board used to draw, as a view of this queue
// rather than a second page over the same table.
const STAGES = ['new', 'accepted', 'processing', 'out for delivery']

/**
 * A short, unobtrusive tone when an order arrives.
 *
 * WebAudio rather than an audio file: no asset to ship, no autoplay policy to
 * fight (this is a user-gesture-adjacent context by the time it fires), and it
 * degrades to silence rather than an error on a browser that will not play it.
 * A missed order is worse than a missed beep, so the banner is the primary
 * signal and this only reinforces it.
 */
const useArrivalChime = () => {
  const ctxRef = useRef(null)
  return useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      if (!ctxRef.current) ctxRef.current = new Ctx()
      const ctx = ctxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.5)
    } catch {
      // Sound is a nicety; the banner is the signal that matters.
    }
  }, [])
}

const OnlineOrders = () => {
  // Watching the queue is offered on POS_OPS:READ so anyone minding the shop
  // can see it; accepting, rejecting or advancing needs WRITE. Unchanged from
  // before — no role gains or loses anything by this rewrite.
  const canDispatch = useCan(SCOPES.POS_OPS_WRITE)

  const [branches, setBranches] = useState([])
  // null means "we do not know yet which branch to show". The queue waits for a
  // real answer rather than asking about every branch and discarding it — the
  // pause switch and the SLA countdown are both per-branch, so a queue mixing
  // branches could not show either honestly anyway.
  const [branchId, setBranchId] = useState(null)
  const [mappings, setMappings] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [grouping, setGrouping] = useState('urgency')
  const [rejectTarget, setRejectTarget] = useState(null)
  const [busyOrderId, setBusyOrderId] = useState(null)
  const [busyPortalId, setBusyPortalId] = useState(null)

  const chime = useArrivalChime()
  const {
    orders, groups, loading, error, lastUpdated, unackedOrders, acknowledge, reload,
  } = useOrderQueue({ branchId: branchId || '', ready: branchId !== null })

  // ── Branches and portal mappings ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    posService.getPosBranches()
      .then((rows) => {
        if (cancelled) return
        setBranches(rows)
        // Default to the first branch rather than "all": the pause switch and
        // the SLA countdown are both per-branch, and a queue mixing branches
        // cannot show either honestly.
        setBranchId(rows.length ? (rows[0].Id || rows[0].id) : '')
      })
      .catch(() => {
        if (cancelled) return
        toast.error('Failed to load branches')
        // Unblock the queue anyway: not knowing the branch list is no reason to
        // leave a cashier staring at a spinner while orders time out.
        setBranchId('')
      })
    return () => { cancelled = true }
    // Intentionally once: the branch list does not change while the screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadMappings = useCallback(async () => {
    if (branchId === null) return
    try {
      const portals = await posService.getPortals({ limit: 100 })
      const perPortal = await Promise.all(
        portals.map((p) => posService.getPortalBranches(p.Id || p.id)
          .then((rows) => rows.map((r) => ({
            ...r,
            PortalId: p.Id || p.id,
            PortalName: p.Name,
            ColorHex: p.ColorHex,
            ShortCode: p.ShortCode,
          })))
          .catch(() => [])),
      )
      const flat = perPortal.flat()
      setMappings(branchId ? flat.filter((m) => m.BranchDetailId === branchId) : flat)
    } catch {
      // A portal strip that cannot load is not a reason to hide the queue —
      // the orders still need working.
      setMappings([])
    }
  }, [branchId])

  useEffect(() => { loadMappings() }, [loadMappings])

  // ── Arrival alert ─────────────────────────────────────────────────────────
  const unackedCount = unackedOrders.length
  const prevUnacked = useRef(0)
  useEffect(() => {
    if (unackedCount > prevUnacked.current) chime()
    prevUnacked.current = unackedCount
  }, [unackedCount, chime])

  // ── Actions ───────────────────────────────────────────────────────────────
  const selected = useMemo(
    () => orders.find((o) => idOf(o) === selectedId) || null,
    [orders, selectedId],
  )

  // Keeps the panel from pointing at nothing once an order leaves the queue.
  useEffect(() => {
    if (selectedId && !orders.some((o) => idOf(o) === selectedId)) setSelectedId(null)
  }, [orders, selectedId])

  const handleAccept = useCallback(async (order) => {
    const id = idOf(order)
    setBusyOrderId(id)
    try {
      const result = await posService.acceptOnlineOrder(id, {})
      toast.success(
        result?.Kot?.KotNo
          ? `Accepted — ${result.OrderNo} sent to the kitchen as ${result.Kot.KotNo}`
          : `Accepted as ${result?.OrderNo || 'an order'}`,
      )
      // The portal push is best-effort and never undoes the accept, so a
      // failure is worth saying out loud rather than swallowing.
      if (result?.PortalPush && result.PortalPush.pushed === false && result.PortalPush.detail) {
        toast.warn(`Order accepted, but the portal was not told: ${result.PortalPush.detail}`)
      }
      reload({ silent: true })
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to accept the order')
    } finally {
      setBusyOrderId(null)
    }
  }, [reload])

  const handleReject = useCallback(async (payload) => {
    const order = rejectTarget
    if (!order) return
    const id = idOf(order)
    setBusyOrderId(id)
    try {
      await posService.rejectOnlineOrder(id, payload)
      toast.success('Order rejected')
      setRejectTarget(null)
      reload({ silent: true })
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to reject the order')
    } finally {
      setBusyOrderId(null)
    }
  }, [rejectTarget, reload])

  const handleAdvance = useCallback(async (order, status) => {
    const id = idOf(order)
    setBusyOrderId(id)
    try {
      const result = await posService.setOnlineOrderStatus(id, { Status: status })
      toast.success(`Order moved to ${statusLabel(status)}`)
      // Delivering settles the bill through the existing posbill path. When
      // that fails the delivery still stands — the food arrived — so the
      // failure is surfaced rather than hidden behind a success toast.
      if (result?.Settlement && result.Settlement.settled === false) {
        toast.warn(`Delivered, but not settled: ${result.Settlement.error}`)
      }
      reload({ silent: true })
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update the order')
    } finally {
      setBusyOrderId(null)
    }
  }, [reload])

  const handleTogglePortal = useCallback(async (mapping, goOnline) => {
    const id = mapping.id || mapping.Id
    setBusyPortalId(id)
    try {
      await posService.setPortalBranchOnline(id, {
        IsOnline: goOnline,
        ...(goOnline ? {} : { PauseMinutes: 30 }),
      })
      toast.success(goOnline
        ? `${mapping.PortalName} is taking orders again`
        : `${mapping.PortalName} paused for 30 minutes`)
      loadMappings()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to change availability')
    } finally {
      setBusyPortalId(null)
    }
  }, [loadMappings])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  // This screen is operated standing up next to a printer.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
      if (rejectTarget) return

      const list = orders
      const index = list.findIndex((o) => idOf(o) === selectedId)

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = list[Math.min(index + 1, list.length - 1)] || list[0]
        if (next) setSelectedId(idOf(next))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = list[Math.max(index - 1, 0)] || list[0]
        if (prev) setSelectedId(idOf(prev))
      } else if ((e.key === 'a' || e.key === 'A') && canDispatch && selected
        && String(selected.Status).toLowerCase() === 'new') {
        e.preventDefault()
        handleAccept(selected)
      } else if ((e.key === 'r' || e.key === 'R') && canDispatch && selected
        && String(selected.Status).toLowerCase() === 'new') {
        e.preventDefault()
        setRejectTarget(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [orders, selectedId, selected, canDispatch, rejectTarget, handleAccept])

  const openCounts = useMemo(() => orders.reduce((acc, o) => {
    if (o.PortalId) acc[o.PortalId] = (acc[o.PortalId] || 0) + 1
    return acc
  }, {}), [orders])

  const renderCard = (order) => (
    <OrderCard
      key={idOf(order)}
      order={order}
      selected={idOf(order) === selectedId}
      canWrite={canDispatch && busyOrderId !== idOf(order)}
      onSelect={(o) => setSelectedId(idOf(o))}
      onAccept={handleAccept}
      onReject={setRejectTarget}
      onAdvance={handleAdvance}
    />
  )

  const visibleGroups = grouping === 'urgency'
    ? groups
    : STAGES.map((stage) => ({
      key: stage,
      label: statusLabel(stage),
      tone: 'muted',
      orders: orders.filter((o) => String(o.Status || '').toLowerCase() === stage),
    }))

  return (
    <div className="fd-crud-page" style={{ maxWidth: 1600, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1>🛒 Online Orders</h1>
        <p className="fd-page-sub">
          Live orders from every portal, grouped by what needs doing. Accepting one
          creates a POS order, sends it to the kitchen and — once delivered — bills it
          through the ledger like any other sale.
        </p>
      </div>

      {/* Persistent, never a toast: a missed toast is a missed order. */}
      {unackedCount > 0 && (
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, background: '#fdf0d5',
            border: '1px solid #f39c12', borderLeft: '4px solid #f39c12',
            borderRadius: 8, padding: '11px 16px', flexWrap: 'wrap',
          }}
        >
          <strong style={{ fontSize: 14, color: '#7a4a00' }}>
            {unackedCount} new order{unackedCount > 1 ? 's' : ''} need
            {unackedCount > 1 ? '' : 's'} accepting
          </strong>
          <span style={{ fontSize: 13, color: '#9a6a1f' }}>
            {unackedOrders.map((o) => `${o.PortalName || o.Platform} #${o.ExternalRef || ''}`).join(' · ')}
          </span>
          <button
            type="button"
            className="fd-btn fd-btn-outline"
            style={{ marginLeft: 'auto' }}
            onClick={acknowledge}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* The kill switch, above everything, one click away. */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 480px', minWidth: 0 }}>
          <PortalStrip
            mappings={mappings}
            openCounts={openCounts}
            busyId={busyPortalId}
            canWrite={canDispatch}
            onToggle={handleTogglePortal}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {branches.length > 1 && (
            <select
              aria-label="Branch"
              className="fd-btn fd-btn-outline"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName}</option>
              ))}
            </select>
          )}
          <div style={{ display: 'flex', border: '1px solid #d0d4da', borderRadius: 6, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setGrouping('urgency')}
              className={`fd-btn ${grouping === 'urgency' ? 'fd-btn-primary' : 'fd-btn-outline'}`}
              style={{ borderRadius: 0, border: 'none' }}
            >
              Queue
            </button>
            <button
              type="button"
              onClick={() => setGrouping('stage')}
              className={`fd-btn ${grouping === 'stage' ? 'fd-btn-primary' : 'fd-btn-outline'}`}
              style={{ borderRadius: 0, border: 'none' }}
            >
              Stages
            </button>
          </div>
          <button type="button" className="fd-btn fd-btn-outline" onClick={() => reload()}>
            Refresh
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) clamp(320px, 30%, 420px)',
          gap: 16,
          alignItems: 'start',
        }}
        className="fd-online-layout"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {loading && <div className="fd-loading">Loading the queue…</div>}

          {!loading && error && (
            <div className="fd-empty">
              Could not load the queue.{' '}
              <button type="button" className="fd-link-btn" onClick={() => reload()}>Try again</button>
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="fd-empty">Nothing waiting. New orders appear here on their own.</div>
          )}

          {!loading && !error && visibleGroups.map((group) => (
            group.orders.length > 0 && (
              <React.Fragment key={group.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '.5px', color: TONE_COLOR[group.tone] || '#7f8c8d',
                  }}
                  >
                    {group.label}
                  </span>
                  <span className="fd-badge fd-badge-closed">{group.orders.length}</span>
                  <div style={{ flex: 1, height: 1, background: '#e1e5eb' }} />
                </div>
                {group.orders.map(renderCard)}
              </React.Fragment>
            )
          ))}

          {!loading && !error && orders.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, paddingTop: 8,
              fontSize: 11.5, color: '#b2bec3', flexWrap: 'wrap',
            }}
            >
              <span><b style={{ color: '#7f8c8d' }}>A</b> accept</span>
              <span><b style={{ color: '#7f8c8d' }}>R</b> reject</span>
              <span><b style={{ color: '#7f8c8d' }}>↑ ↓</b> move through the queue</span>
              {lastUpdated && (
                <span style={{ marginLeft: 'auto' }}>
                  Updated {new Date(lastUpdated).toLocaleTimeString()}
                </span>
              )}
            </div>
          )}
        </div>

        <OrderDetailPanel
          order={selected}
          canWrite={canDispatch}
          busy={busyOrderId === selectedId}
          onAccept={handleAccept}
          onReject={setRejectTarget}
          onAdvance={handleAdvance}
        />
      </div>

      <RejectReasonDialog
        order={rejectTarget}
        busy={busyOrderId === idOf(rejectTarget || {})}
        onCancel={() => setRejectTarget(null)}
        onConfirm={handleReject}
      />
    </div>
  )
}

export { slaSecondsLeft }
export default OnlineOrders
