import React from 'react'
import { createPortal } from 'react-dom'
import { shows, choice, line, hasValue } from '../../../utils/receiptFields'
import './receipt.css'

/**
 * The printed document — bill, credit note, kitchen ticket or token slip.
 *
 * WHY IT IS A PORTAL
 * "Print only the bill" is not a styling problem, it is a DOM problem. The old
 * Print button called window.print() on the Ledger page and hid four elements,
 * so the navbar, the page heading, the filter row and the whole ledger table
 * behind the modal all came out on A4 with the invoice somewhere in the middle.
 *
 * Hiding things one by one never finishes: the next screen that wants to print
 * has its own furniture. So the receipt renders OUTSIDE #root, as a sibling, and
 * the print stylesheet hides #root entirely. Whatever screen invoked it, exactly
 * one thing is on the paper — see receipt.css.
 *
 * WHAT IT DOES NOT DO
 * It holds no field defaults and no idea which fields exist. `format` arrives
 * resolved from the server, and utils/receiptFields answers "does this print?".
 * A field added to the catalogue reaches the paper without touching this file,
 * as long as something here knows how to draw it.
 */

const money = (n) => (Number(n) || 0).toFixed(2)
const qty = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
}

const dt = (value, mode) => {
  if (!value || mode === 'never') return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16).replace('T', ' ')
  const date = d.toLocaleDateString('en-GB')
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (mode === 'date') return date
  if (mode === 'time') return time
  return `${date} ${time}`
}

// ── Paper primitives ─────────────────────────────────────────────────────────
const Row = ({ label, value, strong }) => (
  <div className={`rc-row${strong ? ' rc-strong' : ''}`}>
    <span>{label}</span><span>{value}</span>
  </div>
)
const Rule = () => <div className="rc-rule" />
const Solid = () => <div className="rc-solid" />
const Centre = ({ children, className = '' }) => (
  <div className={`rc-c ${className}`}>{children}</div>
)

/** The masthead. Shared by every document that has one. */
const Head = ({ format, shop }) => (
  <>
    {shows(format, 'shopName', shop.name) && (
      <Centre className="rc-shop">{String(shop.name || '').toUpperCase()}</Centre>
    )}
    {shows(format, 'address', shop.address) && <Centre className="rc-sub">{shop.address}</Centre>}
    {shows(format, 'gstin', shop.gstin) && <Centre className="rc-sub">GSTIN {shop.gstin}</Centre>}
    {shows(format, 'fssai', shop.fssai) && <Centre className="rc-sub">FSSAI {shop.fssai}</Centre>}
    {hasValue(line(format, 'headerLine')) && (
      <Centre className="rc-sub">{line(format, 'headerLine')}</Centre>
    )}
  </>
)

/**
 * The tax rows.
 *
 * `split` and `single` are a LAYOUT choice; `none` is usually a legal one, and
 * the server locks it there for a composition or unregistered branch. Either
 * way the components come from the document itself — the rate the sale was
 * raised at, never today's.
 */
const TaxRows = ({ format, taxByComponent, taxAmount }) => {
  const mode = choice(format, 'taxRows', 'split')
  if (mode === 'none') return null
  if (mode === 'single' || !taxByComponent?.length) {
    if (!Number(taxAmount)) return null
    return <Row label="Tax" value={money(taxAmount)} />
  }
  return taxByComponent.map((c, i) => (
    <Row key={`${c.name}-${i}`} label={`${c.name}${c.rate ? ` ${c.rate}%` : ''}`} value={money(c.amount)} />
  ))
}

