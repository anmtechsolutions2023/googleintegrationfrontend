import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import {
  GSTIN_EXAMPLE, GSTIN_LENGTH, gstinProblem, normaliseGstin, stateOfGstin,
} from '../../utils/gstin'

/**
 * Each branch's GSTIN, edited in place.
 *
 * Used by POS Settings → GST for every branch, and by the GST report for the
 * one branch it is exporting when that branch has none. Saving answers with the
 * whole GST status, which is handed to `onSaved` so the caller can replace what
 * it holds rather than refetch.
 *
 * A GSTIN takes effect from the next bill SETTLED: each invoice keeps the one it
 * was issued with, so changing it never rewrites a document already given out.
 */
const BranchGstinRow = ({ branch, canWrite, onSaved }) => {
  const saved = normaliseGstin(branch.gstin)
  const [draft, setDraft] = useState(saved)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  // A save elsewhere (or a reload) moves the stored value under us.
  useEffect(() => { setDraft(saved); setTouched(false) }, [saved])

  const value = normaliseGstin(draft)
  const problem = gstinProblem(value)
  const changed = value !== saved
  const state = stateOfGstin(value)
  const inputId = `gstin-${branch.id}`
  const noteId = `${inputId}-note`
  // Not while the first few characters are still going in.
  const showProblem = !!problem && (touched || value.length >= GSTIN_LENGTH)

  const save = async () => {
    if (!changed || problem || saving) return
    setSaving(true)
    try {
      const status = await posService.updateBranchGstin(branch.id, value)
      toast.success(value ? `GSTIN saved for ${branch.name}` : `GSTIN removed from ${branch.name}`)
      if (onSaved) onSaved(status)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not save the GSTIN')
    } finally {
      setSaving(false)
    }
  }

  let note
  if (showProblem) note = <span className="fd-gstin-note is-bad">{problem}</span>
  else if (state) note = <span className="fd-gstin-note is-ok">Registered in {state}</span>
  else if (!value && saved) note = <span className="fd-gstin-note">Save to remove it. Bills settled afterwards print without a GSTIN.</span>
  else if (!value) note = <span className="fd-gstin-note">No GSTIN yet. Tax invoices from this branch print without one.</span>
  else note = <span className="fd-gstin-note">{GSTIN_LENGTH - value.length} more to go</span>

  if (!canWrite) {
    return (
      <div className="fd-gstin-row">
        <span className="fd-gstin-name">{branch.name || 'Unnamed branch'}</span>
        <span className="fd-gstin-value">{saved || 'No GSTIN'}</span>
        {branch.valid === false && (
          <div className="fd-gstin-foot"><span className="fd-gstin-note is-bad">{gstinProblem(saved)}</span></div>
        )}
      </div>
    )
  }

  return (
    <div className="fd-gstin-row">
      <label className="fd-gstin-name" htmlFor={inputId}>{branch.name || 'Unnamed branch'}</label>
      <div className="fd-gstin-edit">
        <input
          id={inputId}
          className="fd-gstin-input"
          value={draft}
          placeholder={GSTIN_EXAMPLE}
          maxLength={GSTIN_LENGTH}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={showProblem ? true : undefined}
          aria-describedby={noteId}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value.toUpperCase().replace(/\s+/g, ''))}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            setTouched(true)
            save()
          }}
        />
        <button
          type="button"
          className="fd-btn fd-btn-primary fd-btn-sm"
          disabled={!changed || !!problem || saving}
          onClick={save}
        >
          {saving ? 'Saving…' : (!value && saved ? 'Remove' : 'Save')}
        </button>
      </div>
      <div className="fd-gstin-foot" id={noteId}>{note}</div>
    </div>
  )
}

const BranchGstinList = ({ branches = [], canWrite = false, onSaved }) => {
  if (branches.length === 0) {
    return <p className="fd-setting-desc">No branches yet. Add one under Organization → Branch Details.</p>
  }
  return (
    <div className="fd-gstin-list">
      {branches.map((b) => (
        <BranchGstinRow key={b.id} branch={b} canWrite={canWrite} onSaved={onSaved} />
      ))}
    </div>
  )
}

export default BranchGstinList
