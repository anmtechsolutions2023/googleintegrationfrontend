// src/utils/escposReceipt.js
//
// The receipt, as bytes for a Bluetooth ESC/POS printer.
//
// This is Receipt.js a second time, drawn in the printer's own font instead of
// in HTML. It has to be: a raw printer cannot render a page. What keeps the two
// from printing a sale differently is that neither holds any rule of its own —
// whether a field prints comes from utils/receiptFields (the resolved Receipt
// Format), and how a value is written (money, quantity, date, the GSTIN a
// document was issued under) comes from the same place. When a field is added
// to Receipt.js, it is added here too.

import { createEncoder, columnsFor } from './escpos'
import {
  shows, choice, line, hasValue, present, money, qty, dt, printedShop, itemTotals, qtyAmount,
} from './receiptFields'
import { lineOptions, lineAddons, lineNote, lineBreakdown } from './lineOptions'

/**
 * The masthead. Same fields and SAME ORDER as Receipt.js — the mark, then who you
 * are, then how to reach you, then the registrations.
 *
 * `images` carries bitmaps the caller has already decoded and dithered. They
 * cannot be produced here: decoding is asynchronous and this builder is
 * deliberately synchronous and pure, so a print is bytes-in-bytes-out and testable
 * without a DOM. See buildReceiptBytes.
 */
const head = (e, format, shop, images = {}) => {
  e.align('center')
  // Gated on the bitmap actually existing, not merely on the setting: a logo that
  // failed to decode must print nothing rather than a stripe of noise.
  if (shows(format, 'logo', shop.logoUrl) && images.logo) {
    e.raster(images.logo)
    e.feed(1)
  }
  if (shows(format, 'shopName', shop.name)) {
    e.bold(true).size(2, 2).line(String(shop.name || '').toUpperCase()).size(1, 1).bold(false)
  }
  if (present(format, 'legalName', shop.legalName)) e.line(shop.legalName)
  if (present(format, 'address', shop.address)) e.line(shop.address)
  if (present(format, 'phone', shop.phone)) e.line(`Ph ${shop.phone}`)
  if (present(format, 'email', shop.email)) e.line(shop.email)
  // Labelled, like the screen: an unlabelled personal name cannot be told from the
  // cashier's, which prints further down.
  if (present(format, 'contactName', shop.contactName)) e.line(`Contact: ${shop.contactName}`)
  if (present(format, 'gstin', shop.gstin)) e.line(`GSTIN ${shop.gstin}`)
  if (present(format, 'fssai', shop.fssai)) e.line(`FSSAI ${shop.fssai}`)
  if (present(format, 'pan', shop.pan)) e.line(`PAN ${shop.pan}`)
  if (present(format, 'tin', shop.tin)) e.line(`TIN ${shop.tin}`)
  if (hasValue(line(format, 'headerLine'))) e.line(line(format, 'headerLine'))
  e.align('left')
}

const taxRows = (e, format, taxByComponent, taxAmount) => {
  const mode = choice(format, 'taxRows', 'split')
  if (mode === 'none') return
  if (mode === 'single' || !taxByComponent?.length) {
    if (Number(taxAmount)) e.row('Tax', money(taxAmount))
    return
  }
  taxByComponent.forEach((c) => e.row(`${c.name}${c.rate ? ` ${c.rate}%` : ''}`, money(c.amount)))
}

const optionLines = (e, format, l, compact) => {
  const mode = choice(format, 'itemOptions', 'itemised')
  if (mode === 'hidden') return
  const options = lineOptions(l)
  const addons = lineAddons(l)
  if (options.length === 0 && addons.length === 0) return
  const addonLabel = (a) => (a.groupName ? `${a.groupName}: ${a.name}` : a.name)
  if (mode === 'names' || compact) {
    e.line(`  ${[...options.map((o) => o.name), ...addons.map(addonLabel)].join(' - ')}`)
    return
  }
  const b = lineBreakdown(l)
  if (b) e.row('  Dish', money(b.base))
  options.forEach((o) => e.row(`  > ${o.name}`, o.price > 0 ? `+${money(o.price)}` : ''))
  addons.forEach((a) => e.row(`  + ${addonLabel(a)}`, a.price > 0 ? `+${money(a.price)}` : ''))
}