const Items = ({ format, lines }) => {
  const layout = choice(format, 'itemLayout', 'two_line')
  return lines.map((l, i) => {
    const name = l.ItemName || l.Comment || l.name || 'Item'
    const q = Number(l.Quantity ?? l.quantity ?? 0)
    const rate = Number(l.UnitPrice ?? l.unitPrice ?? 0)
    const amount = Number(l.GrossAmount ?? l.amount ?? 0)
    const code = l.ItemCode || l.code
    const note = l.Comment !== name ? l.Comment : (l.Note || l.note)
    const returned = Number(l.ReturnedQty || 0)

    if (layout === 'single_line') {
      return (
        <div className="rc-item" key={l.Id || i}>
          <div className="rc-row">
            <span>{name}{shows(format, 'itemCode', code) ? ` (${code})` : ''}</span>
            <span>{money(amount)}</span>
          </div>
          {shows(format, 'returnedQty', returned) && (
            <div className="rc-row rc-qty rc-back"><span>{qty(returned)} returned</span><span /></div>
          )}
        </div>
      )
    }
    return (
      <div className="rc-item" key={l.Id || i}>
        <div>{name}{shows(format, 'itemCode', code) ? ` (${code})` : ''}</div>
        <div className="rc-row rc-qty">
          <span>{qty(q)} x {money(rate)}</span><span>{money(amount)}</span>
        </div>
        {shows(format, 'itemNotes', note) && <div className="rc-qty rc-note">{note}</div>}
        {/* The quantity SOLD is never rewritten — overwrite it and the paper
            stops matching the document, which is what a reprint exists to do. */}
        {shows(format, 'returnedQty', returned) && (
          <div className="rc-row rc-qty rc-back"><span>{qty(returned)} returned</span><span /></div>
        )}
      </div>
    )
  })
}

// ── Bill ─────────────────────────────────────────────────────────────────────
const Bill = ({ format, shop, data }) => {
  const dateMode = choice(format, 'dateTime', 'datetime')
  const title = data.taxMode === 'gst' ? 'TAX INVOICE' : 'BILL OF SUPPLY'
  const returned = Number(data.ReturnedAmount || 0)

  return (
    <>
      <Head format={format} shop={shop} />
      <Rule />
      <Centre className="rc-title">{title}</Centre>
      {data.isReprint && <Centre className="rc-sub">** REPRINT **</Centre>}
      <Rule />

      {shows(format, 'documentNo', data.TransactionNo) && (
        <Row label="Invoice" value={data.TransactionNo} strong />
      )}
      {dateMode !== 'never' && hasValue(data.TransactionDate) && (
        <Row label="Date" value={dt(data.SettledAt || data.TransactionDate, dateMode)} />
      )}
      {shows(format, 'token', data.tokenLabel) && <Row label="Token" value={data.tokenLabel} strong />}
      {shows(format, 'table', data.tableName) && (
        <Row label="Table" value={[data.tableName, data.waiter].filter(Boolean).join(' · ')} />
      )}
      {shows(format, 'portalOrder', data.portalOrderNo) && (
        <Row label="Order" value={data.portalOrderNo} />
      )}
      {shows(format, 'customer', data.CustomerName || data.CustomerMobile) && (
        <Row label="Customer" value={[data.CustomerName, data.CustomerMobile].filter(Boolean).join(' ')} />
      )}
      {shows(format, 'cashier', data.CreatedBy) && <Row label="Cashier" value={data.CreatedBy} />}

      <Solid />
      <Items format={format} lines={data.Lines || []} />
      <Rule />

      {shows(format, 'subtotal', data.NetAmount) && <Row label="Subtotal" value={money(data.NetAmount)} />}
      {shows(format, 'discount', Number(data.DiscountAmount)) && (
        <Row label="Discount" value={`-${money(data.DiscountAmount)}`} />
      )}
      <TaxRows format={format} taxByComponent={data.TaxByComponent} taxAmount={data.TaxAmount} />
      {shows(format, 'roundOff', Number(data.RoundOff)) && (
        <Row label="Round off" value={money(data.RoundOff)} />
      )}

      <Solid />
      <div className="rc-row rc-total"><span>TOTAL</span><span>{money(data.GrossAmount)}</span></div>
      {/* The original total keeps the weight; returns and net ride beneath it —
          the same rule the Ledger screen follows, so paper and screen agree. */}
      {shows(format, 'returnsBlock', returned) && (
        <>
          <Row label="Returned" value={`-${money(returned)}`} />
          <div className="rc-row rc-total"><span>NET</span><span>{money(data.NetOfReturns)}</span></div>
        </>
      )}
      <Solid />

      {shows(format, 'tenders', data.Tenders) && (data.Tenders || []).map((t, i) => (
        <Row
          key={t.Id || i}
          label={`${t.PaymentMode || t.mode || 'Paid'}${shows(format, 'tenderRef', t.RefNo || t.refNo) ? ` ${t.RefNo || t.refNo}` : ''}`}
          value={money(t.Amount ?? t.amount)}
        />
      ))}
      {shows(format, 'changeDue', Number(data.changeDue)) && (
        <Row label="Change" value={money(data.changeDue)} />
      )}
      {shows(format, 'balanceDue', Number(data.balanceDue)) && (
        <Row label="Balance due" value={money(data.balanceDue)} strong />
      )}

      <Rule />
      {shows(format, 'compositionNote') && (
        <>
          <Centre className="rc-sub">Composition taxable person,</Centre>
          <Centre className="rc-sub">not eligible to collect tax on supplies</Centre>
        </>
      )}
      {hasValue(line(format, 'footerLine1')) && <Centre className="rc-sub">{line(format, 'footerLine1')}</Centre>}
      {hasValue(line(format, 'footerLine2')) && <Centre className="rc-sub">{line(format, 'footerLine2')}</Centre>}
      {shows(format, 'signature') && <div className="rc-sign"><span /><Centre className="rc-sub">Signature</Centre></div>}
    </>
  )
}

