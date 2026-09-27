import { useCallback, useEffect, useRef, useState } from 'react'
import posService from '../../../services/posService'
import { buildReceiptBytes } from '../../../utils/escposReceipt'
import { bitmapFor, printDotsFor } from '../../../utils/escposImage'
import { useBranchMedia } from '../../../hooks/useBranchMedia'
import {
  getPrinterMode, isDirectPrinterMode, printerErrorMessage, sendToPrinter,
} from '../../../utils/bluetoothPrinter'

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

// Ten minutes. Long enough that a busy till is not re-fetching for nothing, short
// enough that "I fixed the GSTIN" reaches the paper within one customer's visit.
const FORMAT_TTL_MS = 10 * 60 * 1000

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
  // Why, when the reason is known — a Bluetooth printer out of range says so
  // rather than "did not render".
  const [failedReason, setFailedReason] = useState(null)
  // Print must happen AFTER the receipt is in the DOM, and the cleanup must not
  // fire against a component that has since unmounted.
  const timer = useRef(null)

  // WHEN THE HELD FORMAT IS REFRESHED.
  //
  // Fetching once per branch is right for print latency and wrong for staleness. A
  // till is opened in the morning and not reloaded: an admin who fixes the GSTIN,
  // the address or the FSSAI number at eleven would have every bill until closing
  // still printing the old masthead. That was survivable when the masthead was
  // three fields; it is not now that it is eleven plus two images.
  //
  // So: on focus, and on a soft TTL for a screen that never loses focus (a till
  // that is the only tab on a dedicated tablet). The format response stays small
  // because it carries image PATHS rather than bytes; the bytes are two separate
  // requests below, on this same cadence, of a couple of tens of kilobytes each.
  const [refreshAt, setRefreshAt] = useState(0)

  useEffect(() => {
    if (!branchId) return undefined
    const bump = () => setRefreshAt(Date.now())
    window.addEventListener('focus', bump)
    const tick = setInterval(bump, FORMAT_TTL_MS)
    return () => {
      window.removeEventListener('focus', bump)
      clearInterval(tick)
    }
  }, [branchId])

  useEffect(() => {
    let cancelled = false
    if (!branchId) { setFormat(null); setReady(true); return undefined }
    // `ready` is NOT cleared on a refresh, only on a branch change. Clearing it
    // would disable the Print button for the length of a round trip every time the
    // cashier came back to the tab.
    if (!refreshAt) setReady(false)
    posService.getReceiptFormat(branchId)
      .then((f) => { if (!cancelled) setFormat(f) })
      // A failed REFRESH keeps what we already hold; a failed first fetch has
      // nothing to keep. Either way the renderer degrades to "print what exists".
      .catch(() => { if (!cancelled && !refreshAt) setFormat(null) })
      .finally(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [branchId, refreshAt])

  // The logo and QR as data URIs.
  //
  // The format carries only a PATH to each, which cannot be used as an <img src> —
  // it is authenticated, cross-origin and answers JSON. useBranchMedia explains all
  // three and does the fetching, shared with the Receipt Format preview so the two
  // cannot disagree about what a bill looks like.
  //
  // Passed `refreshAt` so the images follow the same cadence as the format: a path
  // carries a version stamp, but a till that re-reads the format on focus should
  // re-read the pictures with it.
  const shop = useBranchMedia(branchId, format?.shop || null, refreshAt)

  // Held in a ref as well, so a print fired from an old closure still uses the
  // format that has arrived since.
  const formatRef = useRef(null)
  formatRef.current = format
  const shopRef = useRef(shop)
  shopRef.current = shop

  const print = useCallback((doc, data) => {
    setFailed(null)
    setFailedReason(null)

    // A receipt printer chosen on this device (Bluetooth LE or serial): no
    // dialog, no page — the document goes to the printer as ESC/POS bytes and it
    // cuts the paper. The browser print path below is untouched for every other device.
    if (isDirectPrinterMode(getPrinterMode())) {
      const current = formatRef.current
      const docFmt = current?.documents?.[doc] || null
      // The resolved shop, so the bitmaps below decode data URIs rather than an
      // authenticated JSON endpoint no <img> can read.
      const shop = shopRef.current || {}

      // The images, decoded and dithered to 1 bit for THIS paper width.
      //
      // Done here rather than inside buildReceiptBytes because decoding needs a
      // canvas and a promise, and that builder is deliberately synchronous and
      // pure. Requested only when the format actually asks for the field, so a
      // shop that prints no logo pays nothing for holding one.
      //
      // bitmapFor never throws: a logo is decoration, and a bill that failed to
      // print because a picture would not decode is a customer at a counter.
      const dots = printDotsFor(docFmt?.paperWidth)
      const wantLogo = docFmt?.logo && docFmt.logo !== 'never' && shop.logoUrl
      const wantQr = docFmt?.upiQr && docFmt.upiQr !== 'never' && shop.paymentQrUrl

      return Promise.all([
        wantLogo ? bitmapFor(shop.logoUrl, dots) : null,
        // Half width: a QR wants to be square and scannable, not the width of the
        // roll. 28mm at 203dpi is about 224 dots.
        wantQr ? bitmapFor(shop.paymentQrUrl, Math.round(dots * 0.58)) : null,
      ]).then(([logo, paymentQr]) => {
        const bytes = buildReceiptBytes(doc, {
          format: docFmt,
          shop,
          data,
          images: { logo, paymentQr },
        })
        if (!bytes) { setFailed(doc); return false }
        return sendToPrinter(bytes)
          .then(() => true)
          .catch((error) => {
            setFailedReason(printerErrorMessage(error))
            setFailed(doc)
            return false
          })
      })
    }

    setJob({ doc, data })
    return Promise.resolve(true)
  }, [])

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
    //
    // AND WITH ITS PICTURES DECODED. Text in the DOM is not the same as a page
    // ready to print: a logo and a payment QR arrive as data URIs, and a data URI
    // still has to be decoded before it paints. print() fired in that window
    // snapshots the page without it.
    //
    // This is why the QR came out and the logo did not. They render through
    // identical markup and identical rules — the only difference was size. A 23KB
    // QR decoded inside the gap; a logo several times larger did not, every time,
    // which reads as "logos do not print" rather than as a race.
    //
    // `complete` is true once the browser has FINISHED with an image, successfully
    // or not, so a broken one cannot stall the print.
    //
    // THE TWO CONDITIONS ARE NOT EQUALLY SERIOUS, and the loop below treats them
    // differently on purpose. No paper at all means a blank till roll and is worth
    // refusing. A picture that has not decoded yet is worth WAITING for and never
    // worth refusing over: a bill without its logo is a bill, and a customer at a
    // counter with no bill is not.
    const paperIfRendered = () => {
      const paper = document.querySelector('.rc-root .rc-paper')
      return paper && paper.textContent.trim().length > 0 ? paper : null
    }
    const imagesDecoded = (paper) =>
      Array.from(paper.querySelectorAll('img')).every((img) => img.complete)

    const started = Date.now()
    const attempt = () => {
      if (cancelled) return
      // A second is far longer than a commit takes and still shorter than a
      // cashier's patience.
      const expired = Date.now() - started > 1000
      const paper = paperIfRendered()

      if (paper && (imagesDecoded(paper) || expired)) {
        // Past the deadline with a picture still decoding, the bill goes out
        // without it. Said out loud, because "the logo sometimes misses" is the
        // kind of thing that otherwise gets diagnosed as a printer fault.
        if (!imagesDecoded(paper)) {
          logger.warn('Receipt printed before an image finished decoding', { doc: job.doc })
        }
        document.body.classList.add('rc-printing')
        applyPageSize(docFormat?.paperWidth === '58' ? 58 : 80)
        window.print()
        return
      }

      // No paper at all. Printing nothing beats printing a blank page that looks
      // like a printer fault.
      if (expired) {
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
    shop,
    taxMode: format?.taxMode || null,
    print,
    ready,
    failed,
    failedReason,
    clearFailed: () => { setFailed(null); setFailedReason(null) },
  }
}

export default usePrintReceipt