// Item | Qty | Amount, with a count row under the column (layout C, 2026-10-07).
const items = (e, format, lines) => {
  const layout = choice(format, 'itemLayout', 'two_line')
  e.row('Item', qtyAmount('Qty', 'Amount'), { strong: true })
  e.rule()
  lines.forEach((l) => {
    const name = l.ItemName || l.Comment || l.name || 'Item'
    const q = Number(l.Quantity ?? l.quantity ?? 0)
    const rate = Number(l.UnitPrice ?? l.unitPrice ?? 0)
    const amount = Number(l.GrossAmount ?? l.amount ?? 0)
    const code = l.ItemCode || l.code
    const note = lineNote(l) || (l.Comment && l.Comment !== name ? l.Comment : '')
    const returned = Number(l.ReturnedQty || 0)
    const label = `${name}${shows(format, 'itemCode', code) ? ` (${code})` : ''}`

    if (layout === 'single_line') {
      e.row(label, qtyAmount(qty(q), money(amount)), { strong: true })
      optionLines(e, format, l, true)
    } else {
      e.bold(true).line(label).bold(false)
      e.row(`  ${qty(q)} x ${money(rate)}`, money(amount), { strongValue: true })
      optionLines(e, format, l, false)
      if (present(format, 'itemNotes', note)) e.line(`  Note: ${note}`)
    }
    if (shows(format, 'returnedQty', returned)) e.line(`  ${qty(returned)} returned`)
  })
  const t = itemTotals(lines)
  e.rule()
  e.row(`${t.items} ${t.items === 1 ? 'item' : 'items'}`, qtyAmount(qty(t.qty), money(t.amount)), { strong: true })
}

const compositionNote = (e, format) => {
  if (!shows(format, 'compositionNote')) return
  e.centre('Composition taxable person,').centre('not eligible to collect tax on supplies')
}

const signature = (e, format, label) => {
  if (!shows(format, 'signature')) return
  e.feed(2).centre('____________________').centre(label)
}

const bill = (e, format, shop, data, images = {}) => {
  const dateMode = choice(format, 'dateTime', 'datetime')
  const returned = Number(data.ReturnedAmount || 0)

  head(e, format, shop, images)
  e.rule()
  e.align('center').bold(true).line(data.taxMode === 'gst' ? 'TAX INVOICE' : 'BILL OF SUPPLY').bold(false)
  if (data.isReprint) e.line('** REPRINT **')
  e.align('left').rule()

  if (shows(format, 'documentNo', data.TransactionNo)) e.row('Invoice', data.TransactionNo, { strong: true })
  if (dateMode !== 'never' && hasValue(data.TransactionDate)) {
    e.row('Date', dt(data.SettledAt || data.TransactionDate, dateMode))
  }
  if (shows(format, 'token', data.tokenLabel)) e.row('Token', data.tokenLabel, { strong: true })
  if (shows(format, 'table', data.tableName)) {
    e.row('Table', [data.tableName, data.waiter].filter(Boolean).join(' - '))
  }
  if (shows(format, 'portalOrder', data.portalOrderNo)) e.row('Order', data.portalOrderNo)
  if (shows(format, 'customer', data.CustomerName || data.CustomerMobile)) {
    e.row('Customer', [data.CustomerName, data.CustomerMobile].filter(Boolean).join(' '), { strongValue: true })
  }
  if (shows(format, 'cashier', data.CreatedBy)) e.row('Cashier', data.CreatedBy)

  e.rule('=')
  items(e, format, data.Lines || [])
  e.rule()

  if (shows(format, 'subtotal', data.NetAmount)) e.row('Subtotal', money(data.NetAmount))
  if (shows(format, 'discount', Number(data.DiscountAmount))) e.row('Discount', `-${money(data.DiscountAmount)}`)
  taxRows(e, format, data.TaxByComponent, data.TaxAmount)
  if (shows(format, 'roundOff', Number(data.RoundOff))) e.row('Round off', money(data.RoundOff))

  e.rule('=')
  e.size(1, 2).row('TOTAL', money(data.GrossAmount), { strong: true }).size(1, 1)
  if (shows(format, 'returnsBlock', returned)) {
    e.row('Returned', `-${money(returned)}`)
    e.size(1, 2).row('NET', money(data.NetOfReturns), { strong: true }).size(1, 1)
  }
  e.rule('=')

  if (shows(format, 'tenders', data.Tenders)) {
    (data.Tenders || []).forEach((t) => {
      const ref = shows(format, 'tenderRef', t.RefNo || t.refNo) ? ` ${t.RefNo || t.refNo}` : ''
      e.row(`${t.PaymentMode || t.mode || 'Paid'}${ref}`, money(t.Amount ?? t.amount))
    })
  }
  if (shows(format, 'changeDue', Number(data.changeDue))) e.row('Change', money(data.changeDue))
  if (shows(format, 'balanceDue', Number(data.balanceDue))) e.row('Balance due', money(data.balanceDue), { strong: true })

  e.rule()
  compositionNote(e, format)
  // Above the thank-you line, so a customer settling at the table finds it without
  // reading past the footer. Gated on the bitmap, like the logo.
  if (shows(format, 'upiQr', shop.paymentQrUrl) && images.paymentQr) {
    e.align('center')
    e.raster(images.paymentQr)
    e.line('Scan to pay')
    e.align('left')
  }
  if (hasValue(line(format, 'footerLine1'))) e.centre(line(format, 'footerLine1'))
  if (hasValue(line(format, 'footerLine2'))) e.centre(line(format, 'footerLine2'))
  signature(e, format, 'Signature')
}

