import { useEffect, useState } from 'react'
import posService from '../services/posService'

/**
 * The branch a POS screen is working, remembered across reloads.
 *
 * Shared by the counter console and the customer token board so the two cannot
 * drift apart — they are the same queue seen from two sides, and a difference
 * in how they resolve "which branch" shows up as one screen having numbers the
 * other does not.
 *
 * The remembered id is VALIDATED against the branches that actually come back.
 * It used to be trusted:
 *
 *   setBranchId((cur) => cur || firstBranchId)
 *
 * which keeps any truthy stored value, including one belonging to a tenant the
 * user has since switched away from. localStorage is not cleared on logout or
 * on switchTenant, so that id survives both. The queue query then filters
 * `TenantId = <new> AND BranchDetailId = <old tenant's branch>`, matches
 * nothing, and the board reads "No orders yet" permanently — with no way back,
 * because the branch picker only renders when there is more than one branch.
 *
 * @param {string} storageKey - localStorage key for this screen's choice.
 * @returns {{branches: Array, branchId: string, setBranchId: Function, branchesLoaded: boolean}}
 */
export const usePosBranch = (storageKey) => {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState(() => localStorage.getItem(storageKey) || '')
  // Gates the first queue read so it does not fire once with no branch and
  // again a tick later with one.
  const [branchesLoaded, setBranchesLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    posService.getPosBranches()
      .then((list) => {
        if (cancelled) return
        const rows = Array.isArray(list) ? list : []
        setBranches(rows)
        const idOf = (b) => b?.Id || b?.id
        setBranchId((cur) => {
          // Keep the remembered branch only if it is still one of this
          // tenant's. Otherwise fall back to the first, exactly as a first-ever
          // visit would — a stale id is no more useful than no id.
          if (cur && rows.some((b) => idOf(b) === cur)) return cur
          const next = rows.length > 0 ? idOf(rows[0]) : ''
          // Drop the dead key rather than leaving it to be re-read next reload.
          if (next) localStorage.setItem(storageKey, next)
          else localStorage.removeItem(storageKey)
          return next
        })
      })
      .catch(() => { if (!cancelled) setBranches([]) })
      .finally(() => { if (!cancelled) setBranchesLoaded(true) })
    return () => { cancelled = true }
  }, [storageKey])

  useEffect(() => {
    if (branchId) localStorage.setItem(storageKey, branchId)
  }, [branchId, storageKey])

  return { branches, branchId, setBranchId, branchesLoaded }
}

export default usePosBranch
