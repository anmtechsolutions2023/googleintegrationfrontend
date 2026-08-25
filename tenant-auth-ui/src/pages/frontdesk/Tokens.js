import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { OrderNoLink } from '../../components/frontdesk/OrderLinkProvider'
import { statusLabel, normalizeStatus } from '../../utils/posStatus'
import { parseOrderItems, itemLabel, itemQty } from '../../utils/posRounds'
import { APP_CONFIG, SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'
import { businessDate as today } from '../../utils/businessDate'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

// The counter queue is a live surface — a token called on one till has to show
// up on the other, and on the customer display, without anyone pressing
// Refresh. Same cadence as the KDS.
const POLL_MS = 15000

// Remembered so a till comes back up on the queue it was working, rather than
// on whichever branch happens to sort first.
const BRANCH_KEY = 'fd.tokens.branch'


const money = (n) => (Number(n) || 0).toFixed(2)

const badgeClass = (status) => {
  const s = normalizeStatus(status)
  if (s === 'served') return 'settled'
  if (s === 'cancelled') return 'closed'
  return 'pending'
}

const Tokens = () => {
  // The queue is offered on POS_OPS:READ so a manager or the counter can watch
  // it. Issuing, calling and handing over move the queue and need WRITE.
  const canRunQueue = useCan(SCOPES.POS_OPS_WRITE)
  const [tokens, setTokens] = useState([])
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState(() => localStorage.getItem(BRANCH_KEY) || '')
  // Gates the first queue read so it does not fire once with no branch and
  // again a tick later with one.
  const [branchesLoaded, setBranchesLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [issuing, setIssuing] = useState(false)

  useEffect(() => {
    posService.getPosBranches()
      .then((list) => {
        setBranches(list)
        // One branch is the common case; making the cashier pick it would be
        // a question with one answer.
        setBranchId((cur) => cur || (list.length > 0 ? (list[0].Id || list[0].id) : ''))
      })
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoaded(true))
  }, [])

  useEffect(() => {
    if (branchId) localStorage.setItem(BRANCH_KEY, branchId)
  }, [branchId])

  // Today's queue, filtered on the server. This screen used to pull every token
  // the tenant had ever issued and keep today's in the browser, which stops
  // working on the first busy week.
  //
  // With no branch resolved it falls back to the whole tenant's queue rather
  // than showing nothing: a screen that reads "no tokens" when there are twelve
  // is worse than one that shows all twelve unfiltered.
  const load = useCallback(async (opts = {}) => {
    if (!branchesLoaded) return
    if (!opts.quiet) setLoading(true)
    try {
      const data = await posService.getTokens({
        ...(branchId ? { branchId } : {}), date: today(), limit: MAX_LIMIT,
      })
      setTokens(data)
    } catch {
      // A failed poll must not bury a working counter in toasts.
      if (!opts.quiet) toast.error('Failed to load tokens')
    } finally {
      setLoading(false)
    }
  }, [branchId, branchesLoaded])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const id = setInterval(() => load({ quiet: true }), POLL_MS)
    return () => clearInterval(id)
  }, [load])

  // Waiting first, then called, then everything already handed over: the top of
  // this list is the work still to do.
  const { waiting, called, done } = useMemo(() => {
    const group = { waiting: [], called: [], done: [] }
    tokens.forEach((t) => {
      const s = normalizeStatus(t.Status)
      if (s === 'waiting') group.waiting.push(t)
      else if (s === 'called') group.called.push(t)
      else group.done.push(t)
    })
    return group
  }, [tokens])

  const act = async (token, fn, message) => {
    const id = token.id || token.Id
    setBusyId(id)
    try {
      await fn(id)
      toast.info(`${message} ${token.TokenLabel}`)
      await load({ quiet: true })
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update the token')
    } finally {
      setBusyId(null)
    }
  }

  // A walk-in with nothing punched in yet — someone waiting for a table, or an
  // order taken on paper. The number still comes from the server: a browser
  // computing max+1 is what let two tills issue the same one.
  const handleIssueBlank = async () => {
    if (!branchId) { toast.warn('Pick a branch first'); return }
    setIssuing(true)
    try {
      const token = await posService.createToken({ BranchDetailId: branchId })
      toast.success(`Token ${token.TokenLabel} issued`)
      await load({ quiet: true })
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to issue token')
    } finally {
      setIssuing(false)
    }
  }

  const renderRow = (t) => {
    const id = t.id || t.Id
    const s = normalizeStatus(t.Status)
    const items = parseOrderItems(t.OrderItems)
    return (
      <tr key={id}>
        <td><strong className="fd-token-no">{t.TokenLabel}</strong></td>
        <td><span className={`fd-badge fd-badge-${badgeClass(t.Status)}`}>{statusLabel(t.Status)}</span></td>
        <td>
          {/* What #7 actually gets. A queue that cannot answer this is a number
              pad, which is what this screen used to be. */}
          {t.OrderNo ? (
            <>
              <OrderNoLink orderId={t.OrderId} className="fd-token-orderno">{t.OrderNo}</OrderNoLink>
              {items.length > 0 && (
                <span className="fd-token-items">
                  {items.map((it, i) => (
                    <span key={i}>{itemQty(it)}× {itemLabel(it)}</span>
                  ))}
                </span>
              )}
            </>
          ) : (
            <span className="fd-token-noorder">No order attached</span>
          )}
        </td>
        <td>{Number(t.OrderTotal) > 0 ? `₹${money(t.OrderTotal)}` : '—'}</td>
        <td>{t.CreatedOn ? new Date(t.CreatedOn).toLocaleTimeString() : '—'}</td>
        <td className="fd-token-actions">
          {s === 'waiting' && canRunQueue && (
            <button
              className="fd-btn fd-btn-warning fd-btn-sm"
              disabled={busyId === id}
              onClick={() => act(t, posService.callToken, 'Calling')}
            >
              Call
            </button>
          )}
          {s === 'called' && canRunQueue && (
            <button
              className="fd-btn fd-btn-outline fd-btn-sm"
              disabled={busyId === id}
              onClick={() => act(t, posService.callToken, 'Calling again —')}
            >
              Call again
            </button>
          )}
          {(s === 'waiting' || s === 'called') && canRunQueue && (
            <button
              className="fd-btn fd-btn-success fd-btn-sm"
              disabled={busyId === id}
              onClick={() => act(t, posService.serveToken, 'Handed over')}
            >
              Serve
            </button>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="fd-crud-page">
      <h1>🎫 Token Queue</h1>
      <p className="fd-page-sub">
        Counter orders for today. A token is issued automatically when a counter
        sale is paid for on the Billing screen.
      </p>

      <div className="fd-token-toolbar">
        <label htmlFor="tok-branch">Branch</label>
        <select
          id="tok-branch"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        >
          {/* Only when the list could not be resolved. The queue still works —
              it just shows every branch's tokens rather than one queue. */}
          {branches.length === 0 && <option value="">All branches</option>}
          {branches.map((b) => (
            <option key={b.Id || b.id} value={b.Id || b.id}>
              {b.BranchName || b.Name || b.Id}
            </option>
          ))}
        </select>
        <button className="fd-btn fd-btn-outline" onClick={() => load()}>Refresh</button>
        {canRunQueue && (
          <button
            className="fd-btn fd-btn-outline"
            onClick={handleIssueBlank}
            disabled={issuing || !branchId}
            title="For a walk-in with no order punched in yet"
          >
            {issuing ? 'Issuing…' : '+ Blank token'}
          </button>
        )}
        {/* The screen that faces the customer. Opened in its own window so it
            can live on a second monitor while the till keeps working. */}
        <Link
          className="fd-btn fd-btn-primary"
          to="/frontdesk/tokens/display"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open customer display ↗
        </Link>
      </div>

      {loading ? (
        <div className="fd-loading">Loading tokens...</div>
      ) : tokens.length === 0 ? (
        <div className="fd-empty">
          No tokens issued today. Take a counter order from Billing → Counter.
        </div>
      ) : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Status</th>
                <th>Order</th>
                <th>Total</th>
                <th>Issued</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...called, ...waiting, ...done].map(renderRow)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Tokens
