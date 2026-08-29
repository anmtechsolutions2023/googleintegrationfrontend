import React, { useState } from 'react'
import './campaigns.css'

/**
 * A campaign's own settings — when it runs, where, and what it may spend.
 *
 * ONE form for both creating and editing. Two copies of a form with six date,
 * day and time controls is two places for a rule to be typed differently, and
 * the one that drifts is the one nobody is looking at.
 */

export const DAYS = [
  { value: '1', label: 'Mon' }, { value: '2', label: 'Tue' }, { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' }, { value: '5', label: 'Fri' }, { value: '6', label: 'Sat' },
  { value: '7', label: 'Sun' },
]

const today = () => new Date().toISOString().slice(0, 10)

/** MySQL hands TIME back as HH:MM:SS; an <input type="time"> wants HH:MM. */
const asInputTime = (t) => (t ? String(t).slice(0, 5) : '')
const asInputDate = (d) => (d ? String(d).slice(0, 10) : '')

/**
 * A campaign row as the form wants it. Editing starts from what is stored;
 * creating starts from a DRAFT — a campaign that goes live the instant it is
 * saved is one nobody had a chance to read back.
 */
export const toFormValues = (campaign) => (campaign ? {
  Name: campaign.Name || '',
  Code: campaign.Code || '',
  Description: campaign.Description || '',
  StartsOn: asInputDate(campaign.StartsOn),
  EndsOn: asInputDate(campaign.EndsOn),
  DaysOfWeek: campaign.DaysOfWeek || '',
  StartTime: asInputTime(campaign.StartTime),
  EndTime: asInputTime(campaign.EndTime),
  BudgetAmount: campaign.BudgetAmount === null || campaign.BudgetAmount === undefined
    ? '' : String(Number(campaign.BudgetAmount)),
  Status: campaign.Status || 'DRAFT',
  branchIds: campaign.branchIds || [],
} : {
  Name: '', Code: '', Description: '',
  StartsOn: today(), EndsOn: '', DaysOfWeek: '',
  StartTime: '', EndTime: '', BudgetAmount: '',
  Status: 'DRAFT', branchIds: [],
})

/** The shape the API takes. Blank means "no limit", not zero. */
export const toPayload = (form) => ({
  ...form,
  Code: String(form.Code || '').trim().toUpperCase(),
  EndsOn: form.EndsOn || null,
  DaysOfWeek: form.DaysOfWeek || null,
  StartTime: form.StartTime || null,
  EndTime: form.EndTime || null,
  BudgetAmount: form.BudgetAmount === '' ? null : Number(form.BudgetAmount),
  Description: form.Description || null,
})

const CampaignForm = ({
  campaign, branches = [], saving, submitLabel, onCancel, onSubmit,
}) => {
  const [form, setForm] = useState(() => toFormValues(campaign))
  const editing = !!campaign

  const setDay = (value) => {
    const on = new Set(String(form.DaysOfWeek || '').split(',').filter(Boolean))
    if (on.has(value)) on.delete(value); else on.add(value)
    setForm({ ...form, DaysOfWeek: [...on].sort().join(',') })
  }

  // A window of zero length fires on nothing, and one half of a window is
  // ambiguous. The server refuses both — saying so here means finding out
  // while the form is still open rather than after pressing Save.
  const from = form.StartTime
  const to = form.EndTime
  const windowError = (from && to && from === to)
    ? 'Same start and end is a window of zero length — the campaign would never run.'
    : ((from && !to) || (!from && to))
      ? 'Give both a start and an end time, or neither for all day.'
      : null

  const ok = form.Name.trim() && form.Code.trim() && form.StartsOn && !windowError

  return (
    <div className="cmp-modal">
      <h3>{editing ? 'Edit campaign' : 'New campaign'}</h3>
      <p className="muted small" style={{ margin: '0 0 14px' }}>
        {editing
          ? 'When it runs, where, and what it may spend. The offers inside it are on the page behind.'
          : 'The container. You add the offers next.'}
      </p>

      <div className="cmp-grid">
        <label className="cmp-field">
          <span>Name<i>*</i></span>
          <input value={form.Name} onChange={(e) => setForm({ ...form, Name: e.target.value })} />
        </label>
        <label className="cmp-field">
          <span>Code<i>*</i></span>
          <input
            value={form.Code}
            // The code identifies the campaign in reports; changing it after
            // launch orphans nothing (redemptions key on the id) but it does
            // rename history, so it stays editable and unremarkable.
            onChange={(e) => setForm({ ...form, Code: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="cmp-field">
          <span>Starts<i>*</i></span>
          <input type="date" value={form.StartsOn}
            onChange={(e) => setForm({ ...form, StartsOn: e.target.value })} />
        </label>
        <label className="cmp-field">
          <span>Ends</span>
          <input type="date" aria-label="Ends" value={form.EndsOn}
            onChange={(e) => setForm({ ...form, EndsOn: e.target.value })} />
          <small>Blank runs until stopped</small>
        </label>
        <label className="cmp-field">
          <span>From</span>
          <input type="time" aria-label="From" value={form.StartTime}
            onChange={(e) => setForm({ ...form, StartTime: e.target.value })} />
        </label>
        <label className="cmp-field">
          <span>To</span>
          <input type="time" aria-label="To" value={form.EndTime}
            onChange={(e) => setForm({ ...form, EndTime: e.target.value })} />
          <small>Both blank runs all day</small>
        </label>
      </div>

      {windowError && <p className="cmp-error" role="alert">{windowError}</p>}

      <div className="cmp-field" style={{ marginTop: 12 }}>
        <span>Days</span>
        <div className="cmp-days">
          {DAYS.map((d) => (
            <button
              key={d.value} type="button"
              className={String(form.DaysOfWeek || '').split(',').includes(d.value) ? 'is-on' : ''}
              onClick={() => setDay(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <small>None selected runs every day</small>
      </div>

      <label className="cmp-field" style={{ marginTop: 12 }}>
        <span>Budget</span>
        <input
          type="number" min="0" placeholder="e.g. 25000"
          aria-label="Budget"
          value={form.BudgetAmount}
          onChange={(e) => setForm({ ...form, BudgetAmount: e.target.value })}
        />
        <small>
          What it may give away in total. It stops giving away at this figure and says so.
          Blank is an open tab.
        </small>
      </label>

      <div className="cmp-field" style={{ marginTop: 12 }}>
        <span>Branches</span>
        <div className="cmp-branches">
          {branches.map((b) => {
            const id = b.Id || b.id
            const on = form.branchIds.includes(id)
            return (
              <button
                key={id} type="button" className={on ? 'is-on' : ''}
                onClick={() => setForm({
                  ...form,
                  branchIds: on ? form.branchIds.filter((x) => x !== id) : [...form.branchIds, id],
                })}
              >
                {b.BranchName || b.Name}
              </button>
            )
          })}
        </div>
        <small>None selected runs at every branch</small>
      </div>

      <div className="cmp-actions">
        <button className="fd-btn fd-btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
        <button
          className="fd-btn fd-btn-primary"
          onClick={() => onSubmit(toPayload(form))}
          disabled={saving || !ok}
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

export default CampaignForm
