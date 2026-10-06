import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { useExports } from '../../hooks/useExports'
import posService from '../../services/posService'
import exportService from '../../services/exportService'
import { PERIODS } from './ExportDialog'
import '../frontdesk/collect.css'
import './export.css'

const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * "Download all for a period" — every Insights report this person may open,
 * one CSV each, in a .zip with a README. The month-end hand-over to the
 * accountant in one click. Not drawn for someone who can open none of them.
 */
const ReportsBundleButton = () => {
  const { exports } = useExports()
  const included = exports.filter((e) => e.inBundle)
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState('month')
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    posService.getPosBranches().then(setBranches).catch(() => setBranches([]))
    const onKey = (e) => { if (e.key === 'Escape' && !busy) setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy])

  if (!included.length) return null
  const customInvalid = preset === 'custom' && (!fromDate || !toDate || fromDate > toDate)

  const download = async (e) => {
    e.preventDefault()
    if (busy || customInvalid) return
    setBusy(true)
    try {
      const name = await exportService.downloadReportsBundle({
        preset, ...(preset === 'custom' ? { fromDate, toDate } : {}), branchId,
      })
      toast.success(`Downloaded ${name}`)
      setOpen(false)
    } catch (err) {
      toast.error(await exportService.downloadErrorMessage(err, 'The reports could not be bundled. Try again.'))
    }
    setBusy(false)
  }

  return (
    <>
      <button type="button" className="fd-btn fd-btn-outline fd-export-btn" onClick={() => setOpen(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
        </svg>
        Download all (.zip)
      </button>
      {open && (
        <div className="fd-modal-backdrop fd-collect-backdrop" onClick={() => !busy && setOpen(false)}>
          <form
            className="fd-collect fd-export" role="dialog" aria-modal="true" aria-labelledby="fd-bundle-title"
            onClick={(e) => e.stopPropagation()} onSubmit={download} noValidate
          >
            <div className="fd-collect-head">
              <div>
                <h3 id="fd-bundle-title">Download every report</h3>
                <span className="fd-collect-sub">One CSV per report, zipped, with a README of the period and branch.</span>
              </div>
              <button type="button" className="fd-collect-x" onClick={() => setOpen(false)} aria-label="Close" disabled={busy}>×</button>
            </div>

            <fieldset className="fd-collect-field">
              <legend className="fd-collect-label">Period</legend>
              <div className="fd-export-chips">
                {PERIODS.map(([key, label]) => (
                  <button
                    key={key} type="button" aria-pressed={preset === key}
                    className={`fd-export-chip${preset === key ? ' is-on' : ''}`}
                    onClick={() => setPreset(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {preset === 'custom' && (
                <div className="fd-export-dates">
                  <label>From <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
                  <label>To <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
                </div>
              )}
            </fieldset>

            <div className="fd-collect-field">
              <label className="fd-collect-label" htmlFor="fd-bundle-branch">Branch</label>
              <select id="fd-bundle-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName}</option>)}
              </select>
            </div>

            <div className="fd-collect-field">
              <span className="fd-collect-label">Included</span>
              <span className="fd-collect-hint">{included.map((e) => e.label).join(' · ')}</span>
            </div>

            {customInvalid && <div className="fd-collect-outcome is-err" role="alert">Choose a From date on or before the To date.</div>}

            <div className="fd-collect-foot">
              <span className="fd-collect-hint">Recorded in the audit log with your name.</span>
              <div className="fd-collect-btns">
                <button type="button" className="fd-btn fd-btn-outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="fd-btn fd-btn-primary" disabled={busy || customInvalid}>
                  {busy ? 'Preparing…' : 'Download .zip'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

export default ReportsBundleButton
