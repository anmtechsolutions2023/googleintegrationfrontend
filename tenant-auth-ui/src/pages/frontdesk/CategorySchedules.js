import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'react-toastify'
import { genericGet, genericPut, genericDelete } from '../../services/posService'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'
import LoadingSpinner from '../../components/LoadingSpinner'
import ExportButton from '../../components/export/ExportButton'
import './categorySchedules.css'

// The API answers with two envelopes: list endpoints put rows in `data`,
// single-record and custom-lookup endpoints put them in `message`. Mirrors
// posService's own toArray rather than guessing per call site.
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
//
// ── Two views, one screen ──────────────────────────────────────────────────
// The old screen was a category dropdown and nothing else: you could not see
// which categories had hours without selecting each one in turn, and the
// dropdown told you nothing on the way past. LIST answers "what is set?" at a
// glance; EDIT answers "change this one".

const DAYS = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
]

// DayOfWeek is 0 = Sunday to match JS getDay(), but a week READS Monday first.
// Display order is a presentation concern and stays out of the stored value.
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [6, 0]

const PRESETS = [
  { label: 'Breakfast', from: '07:00', to: '11:00' },
  { label: 'Lunch', from: '12:00', to: '15:00' },
  { label: 'Dinner', from: '18:00', to: '23:00' },
]

// The API stores HH:MM:SS; <input type="time"> speaks HH:MM.
const toInputTime = (t) => String(t || '').slice(0, 5)

const dayOf = (d) => DAYS.find((x) => x.value === Number(d))

/** '07:00' -> '7:00 am'. 24:00 is the server's end-of-day and reads as midnight. */
const fmtTime = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  if (Number.isNaN(h)) return hhmm || ''
  if (h >= 24) return 'midnight'
  const suffix = h < 12 ? 'am' : 'pm'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m || 0).padStart(2, '0')} ${suffix}`
}

/** '7:00 – 11:30 am', dropping the repeated suffix when both sides share it. */
const fmtWindow = (from, to) => {
  const a = fmtTime(from)
  const b = fmtTime(to)
  const suffix = a.slice(-2)
  return suffix === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`
}

/**
 * What a category's rules amount to, for the overview row.
 * Distinct windows rather than a count: three days sharing one window is the
 * common case and deserves to read as one line, not "3 windows".
 */
const summarise = (rules) => {
  const days = new Set(rules.map((r) => Number(r.DayOfWeek)))
  const windows = [...new Set(rules.map((r) => `${r.StartTime}|${r.EndTime}`))]
  return { days, windows }
}

