import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import Receipt from '../../components/frontdesk/receipt/Receipt'
import { SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'
import './receiptFormat.css'

/**
 * What prints on paper, per branch.
 *
 * THE EDITOR CARRIES NO FIELD LIST. Every section, field, label, hint, allowed
 * value and lock arrives from /api/pos/receipt-format/schema, which is generated
 * from the catalogue on the server. A field added there appears here with no
 * change to this file — which is the point: a second copy of the list is a
 * second set of answers, and the one that drifts is the one nobody is reading.
 *
 * THE PREVIEW USES A REAL SALE. Sample data always has a customer name AND a
 * table AND a token, so every "if present" field looks fine and the one that is
 * never actually present is the one you discover on paper.
 */

const TAX_MODES = [
  { value: 'gst', label: 'GST registered', hint: 'Tax invoice, GSTIN, tax rows' },
  { value: 'composition', label: 'Composition scheme', hint: 'Bill of supply, no tax collected, declaration required' },
  { value: 'unregistered', label: 'Unregistered', hint: 'Bill of supply, no tax rows' },
]

const STATE_LABEL = { always: 'Always', if_present: 'If present', never: 'Never' }

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

/** One field's control — three-state, enum or free text, per its own type. */
const Field = ({ field, onChange, disabled }) => {
  if (field.locked) {
    return (
      <div className="rf-field is-locked">
        <span className="rf-field-name">
          <strong>{field.label}</strong>
          {field.hint && <em>{field.hint}</em>}
        </span>
        <span className="rf-lock" title={field.locked.changeAt ? `Change at ${field.locked.changeAt}` : undefined}>
          <LockIcon />
          {field.locked.reason}
        </span>
      </div>
    )
  }

  return (
    <div className="rf-field">
      <span className="rf-field-name">
        <strong>{field.label}</strong>
        {field.hint && <em>{field.hint}</em>}
      </span>

      {field.type === 'text' ? (
        <input
          className="rf-text"
          aria-label={field.label}
          maxLength={field.maxLength || 120}
          value={field.value}
          disabled={disabled}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      ) : (
        <span className="rf-tri" role="radiogroup" aria-label={field.label}>
          {(field.states || field.options.map((o) => o.value)).map((state) => {
            const label = field.options
              ? field.options.find((o) => o.value === state)?.label
              : STATE_LABEL[state] || state
            return (
              <button
                key={state}
                type="button"
                role="radio"
                aria-checked={field.value === state}
                className={field.value === state ? 'is-on' : ''}
                disabled={disabled}
                onClick={() => onChange(field.key, state)}
              >
                {label}
              </button>
            )
          })}
        </span>
      )}
    </div>
  )
}

const ReceiptFormat = () => {
  const canEdit = useCan(SCOPES.POS_CONFIG_WRITE)

  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [doc, setDoc] = useState('bill')
  const [schema, setSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Unsaved edits, held apart from the loaded schema so Save knows exactly what
  // changed and Discard is a matter of dropping them.
  const [draft, setDraft] = useState({})
  const [sample, setSample] = useState(null)
  const [sampleIsReal, setSampleIsReal] = useState(false)
  const [openSections, setOpenSections] = useState({ header: true, identity: true })

  useEffect(() => {
    posService.getPosBranches()
      .then((list) => {
        setBranches(list)
        setBranchId((b) => b || list[0]?.Id || list[0]?.id || '')
      })
      .catch(() => setBranches([]))
  }, [])

  const load = useCallback(async () => {
    if (!branchId) { setLoading(false); return }
    setLoading(true)
    try {
      setSchema(await posService.getReceiptFormatSchema(branchId, doc))
      setDraft({})
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load the receipt format')
      setSchema(null)
    } finally {
      setLoading(false)
    }
  }, [branchId, doc])

  useEffect(() => { load() }, [load])

  // ── The preview's sale ─────────────────────────────────────────────────────
  // The most recent settled invoice for this branch. A preview built from
  // invented rows is exactly where a field that is never present looks fine.
  useEffect(() => {
    let cancelled = false
    if (!branchId) return undefined
    posService.getLedgerDocuments({ limit: 1, branchId, docType: 'POS Sale', status: 'SETTLED' })
      .then(async (rows) => {
        if (cancelled || !rows?.length) throw new Error('none')
        const full = await posService.getLedgerDocument(rows[0].Id)
        if (cancelled) return
        setSample(full)
        setSampleIsReal(true)
      })
      .catch(() => {
        if (cancelled) return
        // Nothing has been sold yet. Say so rather than showing an empty page.
        setSample(FALLBACK_SALE)
        setSampleIsReal(false)
      })
    return () => { cancelled = true }
  }, [branchId])

  const values = useMemo(() => {
    const out = {}
    ;(schema?.sections || []).forEach((s) => s.fields.forEach((f) => { out[f.key] = f.value }))
    return { ...out, ...draft }
  }, [schema, draft])

  const dirty = Object.keys(draft).length > 0

  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  const save = async () => {
    setSaving(true)
    try {
      setSchema(await posService.updateReceiptFormat(branchId, doc, draft))
      setDraft({})
      toast.success('Receipt format saved')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save the receipt format')
    } finally {
      setSaving(false)
    }
  }

  const changeTaxMode = async (taxMode) => {
    setSaving(true)
    try {
      await posService.setReceiptTaxMode(branchId, taxMode)
      // Reload rather than patch: the mode decides which fields are LOCKED, and
      // guessing that here would be a second copy of the server's rules.
      await load()
      toast.success('Tax mode updated')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to change the tax mode')
    } finally {
      setSaving(false)
    }
  }

  const previewData = useMemo(() => {
    if (!sample) return null
    if (doc === 'kot') return SAMPLE_KOT
    if (doc === 'tokenSlip') {
      return {
        tokenLabel: sample.Source?.label || 'A-14',
        TransactionNo: sample.TransactionNo,
        TransactionDate: sample.TransactionDate,
        GrossAmount: sample.GrossAmount,
        itemCount: (sample.Lines || []).length,
      }
    }
    return {
      ...sample,
      taxMode: schema?.taxMode,
      isReprint: false,
      tokenLabel: sample.Source?.kind === 'token' ? sample.Source.label : null,
      tableName: sample.Source?.kind === 'table' ? sample.Source.label : null,
      OriginalNo: sample.OriginalNo || 'INV-0418',
      ReasonName: sample.ReasonName || 'Quality complaint',
    }
  }, [sample, doc, schema])

  const branchName = branches.find((b) => (b.Id || b.id) === branchId)?.BranchName || ''

  return (
    <div className="rf-page">
      <div className="rf-head">
        <div>
          <h1>🧾 Receipt format</h1>
          <p className="rf-lead">
            What prints on paper, per branch{branchName ? ` — ${branchName}` : ''}. Other outlets keep their own.
          </p>
        </div>
      </div>

      <div className="rf-bar">
        <span className="rf-tabs" role="tablist">
          {(schema?.documents || [{ key: 'bill', label: 'Bill' }]).map((d) => (
            <button
              key={d.key} type="button" role="tab" aria-selected={doc === d.key}
              className={`rf-tab ${doc === d.key ? 'is-on' : ''}`}
              onClick={() => setDoc(d.key)}
            >
              {d.label}
            </button>
          ))}
        </span>
        <span className="rf-bar-right">
          <label className="rf-inline">
            <span>Branch</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="Branch">
              {branches.map((b) => (
                <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName || b.Name}</option>
              ))}
            </select>
          </label>
          {dirty && (
            <button className="fd-btn fd-btn-outline" onClick={() => setDraft({})} disabled={saving}>
              Discard
            </button>
          )}
          <button className="fd-btn fd-btn-primary" onClick={save} disabled={!dirty || saving || !canEdit}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </span>
      </div>

      {/* The mode that decides what the other settings are allowed to be. Its
          own control, above the fields, because changing it re-locks them. */}
      {schema && (
        <div className="rf-mode">
          <span className="rf-mode-label">How this branch charges tax</span>
          <span className="rf-mode-opts">
            {TAX_MODES.map((m) => (
              <button
                key={m.value} type="button"
                className={`rf-mode-opt ${schema.taxMode === m.value ? 'is-on' : ''}`}
                disabled={saving || !canEdit}
                onClick={() => changeTaxMode(m.value)}
              >
                <strong>{m.label}</strong>
                <em>{m.hint}</em>
              </button>
            ))}
          </span>
        </div>
      )}

      {loading ? (
        <div className="fd-loading">Loading the format…</div>
      ) : !schema ? (
        <div className="fd-empty">Pick a branch to configure its receipts.</div>
      ) : (
        <div className="rf-split">
          <div>
            {schema.sections.map((section) => {
              const open = openSections[section.key]
              const hidden = section.fields.filter((f) => f.value === 'never').length
              return (
                <section className={`rf-sect ${open ? '' : 'is-shut'}`} key={section.key}>
                  <button
                    type="button" className="rf-sect-head"
                    aria-expanded={!!open}
                    onClick={() => setOpenSections((o) => ({ ...o, [section.key]: !o[section.key] }))}
                  >
                    <h3>{section.label}</h3>
                    <span className="rf-count">
                      {section.fields.length} field{section.fields.length === 1 ? '' : 's'}
                      {hidden > 0 && ` · ${hidden} hidden`}
                    </span>
                  </button>
                  {open && section.fields.map((f) => (
                    <Field
                      key={f.key}
                      field={{ ...f, value: values[f.key] }}
                      onChange={change}
                      disabled={saving || !canEdit}
                    />
                  ))}
                </section>
              )
            })}
          </div>

          <div className="rf-preview">
            <div className="rf-preview-head">
              <h3>Preview</h3>
              <span className="rf-live">Live</span>
              <span className="rf-preview-note">
                {sampleIsReal ? 'your most recent sale' : 'sample — nothing sold yet'}
              </span>
            </div>
            {previewData && (
              <Receipt doc={doc} format={values} shop={schema.shop} data={previewData} inline />
            )}
            <p className="rf-preview-foot">
              {sampleIsReal
                ? 'Drawn from a real settled sale. A preview built from invented rows is exactly where a field that is never present looks fine.'
                : 'No settled sale on this branch yet, so this is sample data. It will switch to a real one as soon as something is sold.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// Used only until the branch has sold something, and labelled as such on screen.
const FALLBACK_SALE = {
  TransactionNo: 'INV-0001', TransactionDate: new Date().toISOString(),
  CustomerName: 'Aarti K.', CustomerMobile: '98765', CreatedBy: 'cashier',
  Source: { kind: 'token', label: 'A-14' },
  Lines: [
    { Id: 'a', ItemName: 'Paneer Tikka', Quantity: 2, UnitPrice: 240, GrossAmount: 480 },
    { Id: 'b', ItemName: 'Butter Naan', Quantity: 3, UnitPrice: 65, GrossAmount: 195 },
  ],
  TaxByComponent: [{ name: 'CGST', rate: 9, amount: 51.08 }, { name: 'SGST', rate: 9, amount: 51.07 }],
  NetAmount: 572.85, TaxAmount: 102.15, DiscountAmount: 0, RoundOff: 0, GrossAmount: 675,
  Tenders: [{ Id: 't', PaymentMode: 'Cash', Amount: 675 }],
  ReturnedAmount: 0, NetOfReturns: 675,
}

const SAMPLE_KOT = {
  KotNo: 'KOT-0231', CreatedOn: new Date().toISOString(),
  tableName: 'TABLE 7', round: 2, waiter: 'ravi',
  Lines: [
    { Id: 'a', ItemName: 'Paneer Tikka', Quantity: 2, Note: 'Jain — no onion garlic', GrossAmount: 480 },
    { Id: 'b', ItemName: 'Butter Naan', Quantity: 3, GrossAmount: 195 },
  ],
}

export default ReceiptFormat
