import React, { useEffect, useState, useCallback, useMemo } from 'react'
import posService from '../../services/posService'
import { normalizeStatus } from '../../utils/posStatus'
import { APP_CONFIG } from '../../constants'
import { businessDate as today } from '../../utils/businessDate'
import { usePosBranch } from '../../hooks/usePosBranch'
import './tokenDisplay.css'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

// Faster than the counter's own screen. This one faces a customer who is
// watching it to know when to walk up, so a called number that takes fifteen
// seconds to appear is a customer who has already asked the cashier.
const POLL_MS = 5000

// The display PC is left running; it has to come back up on the same queue
// after a reboot rather than on whichever branch sorts first.
const BRANCH_KEY = 'fd.tokens.display.branch'


/**
 * The screen that faces the customer.
 *
 * Deliberately outside the Front Desk layout: no sidebar, no page chrome, no
 * navigation. It is a sign, not a page — the only thing on it is which numbers
 * are ready and which are still cooking.
 */
const TokenDisplay = () => {
  const [tokens, setTokens] = useState([])
  const [failed, setFailed] = useState(false)
  const { branches, branchId, setBranchId, branchesLoaded } = usePosBranch(BRANCH_KEY)

  // Falls back to every branch's queue when no branch could be resolved — a
  // sign showing nothing is worse than a sign showing one outlet too many.
  const load = useCallback(async () => {
    if (!branchesLoaded) return
    try {
      const data = await posService.getTokens({
        ...(branchId ? { branchId } : {}), date: today(), limit: MAX_LIMIT,
      })
      setTokens(data)
      setFailed(false)
    } catch {
      // Keep showing the last known board. A blank screen tells a waiting room
      // nothing, and the numbers on it were true a few seconds ago.
      setFailed(true)
    }
  }, [branchId, branchesLoaded])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  // Called = ready to collect, most recent first, because that is the number
  // being shouted right now. Waiting = still cooking, in issue order.
  const { called, waiting } = useMemo(() => {
    const isCalled = (t) => normalizeStatus(t.Status) === 'called'
    const isWaiting = (t) => normalizeStatus(t.Status) === 'waiting'
    return {
      called: tokens.filter(isCalled)
        .sort((a, b) => new Date(b.CalledAt || 0) - new Date(a.CalledAt || 0)),
      waiting: tokens.filter(isWaiting)
        .sort((a, b) => (a.TokenNumber || 0) - (b.TokenNumber || 0)),
    }
  }, [tokens])

  const [now, ...alsoReady] = called

  return (
    <div className="td-screen">
      <header className="td-head">
        <h1>Order Ready</h1>
        {/* Only when there is a choice to make. A single-branch outlet should
            not have a control on a customer-facing sign. */}
        {branches.length > 1 && (
          <select
            className="td-branch"
            value={branchId}
            aria-label="Branch"
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.Id || b.id} value={b.Id || b.id}>
                {b.BranchName || b.Name || b.Id}
              </option>
            ))}
          </select>
        )}
      </header>

      <main className="td-main">
        <section className="td-now" aria-live="polite">
          <h2>Now serving</h2>
          {now ? (
            <div className="td-now-number">{now.TokenLabel}</div>
          ) : (
            // Words, not a giant dash. At display size a lone em dash reads as
            // a grey slab — as though the screen had failed rather than as
            // "nothing is ready yet", which is the actual state.
            <div className="td-now-idle">
              {waiting.length > 0 ? 'Preparing your order' : 'No orders yet'}
            </div>
          )}
          {alsoReady.length > 0 && (
            <div className="td-also">
              <span>Also ready</span>
              <div className="td-also-list">
                {alsoReady.map((t) => (
                  <span className="td-chip is-ready" key={t.id || t.Id}>{t.TokenLabel}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="td-waiting">
          <h2>Preparing</h2>
          {waiting.length === 0 ? (
            <p className="td-waiting-empty">Nothing in the queue.</p>
          ) : (
            <div className="td-waiting-list">
              {waiting.map((t) => (
                <span className="td-chip" key={t.id || t.Id}>{t.TokenLabel}</span>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Says the board is stale rather than pretending it is live. Small,
          because it is for staff, not for the room. */}
      {failed && (
        <div className="td-stale" role="status">
          Reconnecting — showing the last known board
        </div>
      )}
    </div>
  )
}

export default TokenDisplay
