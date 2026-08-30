import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { visibleGroups, matchesQuery, ALL_REPORTS, canSee } from '../config/reportsCatalogue'
import './reportsHome.css'

/**
 * Reports — one door to every report in the application.
 *
 * WHAT THIS REPLACED
 * /reports rendered /api/reports, an endpoint that returned the caller's own
 * email, tenant id and scope list under the label `resource: 'reports_data'`,
 * printed as raw JSON. It was scaffolding from the original template and never
 * had data behind it — so the one menu item named Reports was the only place in
 * the app with no reports in it, while two dozen real ones sat elsewhere.
 *
 * WHY IT LINKS RATHER THAN RENDERS
 * The reports already exist and work. Re-rendering them here would be a second
 * implementation of every figure, and the copy nobody is watching is the one
 * that drifts. So this is a catalogue: it links into the screens that own the
 * data, carrying the tab and range, and nothing is duplicated.
 */

const ReportsHome = () => {
  const { user } = useAuth()
  // Stable identity: a fresh [] each render would rebuild the catalogue on
  // every keystroke in the search box.
  const scopes = useMemo(() => user?.scopes || [], [user])

  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')

  // What this user may open at all. A cashier and an accountant see different
  // catalogues, and neither is shown a heading over an empty space.
  const groups = useMemo(() => visibleGroups(scopes), [scopes])

  const sections = useMemo(() => groups
    .filter((g) => group === 'all' || g.key === group)
    .map((g) => ({ ...g, reports: g.reports.filter((r) => matchesQuery(r, query)) }))
    .filter((g) => g.reports.length > 0),
  [groups, group, query])

  // Counts are computed under the search but NOT under the group filter: a chip
  // has to keep showing its own size, or selecting it makes every other chip
  // read zero.
  const chips = useMemo(() => [
    { key: 'all', name: 'All', count: groups.reduce((n, g) => n + g.reports.filter((r) => matchesQuery(r, query)).length, 0) },
    ...groups.map((g) => ({ key: g.key, name: g.name, count: g.reports.filter((r) => matchesQuery(r, query)).length })),
  ], [groups, query])

  const total = ALL_REPORTS.filter((r) => canSee(r, scopes)).length

  if (groups.length === 0) {
    return (
      <div className="rp-page">
        <h1>Reports</h1>
        <div className="rp-empty">
          No reports are available to your role. Reports follow the data they read,
          so this changes as soon as someone grants you access to it.
        </div>
      </div>
    )
  }

  return (
    <div className="rp-page">
      <div className="rp-head">
        <div>
          <h1>Reports</h1>
          <p className="rp-lead">
            Every report in one place, grouped by the question it answers.
            {' '}
            {total} available to you.
          </p>
        </div>
      </div>

      <input
        className="rp-search"
        type="search"
        placeholder="Search reports — try &quot;refund&quot;, &quot;cash&quot;, &quot;table&quot;…"
        aria-label="Search reports"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="rp-chips" role="group" aria-label="Filter by group">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`rp-chip${group === c.key ? ' is-on' : ''}${c.count === 0 ? ' is-empty' : ''}`}
            aria-pressed={group === c.key}
            onClick={() => setGroup(c.key)}
          >
            {c.name}
            <span className="rp-chip-count">{c.count}</span>
          </button>
        ))}
      </div>

      {sections.length === 0 ? (
        <div className="rp-empty">
          Nothing matches “{query}”.
          <div className="rp-empty-action">
            <button type="button" className="rp-link" onClick={() => { setQuery(''); setGroup('all') }}>
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="rp-sections">
          {sections.map((g) => (
            <section key={g.key}>
              <div className="rp-section-head">
                <h2>{g.name}</h2>
                <span className="rp-blurb">{g.blurb}</span>
              </div>
              <div className="rp-grid">
                {g.reports.map((r) => (
                  r.missing ? (
                    // Listed, not hidden. A catalogue that quietly omits what is
                    // missing cannot be used to decide what to build next.
                    <div key={r.key} className="rp-card is-missing">
                      <div className="rp-card-top">
                        <span className="rp-card-name">{r.name}</span>
                        <span className="rp-tag rp-tag-soon">Not built</span>
                      </div>
                      <p className="rp-card-answers">{r.answers}</p>
                      <p className="rp-card-note">{r.missing}</p>
                    </div>
                  ) : (
                    <Link key={r.key} to={r.to} className="rp-card">
                      <div className="rp-card-top">
                        <span className="rp-card-name">{r.name}</span>
                      </div>
                      <p className="rp-card-answers">{r.answers}</p>
                    </Link>
                  )
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default ReportsHome
