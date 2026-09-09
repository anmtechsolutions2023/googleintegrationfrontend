import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import { genericGet, genericPut, genericDelete } from '../../services/posService'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'
import LoadingSpinner from '../../components/LoadingSpinner'
import './categorySchedules.css'

// The API answers with two envelopes: list endpoints put rows in `data`,
// single-record and custom-lookup endpoints put them in `message`. The schedule
// read is the second kind, so reading `data` alone got the success STRING and
// the editor showed "could not load" on a schedule that had loaded fine.
// Mirrors posService's own toArray rather than guessing per call site.
const rowsOf = (res) => {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.message)) return res.message
  return []
}

// When a menu category is available — the rules behind "Breakfast disappears at
// 11".
//
// NOT a PosCrudPage. A weekly schedule is edited as a WHOLE and saved in one
// PUT: row-by-row CRUD would let a portal read a half-saved menu (Tuesday
// saved, Wednesday not). The API mirrors that — PUT replaces the week, and an
// empty rule list clears it.
//
// THE DEFAULT IS AVAILABLE. A category with no rules is on the menu all the
// time; that is not an unconfigured state to warn about, it is what almost
// every category should be. The UI says so plainly rather than nagging.

const DAYS = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
]

// The API stores HH:MM:SS; <input type="time"> speaks HH:MM.
const toInputTime = (t) => String(t || '').slice(0, 5)

const dayShort = (d) => DAYS.find((x) => x.value === Number(d))?.short ?? '?'

const CategorySchedules = () => {
  const { user } = useAuth()
  const canWrite = hasScope(user, [SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN])

  const [categories, setCategories] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingRules, setLoadingRules] = useState(false)
  const [saving, setSaving] = useState(false)

  const selected = categories.find((c) => c.Id === selectedId)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await genericGet('/api/categories', { limit: 100 })
        if (!cancelled) setCategories(rowsOf(res))
      } catch {
        if (!cancelled) toast.error('Could not load categories')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const loadRules = useCallback(async (categoryId) => {
    if (!categoryId) { setRules([]); return }
    setLoadingRules(true)
    try {
      const res = await genericGet(`/api/pos/category-schedules/${categoryId}`)
      setRules(rowsOf(res).map((r) => ({
        DayOfWeek: Number(r.DayOfWeek),
        StartTime: toInputTime(r.StartTime),
        EndTime: toInputTime(r.EndTime),
      })))
    } catch {
      toast.error('Could not load this schedule')
      setRules([])
    } finally {
      setLoadingRules(false)
    }
  }, [])

  useEffect(() => { loadRules(selectedId) }, [selectedId, loadRules])

  const addRule = () =>
    setRules((prev) => [...prev, { DayOfWeek: 1, StartTime: '09:00', EndTime: '17:00' }])

  const updateRule = (index, patch) =>
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const removeRule = (index) =>
    setRules((prev) => prev.filter((_, i) => i !== index))

  // Mirrors the server rule so the user is told before a round trip: a window
  // that starts and ends at the same moment never fires.
  const zeroLength = rules.some((r) => r.StartTime === r.EndTime)

  const save = async () => {
    if (zeroLength) {
      toast.error('A window cannot start and end at the same time.')
      return
    }
    setSaving(true)
    try {
      await genericPut(`/api/pos/category-schedules/${selectedId}`, { Rules: rules })
      toast.success(
        rules.length === 0
          ? 'Schedule cleared — this category is always available'
          : 'Schedule saved',
      )
      await loadRules(selectedId)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save the schedule')
    } finally {
      setSaving(false)
    }
  }

  const clearAll = async () => {
    setSaving(true)
    try {
      await genericDelete(`/api/pos/category-schedules/${selectedId}`)
      toast.success('Schedule cleared — this category is always available')
      await loadRules(selectedId)
    } catch {
      toast.error('Could not clear the schedule')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="cs-page">
      <header className="cs-head">
        <h1>Category Availability</h1>
        <p>
          Choose a category to set when it appears on the menu. A category with no
          rules is available <strong>all the time</strong> — that is the default.
        </p>
      </header>

      <div className="cs-picker">
        <label htmlFor="cs-category">Category</label>
        <select
          id="cs-category"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">Select a category…</option>
          {categories.map((c) => (
            <option key={c.Id} value={c.Id}>
              {c.ParentName ? `${c.ParentName} → ${c.Name}` : c.Name}
            </option>
          ))}
        </select>
      </div>

      {!selectedId && (
        <p className="cs-empty">Pick a category above to see its schedule.</p>
      )}

      {selectedId && loadingRules && <LoadingSpinner />}

      {selectedId && !loadingRules && (
        <section className="cs-editor">
          <div className="cs-status" data-always={rules.length === 0 ? 'true' : 'false'}>
            {rules.length === 0
              ? `“${selected?.Name}” is available all the time.`
              : `“${selected?.Name}” is available only during the ${rules.length} window${rules.length === 1 ? '' : 's'} below.`}
          </div>

          {rules.length > 0 && (
            <ul className="cs-rules">
              {rules.map((rule, i) => (
                <li key={i} className="cs-rule">
                  <span className="cs-rule-badge" aria-hidden="true">{dayShort(rule.DayOfWeek)}</span>

                  <label className="cs-field">
                    <span>Day</span>
                    <select
                      value={rule.DayOfWeek}
                      disabled={!canWrite}
                      onChange={(e) => updateRule(i, { DayOfWeek: Number(e.target.value) })}
                    >
                      {DAYS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="cs-field">
                    <span>From</span>
                    <input
                      type="time"
                      value={rule.StartTime}
                      disabled={!canWrite}
                      onChange={(e) => updateRule(i, { StartTime: e.target.value })}
                    />
                  </label>

                  <label className="cs-field">
                    <span>To</span>
                    <input
                      type="time"
                      value={rule.EndTime}
                      disabled={!canWrite}
                      onChange={(e) => updateRule(i, { EndTime: e.target.value })}
                    />
                  </label>

                  {canWrite && (
                    <button
                      type="button"
                      className="cs-remove"
                      onClick={() => removeRule(i)}
                      aria-label={`Remove the ${dayShort(rule.DayOfWeek)} window`}
                    >
                      Remove
                    </button>
                  )}

                  {/* An end earlier than the start is legitimate and means the
                      window runs past midnight. Say so, so it does not read as
                      a mistake the user should correct. */}
                  {rule.EndTime < rule.StartTime && rule.EndTime !== rule.StartTime && (
                    <p className="cs-note">
                      Runs past midnight into {dayShort((Number(rule.DayOfWeek) + 1) % 7)}.
                    </p>
                  )}
                  {rule.EndTime === rule.StartTime && (
                    <p className="cs-note cs-note-bad">
                      Start and end are the same — this window would never apply.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <div className="cs-actions">
              <button type="button" className="cs-btn" onClick={addRule}>
                Add a window
              </button>
              <button
                type="button"
                className="cs-btn cs-btn-primary"
                onClick={save}
                disabled={saving || zeroLength}
              >
                {saving ? 'Saving…' : 'Save schedule'}
              </button>
              {rules.length > 0 && (
                <button
                  type="button"
                  className="cs-btn cs-btn-quiet"
                  onClick={clearAll}
                  disabled={saving}
                >
                  Clear (always available)
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default CategorySchedules
