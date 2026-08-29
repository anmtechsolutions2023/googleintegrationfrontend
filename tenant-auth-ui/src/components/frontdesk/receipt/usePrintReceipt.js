import { useCallback, useEffect, useRef, useState } from 'react'
import posService from '../../../services/posService'

/* eslint-disable no-console */
const logger = { warn: (...a) => console.warn(...a) }

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

const PAGE_STYLE_ID = 'rc-page-size'

/**
 * The paper size, for the duration of one print.
 *
 * `@page` takes no selector, so it cannot be scoped in a stylesheet: a rule in
 * receipt.css set EVERY page in the application to 80mm from the moment the
 * bundle loaded, and a report printed as a blank till roll. Injecting it here
 * means the size exists only while a receipt is actually on the paper.
 */
const applyPageSize = (widthMm) => {
  let el = document.getElementById(PAGE_STYLE_ID)
  if (!el) {
    el = document.createElement('style')
    el.id = PAGE_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = `@page { size: ${widthMm}mm auto; margin: 0; }`
}

const clearPageSize = () => {
  document.getElementById(PAGE_STYLE_ID)?.remove()
  document.body.classList.remove('rc-printing')
}

export const usePrintReceipt = (branchId) => {
  const [format, setFormat] = useState(null)
  const [job, setJob] = useState(null)
  const [ready, setReady] = useState(false)
  // Which document last failed to reach the paper. The till turns it into a
  // message: a print that quietly does nothing is indistinguishable from a
  // printer that is switched off, and the cashier reprints instead of checking.
  const [failed, setFailed] = useState(null)
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

  const print = useCallback((doc, data) => { setFailed(null); setJob({ doc, data }) }, [])

  const docFormat = job ? (format?.documents?.[job.doc] || null) : null

  useEffect(() => {
    if (!job) return undefined
    let cancelled = false

    // The receipt comes down when the dialog closes, not a fixed moment after
    // it opens. Clearing the job on a timer raced the preview: a browser whose
    // print() returns before the user dismisses the dialog had the receipt
    // unmounted underneath it, and the preview showed a blank page.
    const done = () => { clearPageSize(); setJob(null) }
    window.addEventListener('afterprint', done, { once: true })

    // WAIT FOR THE PAPER TO EXIST, DO NOT GUESS AT IT.
    //
    // This used to hide the application, size the page to 80mm and then call
    // print() on a fixed 60ms timer, hoping React had committed the portal by
    // then. When it had not — a busy tab, a slow machine, a re-render from the
    // receipt-format fetch still in flight — print() fired with the whole app
    // hidden and no receipt yet, and out came a blank till roll. jsdom commits
    // synchronously, so no test could ever see it.
    //
    // So the class goes on only once the receipt is really on the page, with
    // text in it, and printing is what happens after that rather than in the
    // hope of it.
    const ready = () => {
      const paper = document.querySelector('.rc-root .rc-paper')
      return !!paper && paper.textContent.trim().length > 0
    }

    const started = Date.now()
    const attempt = () => {
      if (cancelled) return
      if (ready()) {
        document.body.classList.add('rc-printing')
        applyPageSize(docFormat?.paperWidth === '58' ? 58 : 80)
        window.print()
        return
      }
      // A second is far longer than a commit takes and still shorter than a
      // cashier's patience. Past it something is genuinely wrong, and printing
      // nothing beats printing a blank page that looks like a printer fault.
      if (Date.now() - started > 1000) {
        logger.warn('Receipt did not render — printing aborted rather than sending blank paper', {
          doc: job.doc,
        })
        clearPageSize()
        setJob(null)
        setFailed(job.doc)
        return
      }
      timer.current = requestAnimationFrame(attempt)
    }
    timer.current = requestAnimationFrame(attempt)

    return () => {
      cancelled = true
      cancelAnimationFrame(timer.current)
      window.removeEventListener('afterprint', done)
      clearPageSize()
    }
  }, [job, docFormat])

  return {
    job,
    format: docFormat,
    shop: format?.shop || {},
    taxMode: format?.taxMode || null,
    print,
    ready,
    failed,
    clearFailed: () => setFailed(null),
  }
}

export default usePrintReceipt