const CategorySchedules = () => {
  const { user } = useAuth()
  const canWrite = hasScope(user, [SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN])

  const [categories, setCategories] = useState([])
  const [allRules, setAllRules] = useState([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [rules, setRules] = useState([])
  const [baseline, setBaseline] = useState('[]')
  const [loading, setLoading] = useState(true)
  const [loadingRules, setLoadingRules] = useState(false)
  const [saving, setSaving] = useState(false)

  // The composer: days first, then one time. Setting Mon–Fri lunch used to be
  // five near-identical rows because the day was picked once PER ROW.
  const [pickedDays, setPickedDays] = useState(WEEKDAYS)
  const [fromTime, setFromTime] = useState('09:00')
  const [toTime, setToTime] = useState('17:00')

  const selected = categories.find((c) => c.Id === selectedId)

  const loadOverview = useCallback(async () => {
    try {
      // Two requests, not one per category: the schedules endpoint already
      // returns every rule in the tenancy.
      const [cats, sched] = await Promise.all([
        // 100 is the server's ceiling — both the Joi schema and
        // paginationHelper clamp there, and asking for more is a 400.
        genericGet('/api/categories', { limit: 100 }),
        genericGet('/api/pos/category-schedules'),
      ])
      setCategories(rowsOf(cats))
      setAllRules(rowsOf(sched).map((r) => ({
        CategoryId: r.CategoryId,
        DayOfWeek: Number(r.DayOfWeek),
        StartTime: toInputTime(r.StartTime),
        EndTime: toInputTime(r.EndTime),
      })))
    } catch {
      toast.error('Could not load categories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOverview() }, [loadOverview])

  const byCategory = useMemo(() => {
    const map = new Map()
    allRules.forEach((r) => {
      if (!map.has(r.CategoryId)) map.set(r.CategoryId, [])
      map.get(r.CategoryId).push(r)
    })
    return map
  }, [allRules])

  const visibleCategories = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = q
      ? categories.filter((c) => String(c.Name || '').toLowerCase().includes(q))
      : categories
    // Scheduled first: they are the ones somebody came here to check.
    return [...rows].sort((a, b) => {
      const sa = (byCategory.get(a.Id) || []).length > 0 ? 0 : 1
      const sb = (byCategory.get(b.Id) || []).length > 0 ? 0 : 1
      return sa - sb || String(a.Name || '').localeCompare(String(b.Name || ''))
    })
  }, [categories, query, byCategory])

  const scheduledCount = useMemo(
    () => categories.filter((c) => (byCategory.get(c.Id) || []).length > 0).length,
    [categories, byCategory],
  )

  const loadRules = useCallback(async (categoryId) => {
    if (!categoryId) { setRules([]); setBaseline('[]'); return }
    setLoadingRules(true)
    try {
      const res = await genericGet(`/api/pos/category-schedules/${categoryId}`)
      const next = rowsOf(res).map((r) => ({
        DayOfWeek: Number(r.DayOfWeek),
        StartTime: toInputTime(r.StartTime),
        EndTime: toInputTime(r.EndTime),
      }))
      setRules(next)
      setBaseline(JSON.stringify(next))
    } catch {
      toast.error('Could not load this schedule')
      setRules([])
      setBaseline('[]')
    } finally {
      setLoadingRules(false)
    }
  }, [])

  const openCategory = (id) => { setSelectedId(id); loadRules(id) }
  const backToList = () => { setSelectedId(''); setRules([]); loadOverview() }

  const dirty = JSON.stringify(rules) !== baseline

  const toggleDay = (d) =>
    setPickedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  /** One window, onto every picked day, skipping days that already have it. */
  const addWindow = () => {
    if (pickedDays.length === 0) { toast.error('Pick at least one day'); return }
    if (fromTime === toTime) {
      toast.error('A window cannot start and end at the same time.')
      return
    }
    setRules((prev) => {
      const next = [...prev]
      pickedDays.forEach((d) => {
        const exists = next.some(
          (r) => r.DayOfWeek === d && r.StartTime === fromTime && r.EndTime === toTime,
        )
        if (!exists) next.push({ DayOfWeek: d, StartTime: fromTime, EndTime: toTime })
      })
      return next
    })
  }

  const addWindowToDay = (d) =>
    setRules((prev) => [...prev, { DayOfWeek: d, StartTime: fromTime, EndTime: toTime }])

  const removeRule = (rule) =>
    setRules((prev) => prev.filter((r) => r !== rule))

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
          ? 'Hours removed — this category is always available'
          : 'Hours saved',
      )
      await loadRules(selectedId)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save the hours')
    } finally {
      setSaving(false)
    }
  }

  const clearAll = async () => {
    setSaving(true)
    try {
      await genericDelete(`/api/pos/category-schedules/${selectedId}`)
      toast.success('Hours removed — this category is always available')
      await loadRules(selectedId)
    } catch {
      toast.error('Could not remove the hours')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  // ── Overview ──────────────────────────────────────────────────────────────
  if (!selectedId) {
    return (
      <div className="cs-page">
        <header className="cs-head">
          <h1>Category Availability</h1>
          <p>
            When each part of the menu can be ordered. A category with no hours
            is available <strong>all the time</strong>.
          </p>
        </header>

        <div className="cs-toolbar">
          <ExportButton exportKey="category-hours" />
          <input
            className="cs-search"
            type="search"
            placeholder="Find a category…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Find a category"
          />
          <span className="cs-count">
            {scheduledCount} of {categories.length} have set hours
          </span>
        </div>

        {visibleCategories.length === 0 ? (
          <p className="cs-empty">No categories match that.</p>
        ) : (
          <div className="cs-table">
            <div className="cs-table-head">
              <span>Category</span>
              <span>When it is on the menu</span>
              <span />
            </div>

            {visibleCategories.map((cat) => {
              const catRules = byCategory.get(cat.Id) || []
              const { days, windows } = summarise(catRules)
              const always = catRules.length === 0
              return (
                <div className="cs-row" key={cat.Id}>
                  <div className="cs-row-name">
                    <span className="cs-cat">{cat.Name}</span>
                  </div>

                  <div className="cs-row-when">
                    {always ? (
                      <span className="cs-pill cs-pill-always">Always available</span>
                    ) : (
                      <>
                        <div className="cs-week" aria-label="Days it is available">
                          {WEEK.map((d) => (
                            <span
                              key={d}
                              className={`cs-day${days.has(d) ? ' is-on' : ''}`}
                              title={dayOf(d).label}
                            >
                              {dayOf(d).short.charAt(0)}
                            </span>
                          ))}
                        </div>
                        <span className="cs-times">
                          {windows.length === 1
                            ? fmtWindow(...windows[0].split('|'))
                            : `${windows.length} different windows`}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="cs-row-action">
                    <button
                      type="button"
                      className="cs-btn cs-btn-quiet"
                      onClick={() => openCategory(cat.Id)}
                    >
                      {always ? (canWrite ? 'Set hours' : 'View') : (canWrite ? 'Edit hours' : 'View')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── One category ──────────────────────────────────────────────────────────
  const byDay = (d) => rules.filter((r) => r.DayOfWeek === d)

  return (
    <div className="cs-page">
      <div className="cs-editor-head">
        <button type="button" className="cs-btn cs-btn-quiet" onClick={backToList}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          All categories
        </button>
        <h1>{selected?.Name || 'Category'}</h1>
      </div>

      {loadingRules ? (
        <LoadingSpinner />
      ) : (
        <>
          {canWrite && (
            <section className="cs-card cs-composer" aria-label="Add a window">
              <div className="cs-composer-head">
                <span className="cs-card-title">Add a window</span>
                <div className="cs-presets">
                  <span className="cs-hint">Start from</span>
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="cs-chip"
                      onClick={() => { setFromTime(p.from); setToTime(p.to) }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cs-field">
                <span className="cs-label">On these days</span>
                <div className="cs-daypick-row">
                  <div className="cs-daypick">
                    {WEEK.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`cs-daybtn${pickedDays.includes(d) ? ' is-on' : ''}`}
                        aria-pressed={pickedDays.includes(d)}
                        onClick={() => toggleDay(d)}
                      >
                        {dayOf(d).short}
                      </button>
                    ))}
                  </div>
                  <div className="cs-dayquick">
                    <button type="button" className="cs-chip" onClick={() => setPickedDays(WEEKDAYS)}>Weekdays</button>
                    <button type="button" className="cs-chip" onClick={() => setPickedDays(WEEKEND)}>Weekend</button>
                    <button type="button" className="cs-chip" onClick={() => setPickedDays(WEEK)}>Every day</button>
                  </div>
                </div>
              </div>

              <div className="cs-times-row">
                <div className="cs-field">
                  <span className="cs-label">From</span>
                  <input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} aria-label="From" />
                </div>
                <div className="cs-field">
                  <span className="cs-label">To</span>
                  <input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} aria-label="To" />
                </div>
                <button
                  type="button"
                  className="cs-btn cs-btn-primary cs-add"
                  onClick={addWindow}
                  disabled={pickedDays.length === 0}
                >
                  Add to {pickedDays.length} {pickedDays.length === 1 ? 'day' : 'days'}
                </button>
              </div>
            </section>
          )}

          <section className="cs-card" aria-label="This week">
            <div className="cs-card-head">
              <span className="cs-card-title">This week</span>
              {dirty && <span className="cs-dirty">Unsaved changes</span>}
            </div>

            <div className="cs-days">
              {WEEK.map((d) => {
                const dayRules = byDay(d)
                return (
                  <div className={`cs-dayrow${dayRules.length === 0 ? ' is-off' : ''}`} key={d}>
                    <span className="cs-dayname">{dayOf(d).label}</span>
                    <div className="cs-windows">
                      {dayRules.length === 0 && (
                        <span className="cs-off">Off the menu all day</span>
                      )}
                      {dayRules.map((r, i) => (
                        <span className="cs-window" key={`${d}-${i}`}>
                          {fmtWindow(r.StartTime, r.EndTime)}
                          {canWrite && (
                            <button
                              type="button"
                              className="cs-window-x"
                              aria-label={`Remove ${fmtWindow(r.StartTime, r.EndTime)} on ${dayOf(d).label}`}
                              onClick={() => removeRule(r)}
                            >
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          )}
                        </span>
                      ))}
                      {canWrite && (
                        <button type="button" className="cs-addday" onClick={() => addWindowToDay(d)}>
                          + window
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {canWrite && (
            <div className="cs-actions">
              <button type="button" className="cs-btn cs-btn-primary" onClick={save} disabled={saving || !dirty}>
                {saving ? 'Saving…' : 'Save hours'}
              </button>
              <button type="button" className="cs-btn cs-btn-quiet" onClick={() => loadRules(selectedId)} disabled={saving || !dirty}>
                Discard changes
              </button>
              <span className="cs-spacer" />
              {rules.length > 0 && (
                <button type="button" className="cs-btn cs-btn-ghost" onClick={clearAll} disabled={saving}>
                  Remove all hours — show it always
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default CategorySchedules
