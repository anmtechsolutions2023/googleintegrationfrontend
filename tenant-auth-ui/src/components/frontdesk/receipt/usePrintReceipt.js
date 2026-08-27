import { useCallback, useEffect, useRef, useState } from 'react'
import posService from '../../../services/posService'

/**
 * Print a document.
 *
 * The format is fetched ONCE per branch and held. Fetching it at the moment
 * somebody presses Print would put a network round trip between the button and
 * the paper on the busiest screen in the building — and would mean a slow
 * settings call is a slow bill.
 *
 * A failed fetch is NOT a failed print. `format` stays null and the renderer
 * falls back to "print what exists, skip what does not" (utils/receiptFields).
 * A bill must still come out when a settings call is down.
 *
 * @param {string|null} branchId
 * @returns {{ job: Object|null, format: Object|null, shop: Object, print: Function, ready: boolean }}
 */
export const usePrintReceipt = (branchId) => {
  const [format, setFormat] = useState(null)
  const [job, setJob] = useState(null)
  const [ready, setReady] = useState(false)
  // Print must happen AFTER the receipt is in the DOM, and the cleanup must not
  // fire against a component that has since unmounted.
  const timer = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (!branchId) { setFormat(null); setReady(true); return undefined }
    setReady(false)
    posService.getReceiptFormat(branchId)
      .then((f) => { if (!cancelled) setFormat(f) })
      .catch(() => { if (!cancelled) setFormat(null) })
      .finally(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [branchId])

  const print = useCallback((doc, data) => setJob({ doc, data }), [])

  useEffect(() => {
    if (!job) return undefined
    // One frame for React to commit the portal, then print. Clearing the job
    // afterwards keeps the receipt out of the DOM between prints, so a stale
    // one can never end up on somebody else's paper.
    timer.current = setTimeout(() => {
      window.print()
      setJob(null)
    }, 60)
    return () => clearTimeout(timer.current)
  }, [job])

  return {
    job,
    format: job ? (format?.documents?.[job.doc] || null) : null,
    shop: format?.shop || {},
    taxMode: format?.taxMode || null,
    print,
    ready,
  }
}

export default usePrintReceipt
