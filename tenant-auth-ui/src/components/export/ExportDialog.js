import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import exportService from '../../services/exportService'
import '../frontdesk/collect.css'
import './export.css'

// The periods the server's date resolver knows. "month" is a rolling 30 days.
export const PERIODS = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'Last 7 days'],
  ['month', 'Last 30 days'],
  ['custom', 'Custom…'],
]

const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The one Export dialog every screen opens.
 *
 * It starts from the screen: the same period, branch and filters, so most
 * people press Download without touching anything. What it shows before the
 * download — the row count, the file name, whether mobiles are masked — comes
 * from the server's preview of the same query, so the number on the button is
 * the number of rows in the file.
 *
 * @param {Object} props
 * @param {Object} props.def - The export, as GET /api/exports describes it.
 * @param {boolean} props.canUnmask - May this person write mobiles in full?
 * @param {Object} [props.context] - What the screen is showing:
 *   { preset, fromDate, toDate, branchId, bucket, filters: {…}, filterLabels: ['Status: Settled'] }
 * @param {Function} props.onClose
 */
const ExportDialog = ({ def, canUnmask, context = {}, onClose }) => {
  const screenFilters = useMemo(() => Object.fromEntries(
    Object.entries(context.filters || {}).filter(([k, v]) => def.filters.includes(k) && v !== '' && v !== null && v !== undefined),
  ), [context.filters, def.filters])
  const hasScreenFilters = Object.keys(screenFilters).length > 0

  const [preset, setPreset] = useState(context.preset || (context.fromDate ? 'custom' : 'month'))
  const [fromDate, setFromDate] = useState(context.fromDate || todayISO())
  const [toDate, setToDate] = useState(context.toDate || context.fromDate || todayISO())
  const [branchId, setBranchId] = useState(context.branchId || '')
  const [branches, setBranches] = useState([])
  const [useFilters, setUseFilters] = useState(true)
  const [groups, setGroups] = useState(() => new Set(def.groups.filter((g) => g.default).map((g) => g.key)))
  const [unmask, setUnmask] = useState(false)
  const [preview, setPreview] = useState({ loading: true, data: null, error: null })
  const [busy, setBusy] = useState(false)

  const hasMobiles = def.columns.some((c) => c.header === 'Mobile')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  useEffect(() => {
    if (!def.branchable) return
    posService.getPosBranches().then(setBranches).catch(() => setBranches([]))
  }, [def.branchable])

  const params = useMemo(() => ({
    ...(def.dated ? { preset, ...(preset === 'custom' ? { fromDate, toDate } : {}) } : {}),
    ...(def.branchable && branchId ? { branchId } : {}),
    ...(def.bucketed && context.bucket ? { bucket: context.bucket } : {}),
    ...(def.groups.length ? { groups: [...groups].join(',') } : {}),
    ...(unmask ? { unmask: true } : {}),
    ...(useFilters ? screenFilters : {}),
  }), [def, preset, fromDate, toDate, branchId, groups, unmask, useFilters, screenFilters, context.bucket])

  const customInvalid = def.dated && preset === 'custom' && (!fromDate || !toDate || fromDate > toDate)

  // The preview follows every change, a beat behind the last keystroke.
  useEffect(() => {
    if (customInvalid) return undefined
    let live = true
    setPreview((p) => ({ ...p, loading: true, error: null }))
    const t = setTimeout(() => {
      exportService.previewExport(def.key, params)
        .then((data) => { if (live) setPreview({ loading: false, data, error: null }) })
        .catch((err) => {
          if (live) setPreview({ loading: false, data: null, error: err?.response?.data?.message || 'Could not count the rows.' })
        })
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [def.key, params, customInvalid])

  const toggleGroup = (key) => setGroups((cur) => {
    const next = new Set(cur)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  const rowCount = preview.data?.rowCount
  const canDownload = !busy && !preview.loading && !preview.error && !customInvalid && rowCount > 0

  const download = async (e) => {
    e.preventDefault()
    if (!canDownload) return
    setBusy(true)
    try {
      const name = await exportService.downloadExport(def.key, params)
      toast.success(`Downloaded ${name}`)
      // Closing unmounts the dialog, so busy is not reset after it.
      onClose()
    } catch (err) {
      toast.error(await exportService.downloadErrorMessage(err, 'The export could not be built. Try again.'))
      setBusy(false)
    }
  }

  const rowsLabel = rowCount === 1 ? '1 row' : `${(rowCount || 0).toLocaleString('en-IN')} rows`
  let buttonLabel = `Download ${rowsLabel}`
  if (busy) buttonLabel = 'Preparing…'
  else if (preview.loading) buttonLabel = 'Counting…'
  else if (rowCount === 0) buttonLabel = 'No rows to export'

  return (
    <div className="fd-modal-backdrop fd-collect-backdrop" onClick={() => !busy && onClose()}>
      <form
        className="fd-collect fd-export"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-export-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={download}
        noValidate
      >
        <div className="fd-collect-head">
          <div>
            <h3 id="fd-export-title">Export {def.label}</h3>
            <span className="fd-collect-sub">{def.where} · one row per {def.grain}</span>
          </div>
          <button type="button" className="fd-collect-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
        </div>

        {def.pii && (
          <div className="fd-export-pii" role="note">
            <b>This file holds personal data.</b>
            <span>Keep it off shared drives and delete it when you are done. The download is recorded in the audit log.</span>
          </div>
        )}

        {def.dated && (
          <fieldset className="fd-collect-field">
            <legend className="fd-collect-label">Period</legend>
            <div className="fd-export-chips">
              {PERIODS.map(([key, label]) => (
                <button
                  key={key} type="button"
                  className={`fd-export-chip${preset === key ? ' is-on' : ''}`}
                  aria-pressed={preset === key}
                  onClick={() => setPreset(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="fd-export-dates">
                <label>From <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} /></label>
                <label>To <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} /></label>
              </div>
            )}
            {preview.data?.range && preset !== 'custom' && (
              <span className="fd-collect-hint">{preview.data.range.from} to {preview.data.range.to}</span>
            )}
          </fieldset>
        )}

        {def.branchable && (
          <div className="fd-collect-field">
            <label className="fd-collect-label" htmlFor="fd-export-branch">Branch</label>
            <select id="fd-export-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName}</option>)}
            </select>
          </div>
        )}

        {hasScreenFilters && (
          <fieldset className="fd-collect-field">
            <legend className="fd-collect-label">Rows</legend>
            <label className="fd-export-option">
              <input type="radio" name="fd-export-rows" checked={useFilters} onChange={() => setUseFilters(true)} />
              <span>As filtered on screen{context.filterLabels?.length ? <em> · {context.filterLabels.join(' · ')}</em> : null}</span>
            </label>
            <label className="fd-export-option">
              <input type="radio" name="fd-export-rows" checked={!useFilters} onChange={() => setUseFilters(false)} />
              <span>Everything in the period</span>
            </label>
          </fieldset>
        )}

        {def.groups.length > 0 && (
          <fieldset className="fd-collect-field">
            <legend className="fd-collect-label">Columns</legend>
            <label className="fd-export-option">
              <input type="checkbox" checked disabled />
              <span>Core columns <em>· always</em></span>
            </label>
            {def.groups.map((g) => (
              <label key={g.key} className="fd-export-option">
                <input type="checkbox" checked={groups.has(g.key)} onChange={() => toggleGroup(g.key)} />
                <span>{g.label}</span>
              </label>
            ))}
          </fieldset>
        )}

        {hasMobiles && (canUnmask ? (
          <label className="fd-export-option">
            <input type="checkbox" checked={!unmask} onChange={(e) => setUnmask(!e.target.checked)} />
            <span>
              Mask mobile numbers
              <em className="fd-export-sub">98450 •••45. Turn off only if you need to contact these people.</em>
            </span>
          </label>
        ) : (
          <span className="fd-collect-hint">Mobile numbers are masked (98450 •••45).</span>
        ))}

        <div className="fd-export-file">
          <span>File</span>
          <code>{preview.data?.fileName || '…'}</code>
        </div>

        {customInvalid && <div className="fd-collect-outcome is-err" role="alert">Choose a From date on or before the To date.</div>}
        {preview.error && <div className="fd-collect-outcome is-err" role="alert">{preview.error}</div>}

        <div className="fd-collect-foot">
          <span className="fd-collect-hint">Recorded in the audit log with your name.</span>
          <div className="fd-collect-btns">
            <button type="button" className="fd-btn fd-btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="fd-btn fd-btn-primary" disabled={!canDownload}>{buttonLabel}</button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default ExportDialog