const creditNote = (e, format, shop, data, images = {}) => {
  const dateMode = choice(format, 'dateTime', 'datetime')
  head(e, format, shop, images)
  e.rule()
  // Inverted, because the one mistake that matters is a credit note mistaken
  // for a bill — a refund banked as a sale.
  e.align('center').invert(true).bold(true).line(' CREDIT NOTE ').bold(false).invert(false).align('left')
  e.rule()

  e.row('Note no', data.TransactionNo, { strong: true })
  if (dateMode !== 'never') e.row('Date', dt(data.CreatedOn || data.TransactionDate, dateMode))
  if (shows(format, 'originalNo', data.OriginalNo)) e.row('Against', data.OriginalNo, { strong: true })
  if (shows(format, 'reason', data.ReasonName)) e.row('Reason', data.ReasonName)
  if (shows(format, 'cashier', data.CreatedBy)) e.row('Cashier', data.CreatedBy)
  if (shows(format, 'customer', data.CustomerName || data.CustomerMobile)) {
    e.row('Customer', [data.CustomerName, data.CustomerMobile].filter(Boolean).join(' '))
  }

  e.rule('=')
  items(e, format, data.Lines || [])
  e.rule()
  e.row('Net', money(data.NetAmount))
  taxRows(e, format, data.TaxByComponent, data.TaxAmount)
  e.rule('=')
  e.size(1, 2).row('REFUNDED', money(data.GrossAmount), { strong: true }).size(1, 1)
  e.rule('=')

  if (shows(format, 'refundedTo', data.RefundedTo || data.Tenders)) {
    e.line('Refunded to')
    ;(data.Tenders || []).forEach((t) => e.row(t.PaymentMode || t.mode || 'Refund', money(Math.abs(t.Amount ?? t.amount))))
    if (!data.Tenders?.length && data.RefundedTo) e.row(data.RefundedTo, money(data.GrossAmount))
  }

  e.rule()
  signature(e, format, 'Customer signature')
  if (hasValue(line(format, 'footerLine1'))) e.centre(line(format, 'footerLine1'))
  compositionNote(e, format)
}

const kot = (e, format, _shop, data) => {
  const dateMode = choice(format, 'dateTime', 'time')
  const big = shows(format, 'bigQty')

  e.align('center').invert(true).bold(true).size(2, 2).line(` ${data.KotNo || 'KOT'} `)
    .size(1, 1).bold(false).invert(false).align('left')

  const where = [
    present(format, 'table', data.tableName) ? data.tableName : null,
    present(format, 'token', data.tokenLabel) ? `TOKEN ${data.tokenLabel}` : null,
    present(format, 'round', data.round) ? `ROUND ${data.round}` : null,
  ].filter(Boolean)
  if (where.length) e.bold(true).line(where.join('   ')).bold(false)
  const when = dateMode !== 'never' ? dt(data.CreatedOn, dateMode) : ''
  const waiter = present(format, 'waiter', data.waiter) ? data.waiter : ''
  if (when || waiter) e.row(when, waiter)

  e.rule('=')
  const lines = data.Lines || []
  lines.forEach((l) => {
    const name = String(l.ItemName || l.name || 'Item').toUpperCase()
    const q = qty(Number(l.Quantity ?? l.quantity ?? 0))
    const note = l.Note || l.note || l.Comment
    const opts = Array.isArray(l.Options) ? l.Options : lineOptions(l).map((v) => v.name)
    const adds = Array.isArray(l.Addons) && l.Addons.every((a) => a && typeof a === 'object' && 'name' in a && !('price' in a))
      ? l.Addons
      : lineAddons(l).map((a) => ({ name: a.name, groupName: a.groupName }))
    const price = shows(format, 'prices', l.GrossAmount) ? money(l.GrossAmount) : ''

    if (big) e.bold(true).size(2, 2).line(`${q} ${name}`).size(1, 1).bold(false)
    else e.row(`${q} x ${name}`, price, { strong: true })
    if (big && price) e.row('', price)

    if (shows(format, 'itemOptions', opts.length + adds.length)) {
      opts.forEach((o) => e.line(`  > ${String(o).toUpperCase()}`))
      adds.forEach((a) => e.row(`  + ${String(a.name).toUpperCase()}`, a.groupName ? String(a.groupName).toUpperCase() : ''))
    }
    // The single most important line on this ticket.
    if (present(format, 'itemNotes', note)) e.bold(true).line(`  ** ${String(note).toUpperCase()} **`).bold(false)
  })
  e.rule('=')
  if (present(format, 'orderInstructions', data.orderInstructions)) {
    e.invert(true).bold(true).line(` ** ${String(data.orderInstructions).toUpperCase()} ** `).bold(false).invert(false)
  }
  if (shows(format, 'noCutlery', data.noCutlery) && data.noCutlery) {
    e.invert(true).bold(true).line(' ** NO CUTLERY ** ').bold(false).invert(false)
  }
  e.centre(`${lines.length} items`)
}