// ── Credit note ──────────────────────────────────────────────────────────────
const CreditNote = ({ format, shop, data }) => {
  const dateMode = choice(format, 'dateTime', 'datetime')
  return (
    <>
      <Head format={format} shop={shop} />
      <Rule />
      {/* Inverted, because the one mistake that matters is a credit note
          mistaken for a bill — a refund banked as a sale. */}
      <Centre className="rc-title rc-invert">CREDIT NOTE</Centre>
      <Rule />

      <Row label="Note no" value={data.TransactionNo} strong />
      {dateMode !== 'never' && <Row label="Date" value={dt(data.CreatedOn || data.TransactionDate, dateMode)} />}
      {shows(format, 'originalNo', data.OriginalNo) && (
        <Row label="Against" value={data.OriginalNo} strong />
      )}
      {shows(format, 'reason', data.ReasonName) && <Row label="Reason" value={data.ReasonName} />}
      {shows(format, 'cashier', data.CreatedBy) && <Row label="Cashier" value={data.CreatedBy} />}
      {shows(format, 'customer', data.CustomerName || data.CustomerMobile) && (
        <Row label="Customer" value={[data.CustomerName, data.CustomerMobile].filter(Boolean).join(' ')} />
      )}

      <Solid />
      <Items format={format} lines={data.Lines || []} />
      <Rule />

      <Row label="Net" value={money(data.NetAmount)} />
      <TaxRows format={format} taxByComponent={data.TaxByComponent} taxAmount={data.TaxAmount} />

      <Solid />
      <div className="rc-row rc-total"><span>REFUNDED</span><span>{money(data.GrossAmount)}</span></div>
      <Solid />

      {shows(format, 'refundedTo', data.RefundedTo || data.Tenders) && (
        <>
          <div className="rc-label">Refunded to</div>
          {(data.Tenders || []).map((t, i) => (
            <Row key={t.Id || i} label={t.PaymentMode || t.mode || 'Refund'} value={money(Math.abs(t.Amount ?? t.amount))} />
          ))}
          {!data.Tenders?.length && data.RefundedTo && <Row label={data.RefundedTo} value={money(data.GrossAmount)} />}
        </>
      )}

      <Rule />
      {shows(format, 'signature') && (
        <div className="rc-sign"><span /><Centre className="rc-sub">Customer signature</Centre></div>
      )}
      {hasValue(line(format, 'footerLine1')) && <Centre className="rc-sub">{line(format, 'footerLine1')}</Centre>}
      {shows(format, 'compositionNote') && (
        <>
          <Centre className="rc-sub">Composition taxable person,</Centre>
          <Centre className="rc-sub">not eligible to collect tax on supplies</Centre>
        </>
      )}
    </>
  )
}

