import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import BranchGstinList from './BranchGstinList'

const REASONS = [
  {
    value: 'composition',
    label: 'Composition scheme',
    hint: 'Bills print Bill of supply with the composition declaration at the foot.',
  },
  {
    value: 'unregistered',
    label: 'Not registered for GST',
    hint: 'Bills print Bill of supply, with no GSTIN and no declaration.',
  },
]

const reasonLabel = (value) => REASONS.find((r) => r.value === value)?.label || 'Off'

const when = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const describeOpen = (o) => `${o.orderNo}${o.tableName ? ` · table ${o.tableName}` : ` · ${o.orderType || 'counter'}`}`

/**
 * The tenant's GST switch.
 *
 * One value for the whole business, which is why it sits above the per-branch
 * settings. Moving it never edits a price: pricing simply stops (or starts)
 * working tax out of, or adding it to, the menu price from the next order.
 *
 * Turning it either way is confirmed first, and refused while any order is open —
 * the server enforces that too; the card just says so before the click.
 */
const GstSettingsCard = ({ canWrite }) => {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // { kind: 'off' | 'on' | 'blocked', reason? }
  const [dialog, setDialog] = useState(null)

  const load = useCallback(async () => {
    try {
      setStatus(await posService.getTaxSettings())
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (payload, successMessage) => {
    setSaving(true)
    try {
      setStatus(await posService.updateTaxSettings(payload))
      toast.success(successMessage)
      setDialog(null)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not change the GST setting')
      // A 409 means an order opened since this card loaded — show which.
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <section className="fd-setting-card"><div className="fd-loading">Loading GST…</div></section>
  if (!status) {
    return (
      <section className="fd-setting-card">
        <h2>GST</h2>
        <p className="fd-setting-desc">The GST setting could not be loaded.</p>
      </section>
    )
  }

  const charging = status.gstCharging !== false
  const openOrders = status.openOrders || []

  const requestToggle = () => {
    if (!canWrite || saving) return
    if (openOrders.length > 0) { setDialog({ kind: 'blocked' }); return }
    setDialog(charging ? { kind: 'off', reason: 'composition' } : { kind: 'on' })
  }

  return (
    <section className="fd-setting-card fd-gst-card">
      <h2>GST</h2>
      <p className="fd-setting-desc">
        Whether bills charge GST. Menu prices and each dish&apos;s tax group are never changed by
        this — only whether tax is worked out of, or added to, the price.
      </p>

      <label className="fd-toggle-row fd-gst-toggle">
        <span>
          <strong>Charge GST on sales</strong>
          <small>
            {charging
              ? 'On — tax invoices, CGST/SGST on every bill'
              : `Off — ${reasonLabel(status.offReason)}${status.updatedOn ? ` · since ${when(status.updatedOn)}` : ''}`}
          </small>
        </span>
        <input
          type="checkbox"
          className="fd-switch"
          checked={charging}
          disabled={!canWrite || saving}
          onChange={requestToggle}
          aria-label="Charge GST on sales"
        />
      </label>

      {!charging && (
        <div className="fd-gst-block">
          <span className="fd-gst-label">Why GST is off</span>
          <div className="fd-setting-options">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className={`fd-setting-option ${status.offReason === r.value ? 'is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="gst-off-reason"
                  checked={status.offReason === r.value}
                  disabled={!canWrite || saving}
                  // Changes only what the receipt prints, never an amount, so it
                  // saves at once and is not held up by open tables.
                  onChange={() => save({ gstCharging: false, offReason: r.value }, 'Saved')}
                />
                <span>
                  <strong>{r.label}</strong>
                  <em>{r.hint}</em>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {openOrders.length > 0 && (
        <p className="fd-gst-open-note">
          {openOrders.length} order{openOrders.length === 1 ? ' is' : 's are'} still open. The
          switch waits until {openOrders.length === 1 ? 'it is' : 'they are'} settled.
        </p>
      )}

      {Array.isArray(status.branches) && (
        <div className="fd-gst-block">
          <span className="fd-gst-label">GSTIN by branch</span>
          <p className="fd-setting-desc">
            Printed on every tax invoice and saved with it, so the GST report files each bill under
            the registration that issued it. A change applies to bills settled from then on.
          </p>
          {charging && status.branches.some((b) => !b.gstin) && (
            <p className="fd-gst-open-note">
              GST is on, but {status.branches.filter((b) => !b.gstin).map((b) => b.name).join(', ')}{' '}
              {status.branches.filter((b) => !b.gstin).length === 1 ? 'has' : 'have'} no GSTIN. Those
              tax invoices print without one, and the GST pack cannot be exported for{' '}
              {status.branches.filter((b) => !b.gstin).length === 1 ? 'it' : 'them'}.
            </p>
          )}
          <BranchGstinList branches={status.branches} canWrite={canWrite} onSaved={setStatus} />
        </div>
      )}

      {(status.history || []).length > 0 && (
        <div className="fd-gst-block">
          <span className="fd-gst-label">History</span>
          <div className="fd-table-scroll">
            <table className="fd-table">
              <thead>
                <tr><th>When</th><th>Change</th><th>By</th></tr>
              </thead>
              <tbody>
                {status.history.map((h) => (
                  <tr key={h.id}>
                    <td>{when(h.changedOn)}</td>
                    <td>
                      {h.fromCharging ? 'On' : 'Off'} → {h.toCharging ? 'On' : 'Off'}
                      {!h.toCharging && h.offReason && <span className="muted"> ({reasonLabel(h.offReason)})</span>}
                    </td>
                    <td>{h.changedBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dialog?.kind === 'off' && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Stop charging GST">
          <div className="fd-gst-dialog">
            <h3>Stop charging GST?</h3>
            <p className="fd-gst-dialog-sub">Every branch · from the next order placed</p>

            <span className="fd-gst-label">What changes</span>
            <ul className="fd-gst-list">
              <li>Bills, receipts and the till show one Total — no CGST, SGST or GST by item.</li>
              <li>Receipts print <strong>Bill of supply</strong> and drop the GSTIN.</li>
              <li>Dishes priced <strong>excluding</strong> tax get cheaper for the guest by the tax that used to be added.</li>
            </ul>
            <span className="fd-gst-label">What does not</span>
            <ul className="fd-gst-list">
              <li>Menu prices, and the tax group on each dish.</li>
              <li>Bills already settled — they keep the GST they were issued with.</li>
              <li>Sales are still recorded in full. Reports mark them as sold without GST.</li>
            </ul>

            <span className="fd-gst-label">Why</span>
            <div className="fd-setting-options">
              {REASONS.map((r) => (
                <label key={r.value} className={`fd-setting-option ${dialog.reason === r.value ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="gst-dialog-reason"
                    checked={dialog.reason === r.value}
                    onChange={() => setDialog((d) => ({ ...d, reason: r.value }))}
                  />
                  <span><strong>{r.label}</strong><em>{r.hint}</em></span>
                </label>
              ))}
            </div>

            <div className="fd-gst-dialog-actions">
              <button type="button" className="fd-btn fd-btn-outline" onClick={() => setDialog(null)} disabled={saving}>
                Keep charging GST
              </button>
              <button
                type="button"
                className="fd-btn fd-btn-primary"
                disabled={saving}
                onClick={() => save({ gstCharging: false, offReason: dialog.reason }, 'GST is off from the next order')}
              >
                {saving ? 'Saving…' : 'Stop charging GST'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'on' && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Start charging GST">
          <div className="fd-gst-dialog">
            <h3>Start charging GST again?</h3>
            <p className="fd-gst-dialog-sub">Every branch · from the next order placed</p>
            <ul className="fd-gst-list">
              <li>Each dish is taxed by its own tax group again — inclusive prices stay the same, exclusive ones have tax added.</li>
              <li>Receipts print <strong>Tax invoice</strong> with the branch GSTIN.</li>
              <li>Bills issued while GST was off keep printing as bills of supply.</li>
            </ul>
            <div className="fd-gst-dialog-actions">
              <button type="button" className="fd-btn fd-btn-outline" onClick={() => setDialog(null)} disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                className="fd-btn fd-btn-primary"
                disabled={saving}
                onClick={() => save({ gstCharging: true }, 'GST is on from the next order')}
              >
                {saving ? 'Saving…' : 'Start charging GST'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'blocked' && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Settle open orders first">
          <div className="fd-gst-dialog">
            <h3>Settle open orders first</h3>
            <p className="fd-gst-dialog-sub">
              These were ordered under the current setting. Switching now would put GST on some of
              their rounds and not others.
            </p>
            <ul className="fd-gst-list">
              {openOrders.map((o) => (
                <li key={o.id}>{describeOpen(o)} <span className="muted">· ₹{(Number(o.total) || 0).toFixed(2)}</span></li>
              ))}
            </ul>
            <div className="fd-gst-dialog-actions">
              <button type="button" className="fd-btn fd-btn-outline" onClick={() => { setDialog(null); load() }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default GstSettingsCard