const tokenSlip = (e, format, shop, data, images = {}) => {
  const dateMode = choice(format, 'dateTime', 'time')
  head(e, format, shop, images)
  e.rule()
  e.centre('Your token')
  // The whole slip exists for ONE number, so it gets the whole slip.
  e.align('center').bold(true).size(4, 4).line(data.tokenLabel || '').size(1, 1).bold(false).align('left')
  e.rule()
  if (shows(format, 'documentNo', data.TransactionNo)) e.row('Invoice', data.TransactionNo, { strong: true })
  if (dateMode !== 'never') e.row('Time', dt(data.SettledAt || data.TransactionDate, dateMode))
  if (shows(format, 'itemCount', data.itemCount)) e.row('Items', String(data.itemCount))
  if (shows(format, 'total', data.GrossAmount)) e.size(1, 2).row('PAID', money(data.GrossAmount), { strong: true }).size(1, 1)
  e.rule()
  if (hasValue(line(format, 'footerLine1'))) e.centre(line(format, 'footerLine1'))
}

const BODIES = { bill, creditNote, kot, tokenSlip }

/**
 * One document, every copy the format asks for, each cut from the next.
 *
 * @param {'bill'|'creditNote'|'kot'|'tokenSlip'} doc
 * @param {Object} p
 * @param {Object|null} p.format - Resolved settings for THIS document type.
 * @param {Object} [p.shop] - The masthead values: name, legalName, address, phone,
 *   email, contactName, gstin, fssai, pan, tin, logoUrl, paymentQrUrl.
 * @param {Object} [p.images] - Bitmaps the CALLER has already decoded and dithered,
 *   as { logo, paymentQr }. Not produced here: decoding an image is asynchronous
 *   and needs a canvas, and this builder is deliberately synchronous and pure so a
 *   print is bytes-in-bytes-out and can be tested without a DOM. See
 *   utils/escposImage.bitmapFor and usePrintReceipt.
 * @param {Object} p.data - The document.
 * @returns {Uint8Array|null} null for a document type this cannot draw.
 */
export const buildReceiptBytes = (
  doc, { format = null, shop = {}, data, images = {} } = {},
) => {
  const body = BODIES[doc]
  if (!body || !data) return null
  const columns = columnsFor(choice(format, 'paperWidth', '80'))
  const copies = Math.max(1, Number(choice(format, 'copies', '1')) || 1)
  const masthead = printedShop(shop || {}, data)
  const e = createEncoder({ columns }).init()
  for (let i = 0; i < copies; i += 1) {
    body(e, format, masthead, data, images)
    e.cut()
  }
  return e.toBytes()
}

/** A short slip that proves the connection, the width and the cutter. */
export const buildTestPageBytes = ({ printerName = '', paperWidth = '80', when = new Date() } = {}) => {
  const columns = columnsFor(paperWidth)
  const e = createEncoder({ columns }).init()
  e.align('center').bold(true).size(2, 2).line('RESTRO OS').size(1, 1).bold(false)
  e.line('Printer connected')
  if (printerName) e.line(printerName)
  e.line(dt(when, 'datetime')).align('left')
  e.rule()
  // A ruler exactly one line wide: if it wraps, the paper width is set wrong.
  e.line('1234567890'.repeat(Math.ceil(columns / 10)).slice(0, columns))
  e.row(`${paperWidth} mm paper`, `${columns} characters`)
  e.rule()
  e.centre('If this is cut below, the cutter works too.')
  e.cut()
  return e.toBytes()
}

const escposReceipt = { buildReceiptBytes, buildTestPageBytes }

export default escposReceipt