// ── Kitchen ticket ───────────────────────────────────────────────────────────
const Kot = ({ format, data }) => {
  const dateMode = choice(format, 'dateTime', 'time')
  const big = shows(format, 'bigQty')
  return (
    <>
      {/* No shop name, no GSTIN, and prices off by default. A cook does not
          price the dish; every character that is not the dish or the quantity
          is noise on a ticket read at arm's length. */}
      <Centre className="rc-title rc-invert rc-kotno">{data.KotNo}</Centre>

      <div className="rc-row rc-kothead">
        {shows(format, 'table', data.tableName) && <span>{data.tableName}</span>}
        {shows(format, 'token', data.tokenLabel) && <span>TOKEN {data.tokenLabel}</span>}
        {shows(format, 'round', data.round) && <span>ROUND {data.round}</span>}
      </div>
      <div className="rc-row">
        {dateMode !== 'never' && <span>{dt(data.CreatedOn, dateMode)}</span>}
        {shows(format, 'waiter', data.waiter) && <span>{data.waiter}</span>}
      </div>

      <Solid />
      {(data.Lines || []).map((l, i) => {
        const name = l.ItemName || l.name || 'Item'
        const q = Number(l.Quantity ?? l.quantity ?? 0)
        const note = l.Note || l.note || l.Comment
        return (
          <div className="rc-kotitem" key={l.Id || i}>
            <div className="rc-kotline">
              <span className={big ? 'rc-big' : 'rc-kotqty'}>{qty(q)}</span>
              <span className="rc-kotname">{String(name).toUpperCase()}</span>
              {shows(format, 'prices', l.GrossAmount) && (
                <span className="rc-kotprice">{money(l.GrossAmount)}</span>
              )}
            </div>
            {/* The single most important line on this ticket. */}
            {shows(format, 'itemNotes', note) && <div className="rc-kotnote">** {String(note).toUpperCase()} **</div>}
          </div>
        )
      })}
      <Solid />
      <Centre className="rc-sub">{(data.Lines || []).length} items</Centre>
    </>
  )
}

// ── Token slip ───────────────────────────────────────────────────────────────
const TokenSlip = ({ format, shop, data }) => {
  const dateMode = choice(format, 'dateTime', 'time')
  return (
    <>
      <Head format={format} shop={shop} />
      <Rule />
      {/* The whole slip exists for ONE number, so it gets the whole slip. */}
      <div className="rc-label rc-c">Your token</div>
      <Centre className="rc-token">{data.tokenLabel}</Centre>
      <Rule />
      {shows(format, 'documentNo', data.TransactionNo) && (
        <Row label="Invoice" value={data.TransactionNo} strong />
      )}
      {dateMode !== 'never' && <Row label="Time" value={dt(data.SettledAt || data.TransactionDate, dateMode)} />}
      {shows(format, 'itemCount', data.itemCount) && <Row label="Items" value={String(data.itemCount)} />}
      {shows(format, 'total', data.GrossAmount) && (
        <div className="rc-row rc-total"><span>PAID</span><span>{money(data.GrossAmount)}</span></div>
      )}
      <Rule />
      {hasValue(line(format, 'footerLine1')) && <Centre className="rc-sub">{line(format, 'footerLine1')}</Centre>}
    </>
  )
}

const BODIES = { bill: Bill, creditNote: CreditNote, kot: Kot, tokenSlip: TokenSlip }

/**
 * @param {Object} props
 * @param {'bill'|'creditNote'|'kot'|'tokenSlip'} props.doc
 * @param {Object} props.format - Resolved settings for THIS document type.
 * @param {Object} props.shop - { name, address, gstin, fssai }
 * @param {Object} props.data - The document.
 * @param {boolean} [props.inline] - Render in place (the format preview) rather
 *   than portalled to the body for printing.
 */
const Receipt = ({ doc, format, shop = {}, data, inline = false }) => {
  const Body = BODIES[doc]
  if (!Body || !data) return null

  const width = choice(format, 'paperWidth', '80')
  const copies = Number(choice(format, 'copies', '1')) || 1

  const paper = (
    <div className={`rc-paper rc-w${width}`} data-testid={`receipt-${doc}`}>
      <Body format={format} shop={shop} data={data} />
    </div>
  )

  const sheet = (
    <div className={`rc-root rc-w${width}`}>
      {/* Copies are separate blocks with a page break between, so the printer
          cuts between them rather than producing one long strip. */}
      {Array.from({ length: copies }, (_, i) => (
        <React.Fragment key={i}>{paper}</React.Fragment>
      ))}
    </div>
  )

  if (inline) return <div className="rc-inline">{sheet}</div>
  // Outside #root, so the print stylesheet can hide the entire application and
  // leave exactly this on the paper — whatever screen invoked it.
  return createPortal(sheet, document.body)
}

export default Receipt
