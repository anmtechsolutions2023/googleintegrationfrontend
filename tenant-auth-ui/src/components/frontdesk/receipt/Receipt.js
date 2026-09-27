import React from 'react'
import { createPortal } from 'react-dom'
import {
  shows, choice, line, hasValue, present, money, qty, dt, printedShop,
} from '../../../utils/receiptFields'
import { lineOptions, lineAddons, lineNote, lineBreakdown } from '../../../utils/lineOptions'
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

// money, qty, dt and present live in utils/receiptFields, shared with the
// Bluetooth receipt (utils/escposReceipt) so screen and paper agree.

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

/**
 * The masthead. Shared by every document that has one.
 *
 * ORDER IS THE ORDER ON THE PAPER, and it is not the catalogue's order: the mark
 * first, then who you are, then how to reach you, then the registrations. A
 * customer querying a bill reads top-down and stops as soon as they have what
 * they came for.
 *
 * EVERY LINE USES `present`, NOT `shows`.
 * `shows` answers "does the format want this field"; ALWAYS says yes even when the
 * sale has nothing to put there. A line made of the value alone cannot stand
 * empty — that is what printed a bare "FSSAI" with no number after it, and the
 * same trap now exists nine more times over. See utils/receiptFields.
 */
const Head = ({ format, shop }) => (
  <>
    {/* The logo is the one field whose value is a URL rather than text, so it
        cannot use `present` — an empty src renders a broken-image icon. The
        resolver only emits logoUrl when the branch actually holds an image, so
        hasValue on the URL is the same test every other line makes. */}
    {shows(format, 'logo', shop.logoUrl) && hasValue(shop.logoUrl) && (
      <Centre className="rc-logo">
        <img src={shop.logoUrl} alt="" />
      </Centre>
    )}
    {shows(format, 'shopName', shop.name) && (
      <Centre className="rc-shop">{String(shop.name || '').toUpperCase()}</Centre>
    )}
    {/* The registered company, under the outlet it trades as. For years this was
        the first thing onboarding asked for and the one thing no customer ever
        saw. */}
    {present(format, 'legalName', shop.legalName) && (
      <Centre className="rc-sub">{shop.legalName}</Centre>
    )}
    {present(format, 'address', shop.address) && <Centre className="rc-sub">{shop.address}</Centre>}
    {present(format, 'phone', shop.phone) && <Centre className="rc-sub">Ph {shop.phone}</Centre>}
    {present(format, 'email', shop.email) && <Centre className="rc-sub">{shop.email}</Centre>}
    {/* Labelled. An unlabelled personal name on a bill reads ambiguously — the
        customer cannot tell it from the cashier's, which is printed further down. */}
    {present(format, 'contactName', shop.contactName) && (
      <Centre className="rc-sub">Contact: {shop.contactName}</Centre>
    )}
    {present(format, 'gstin', shop.gstin) && <Centre className="rc-sub">GSTIN {shop.gstin}</Centre>}
    {present(format, 'fssai', shop.fssai) && <Centre className="rc-sub">FSSAI {shop.fssai}</Centre>}
    {present(format, 'pan', shop.pan) && <Centre className="rc-sub">PAN {shop.pan}</Centre>}
    {present(format, 'tin', shop.tin) && <Centre className="rc-sub">TIN {shop.tin}</Centre>}
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

/**
 * A dish's options and add-ons under it, as Receipt Format → Options & add-ons
 * says: itemised (the dish price, then each choice with what it added — the
 * rate adds up on paper), names only, or hidden.
 *
 * The paper has one ink, so ">" marks an option and "+" an add-on — the job the
 * chip colours do on screen. Amounts are per plate; the line total above them
 * carries the quantity.
 */
const OptionLines = ({ format, l, compact }) => {
  const mode = choice(format, 'itemOptions', 'itemised')
  if (mode === 'hidden') return null
  const options = lineOptions(l)
  const addons = lineAddons(l)
  if (options.length === 0 && addons.length === 0) return null
  const addonLabel = (a) => (a.groupName ? `${a.groupName}: ${a.name}` : a.name)

  if (mode === 'names' || compact) {
    return (
      <div className="rc-qty rc-note">
        {[...options.map((o) => o.name), ...addons.map(addonLabel)].join(' · ')}
      </div>
    )
  }
  const b = lineBreakdown(l)
  return (
    <div className="rc-opts">
      {b && <div className="rc-row rc-opt"><span>Dish</span><span>{money(b.base)}</span></div>}
      {options.map((o, i) => (
        <div className="rc-row rc-opt" key={`o${o.id || i}`}>
          <span>&gt; {o.name}</span><span>{o.price > 0 ? `+${money(o.price)}` : ''}</span>
        </div>
      ))}
      {addons.map((a, i) => (
        <div className="rc-row rc-opt" key={`a${a.id || i}`}>
          <span>+ {addonLabel(a)}</span><span>{a.price > 0 ? `+${money(a.price)}` : ''}</span>
        </div>
      ))}
    </div>
  )
}

const Items = ({ format, lines }) => {
  const layout = choice(format, 'itemLayout', 'two_line')
  return lines.map((l, i) => {
    const name = l.ItemName || l.Comment || l.name || 'Item'
    const q = Number(l.Quantity ?? l.quantity ?? 0)
    const rate = Number(l.UnitPrice ?? l.unitPrice ?? 0)
    const amount = Number(l.GrossAmount ?? l.amount ?? 0)
    const code = l.ItemCode || l.code
    // The kitchen note first. Comment is a note only when it is not the dish
    // name again — an invoice line keeps the name there.
    const note = lineNote(l) || (l.Comment && l.Comment !== name ? l.Comment : '')
    const returned = Number(l.ReturnedQty || 0)

    if (layout === 'single_line') {
      return (
        <div className="rc-item" key={l.Id || i}>
          <div className="rc-row">
            <span>{name}{shows(format, 'itemCode', code) ? ` (${code})` : ''}</span>
            <span>{money(amount)}</span>
          </div>
          <OptionLines format={format} l={l} compact />
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
        <OptionLines format={format} l={l} />
        {present(format, 'itemNotes', note) && <div className="rc-qty rc-note">Note: {note}</div>}
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
      {/* The payment QR, above the thank-you line so a customer settling at the
          table finds it without reading past the footer.

          A STATIC code. It is composed before the total is known, so it says "pay
          this merchant" and the customer enters the amount — which is what a bank-
          or PSP-issued restaurant QR is.

          Gated on the value as well as the state, like the logo: an <img> with an
          empty src draws a broken-image icon, which on a bill looks like a fault. */}
      {shows(format, 'upiQr', shop.paymentQrUrl) && hasValue(shop.paymentQrUrl) && (
        <Centre className="rc-qr">
          <img src={shop.paymentQrUrl} alt="" />
          <Centre className="rc-sub">Scan to pay</Centre>
        </Centre>
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
        {present(format, 'table', data.tableName) && <span>{data.tableName}</span>}
        {present(format, 'token', data.tokenLabel) && <span>TOKEN {data.tokenLabel}</span>}
        {present(format, 'round', data.round) && <span>ROUND {data.round}</span>}
      </div>
      <div className="rc-row">
        {dateMode !== 'never' && <span>{dt(data.CreatedOn, dateMode)}</span>}
        {present(format, 'waiter', data.waiter) && <span>{data.waiter}</span>}
      </div>

      <Solid />
      {(data.Lines || []).map((l, i) => {
        const name = l.ItemName || l.name || 'Item'
        const q = Number(l.Quantity ?? l.quantity ?? 0)
        const note = l.Note || l.note || l.Comment
        // The portion straight under the dish, then each add-on with its group
        // on the right. Read from the ticket data when it carries them, from
        // the raw line otherwise.
        const opts = Array.isArray(l.Options) ? l.Options : lineOptions(l).map((v) => v.name)
        const adds = Array.isArray(l.Addons) && l.Addons.every((a) => a && typeof a === 'object' && 'name' in a && !('price' in a))
          ? l.Addons
          : lineAddons(l).map((a) => ({ name: a.name, groupName: a.groupName }))
        return (
          <div className="rc-kotitem" key={l.Id || i}>
            <div className="rc-kotline">
              <span className={big ? 'rc-big' : 'rc-kotqty'}>{qty(q)}</span>
              <span className="rc-kotname">{String(name).toUpperCase()}</span>
              {shows(format, 'prices', l.GrossAmount) && (
                <span className="rc-kotprice">{money(l.GrossAmount)}</span>
              )}
            </div>
            {shows(format, 'itemOptions', opts.length + adds.length) && (
              <>
                {opts.map((o, oi) => (
                  <div className="rc-kotopt" key={`o${oi}`}>&gt; {String(o).toUpperCase()}</div>
                ))}
                {adds.map((a, ai) => (
                  <div className="rc-row rc-kotadd" key={`a${ai}`}>
                    <span>+ {String(a.name).toUpperCase()}</span>
                    <span>{a.groupName ? String(a.groupName).toUpperCase() : ''}</span>
                  </div>
                ))}
              </>
            )}
            {/* The single most important line on this ticket. */}
            {present(format, 'itemNotes', note) && <div className="rc-kotnote">** {String(note).toUpperCase()} **</div>}
          </div>
        )
      })}
      <Solid />
      {/* ORDER-LEVEL instructions, below the items and above the count.
          Deliberately AFTER the dishes: a cook reads what to make first, then
          how the customer wants the whole order treated. Inverted like the KOT
          number because it is read at arm's length by somebody holding a pan. */}
      {present(format, 'orderInstructions', data.orderInstructions) && (
        <div className="rc-kotinstr">** {String(data.orderInstructions).toUpperCase()} **</div>
      )}
      {shows(format, 'noCutlery', data.noCutlery) && data.noCutlery && (
        <div className="rc-kotinstr rc-kotcutlery">** NO CUTLERY **</div>
      )}
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
      <Body format={format} shop={printedShop(shop, data)} data={data} />
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
