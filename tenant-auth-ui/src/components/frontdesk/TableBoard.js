import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { squashName, UNASSIGNED_FLOOR } from '../../utils/tableSessions'
import './frontdesk.css'

/**
 * The tables, under the dish search: the first thing a dine-in order needs.
 *
 * Two states, one component:
 *
 *   OPEN   — every table, one line per floor, with how many are free, occupied,
 *            waiting on a bill or reserved (the counts are filters) and a
 *            seated meter. This is step 1, and what "All tables" opens.
 *   FOLDED — one row, once a table is being served: that table, then bills
 *            out and the longest-running, then the free ones. The menu gets
 *            the room back. The counts stay in view.
 *
 * Presentational apart from its own filters and finder; the table being
 * served and whether it is open belong to Billing.
 *
 * @param {Object} props
 * @param {Array<Object>} props.info - From tableInfo(): one row per table.
 * @param {Array<Object>} props.floors
 * @param {string} [props.selectedTableId]
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onToggle
 * @param {(tableId: string) => void} props.onPick
 * @param {string} [props.suggestId] - The table offered to a walk-in party.
 * @param {number} [props.suggestGuests]
 * @param {Object} [props.findRef] - So F4 can focus the finder.
 */

const FLOOR_KEY = 'fd.tableBoard.floor'
const readFloor = () => {
  try { return window.localStorage.getItem(FLOOR_KEY) || 'all' } catch { return 'all' }
}
const saveFloor = (f) => {
  try { window.localStorage.setItem(FLOOR_KEY, f) } catch { /* a per-device nicety only */ }
}

const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

const COUNTS = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Free' },
  { key: 'occ', label: 'Occupied' },
  { key: 'bill', label: 'Bill printed', short: 'Bill' },
  { key: 'res', label: 'Reserved' },
]

const TableBoard = ({
  info = [], floors = [], selectedTableId = '', open, onToggle, onPick,
  suggestId = null, suggestGuests = null, findRef = null,
}) => {
  const [filter, setFilter] = useState('all')
  const [floor, setFloor] = useState(readFloor)
  const [find, setFind] = useState('')
  const rowRef = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const selected = info.find((x) => x.id === selectedTableId) || null

  const counts = useMemo(() => {
    const c = { all: info.length, free: 0, occ: 0, bill: 0, res: 0 }
    info.forEach((x) => { c[x.key] += 1 })
    return c
  }, [info])
  const seated = counts.occ + counts.bill

  // Floors in the tenant's order; tables with no floor still get a line.
  const floorGroups = useMemo(() => {
    const known = floors.map((f) => ({ id: f.Id || f.id, name: f.Name || f.name }))
    const knownIds = new Set(known.map((f) => f.id))
    const loose = info.filter((x) => !knownIds.has(x.floorId))
    const groups = known
      .map((f) => ({ ...f, tables: info.filter((x) => x.floorId === f.id) }))
      .filter((f) => f.tables.length > 0)
    if (loose.length > 0) {
      groups.push({ id: UNASSIGNED_FLOOR, name: groups.length ? 'Other tables' : 'Tables', tables: loose })
    }
    return groups
  }, [floors, info])

  // A remembered floor that no longer exists falls back to every floor.
  const activeFloor = floor === 'all' || floorGroups.some((f) => f.id === floor) ? floor : 'all'
  const pickFloor = (f) => { setFloor(f); saveFloor(f) }

  const matches = (x) => !find.trim() || squashName(x.name).includes(squashName(find))
  const onFloor = (x) => activeFloor === 'all' || x.floorId === activeFloor

  // The folded row: being served, bills out, longest-running, then free, then
  // reserved. Most-needed first, so the next table to visit is at the front.
  const rowTables = useMemo(() => {
    const pool = info.filter((x) => (find.trim() ? matches(x) : onFloor(x)))
    if (find.trim()) return pool
    const sel = pool.filter((x) => x.id === selectedTableId)
    const rest = pool.filter((x) => x.id !== selectedTableId)
    return [
      ...sel,
      ...rest.filter((x) => x.key === 'bill'),
      ...rest.filter((x) => x.key === 'occ').sort((a, b) => (b.mins || 0) - (a.mins || 0)),
      ...rest.filter((x) => x.key === 'free'),
      ...rest.filter((x) => x.key === 'res'),
    ]
  }, [info, find, activeFloor, selectedTableId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Whether the folded row runs off either edge, for the arrows.
  const measure = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
  }, [])
  useLayoutEffect(() => { measure() }, [rowTables, open, measure])
  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])
  const scrollBy = (dir) => {
    const el = rowRef.current
    if (!el) return
    try { el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' }) } catch { el.scrollLeft += dir * 300 }
  }

  // ← → move between tables, as on a till keyboard.
  const onTilesKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const tiles = [...e.currentTarget.querySelectorAll('.fd-ttile')]
    const i = tiles.indexOf(document.activeElement)
    if (i === -1) return
    e.preventDefault()
    tiles[i + (e.key === 'ArrowRight' ? 1 : -1)]?.focus()
  }

  // Esc folds the board again once a table is being served.
  useEffect(() => {
    if (!open || !selectedTableId) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onToggle(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, selectedTableId, onToggle])

  const choose = (x) => {
    setFind('')
    onPick(x.id)
  }

  const tile = (x, { faded = false } = {}) => {
    const sel = x.id === selectedTableId
    const suggested = !selectedTableId && x.id === suggestId
    let corner = ''
    let line = ''
    if (x.key === 'occ') { corner = x.age; line = rupees(x.total) }
    else if (x.key === 'bill') { corner = 'bill'; line = rupees(x.total) }
    else if (x.key === 'res') line = 'Reserved'
    else { corner = x.seats > 0 ? `${x.seats} seats` : ''; line = sel ? 'New order' : 'Free' }
    const said = [
      x.name,
      { free: 'free', occ: 'occupied', bill: 'bill printed', res: 'reserved' }[x.key],
      x.key === 'occ' || x.key === 'bill' ? rupees(x.total) : null,
      x.key === 'occ' && x.mins !== null ? `${x.mins} minutes${x.late ? ', running long' : ''}` : null,
      x.key === 'free' && x.seats > 0 ? `${x.seats} seats` : null,
      x.qr ? 'QR order waiting' : null,
      suggested ? `suggested for ${suggestGuests} ${suggestGuests === 1 ? 'guest' : 'guests'}` : null,
      sel ? 'being served' : null,
    ].filter(Boolean).join(', ')
    return (
      <button
        type="button"
        key={x.id}
        className={`fd-ttile is-${x.key}${x.late ? ' is-late' : ''}${sel ? ' is-sel' : ''}${suggested ? ' is-suggest' : ''}${faded ? ' is-faded' : ''}`}
        aria-pressed={sel}
        aria-label={said}
        onClick={() => choose(x)}
      >
        {x.qr && <span className="fd-ttile-qr" aria-hidden="true">QR</span>}
        <span className="fd-ttile-r1">
          <span className="fd-ttile-nm">{x.name}</span>
          {corner && <span className="fd-ttile-cn">{corner}</span>}
        </span>
        <span className="fd-ttile-ln">{line}</span>
      </button>
    )
  }

  const finder = (
    <input
      ref={findRef}
      id="fd-tboard-find"
      type="search"
      className="fd-tboard-find"
      placeholder="Find table"
      aria-label="Find table"
      title="Find table (F4)"
      value={find}
      onChange={(e) => setFind(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { setFind(''); return }
        if (e.key !== 'Enter') return
        const hits = info.filter(matches)
        if (hits.length === 1) choose(hits[0])
      }}
    />
  )

  const floorTabs = (allLabel) => floorGroups.length > 1 && (
    <div className="fd-tboard-floors" role="group" aria-label="Floors">
      <button
        type="button"
        className={activeFloor === 'all' ? 'is-on' : ''}
        aria-pressed={activeFloor === 'all'}
        onClick={() => pickFloor('all')}
      >
        {allLabel}
      </button>
      {floorGroups.map((f) => (
        <button
          type="button"
          key={f.id}
          className={activeFloor === f.id ? 'is-on' : ''}
          aria-pressed={activeFloor === f.id}
          aria-label={`${f.name} floor, ${f.tables.length} tables`}
          onClick={() => pickFloor(f.id)}
        >
          {f.name} <small>{f.tables.length}</small>
        </button>
      ))}
    </div>
  )

  const steps = (
    <div className="fd-tboard-steps">
      {selected ? (
        <span className="fd-tboard-step is-done"><b aria-hidden="true">✓</b>{`Serving ${selected.name}`}</span>
      ) : (
        <span className="fd-tboard-step"><b aria-hidden="true">1</b>Pick a table to start</span>
      )}
      <span className="fd-tboard-arrow" aria-hidden="true">→</span>
      <span className={`fd-tboard-step${selected ? '' : ' is-dim'}`}><b aria-hidden="true">2</b>Add dishes</span>
    </div>
  )

  // ── FOLDED ──────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <section className="fd-tboard is-folded" aria-label="Tables">
        <div className="fd-tboard-line">
          {/* Phone: the board, one tap away. */}
          <button
            type="button"
            className="fd-tboard-phone-open"
            onClick={() => onToggle(true)}
            aria-label={`All tables, ${counts.free} free`}
          >
            Tables
            <small>{counts.free} free</small>
          </button>
          {steps}
          <div className="fd-tboard-mini" role="group" aria-label="Table counts">
            {COUNTS.filter((c) => c.key !== 'all' && c.key !== 'res').map((c) => (
              <button
                type="button"
                key={c.key}
                className={`fd-tboard-count is-${c.key}`}
                onClick={() => { setFilter(c.key); onToggle(true) }}
                aria-label={`${c.label}: ${counts[c.key]}. Show them`}
              >
                <i aria-hidden="true" />{c.short || c.label} <b>{counts[c.key]}</b>
              </button>
            ))}
          </div>
          <span className="fd-tboard-gap" />
          {floorTabs('All')}
          {finder}
          <button type="button" className="fd-tboard-toggle" onClick={() => onToggle(true)} aria-expanded={false}>
            All tables ⌄
          </button>
        </div>
        <div className="fd-tboard-lane">
          {edges.left && (
            <button type="button" className="fd-tboard-arrow is-left" onClick={() => scrollBy(-1)} aria-label="Earlier tables">‹</button>
          )}
          <div
            className="fd-tboard-row"
            ref={rowRef}
            onScroll={measure}
            onKeyDown={onTilesKey}
            role="group"
            aria-label="Table row"
          >
            {rowTables.map((x, i) => (
              <React.Fragment key={x.id}>
                {/* Where the tables needing someone end and the free ones begin. */}
                {!find.trim() && x.key === 'free' && rowTables[i - 1] && rowTables[i - 1].key !== 'free'
                  && rowTables[i - 1].id !== x.id && <span className="fd-tboard-divider" aria-hidden="true">Free</span>}
                {tile(x)}
              </React.Fragment>
            ))}
            {rowTables.length === 0 && <span className="fd-tboard-empty">No table matches “{find.trim()}”.</span>}
          </div>
          {edges.right && (
            <button type="button" className="fd-tboard-arrow is-right" onClick={() => scrollBy(1)} aria-label="More tables">›</button>
          )}
        </div>
      </section>
    )
  }

  // ── OPEN ────────────────────────────────────────────────────────────────
  const shownGroups = floorGroups
    .filter((f) => activeFloor === 'all' || f.id === activeFloor)
    .map((f) => ({ ...f, shown: f.tables.filter(matches) }))
    .filter((f) => f.shown.length > 0)

  return (
    <section className={`fd-tboard is-open${selected ? '' : ' is-picking'}`} aria-label="Tables">
      <div className="fd-tboard-line">
        {steps}
        <div className="fd-tboard-meter" title="Tables seated now">
          <div className="fd-tboard-meter-bar" aria-hidden="true">
            {['occ', 'bill', 'res', 'free'].map((k) => (
              <i key={k} className={`is-${k}`} style={{ width: `${counts.all ? (counts[k] / counts.all) * 100 : 0}%` }} />
            ))}
          </div>
          <span className="fd-tboard-meter-text">
            <b>{seated}</b> of {counts.all} seated
            {counts.all > 0 && <> · <b>{Math.round((seated / counts.all) * 100)}%</b></>}
          </span>
        </div>
        {finder}
        {selected && (
          <button type="button" className="fd-tboard-toggle" onClick={() => onToggle(false)} aria-expanded>
            Hide ⌃
          </button>
        )}
      </div>

      <div className="fd-tboard-line is-wrap">
        <div className="fd-tboard-counts" role="group" aria-label="Show tables">
          {COUNTS.map((c) => (
            <button
              type="button"
              key={c.key}
              className={`fd-tboard-count is-${c.key}${filter === c.key ? ' is-on' : ''}`}
              aria-pressed={filter === c.key}
              onClick={() => setFilter(c.key)}
            >
              {c.key !== 'all' && <i aria-hidden="true" />}
              {c.label} <b>{counts[c.key]}</b>
            </button>
          ))}
        </div>
        <span className="fd-tboard-gap" />
        {floorTabs('All floors')}
      </div>

      <div className="fd-tboard-body" onKeyDown={onTilesKey}>
        {shownGroups.map((f) => {
          const free = f.tables.filter((x) => x.key === 'free').length
          return (
            <div className="fd-tboard-floor" key={f.id} role="group" aria-label={`${f.name} tables`}>
              <div className="fd-tboard-floor-label">
                <b>{f.name}</b>
                <span><em>{free}</em> free of {f.tables.length}</span>
              </div>
              <div className="fd-tboard-tiles">
                {f.shown.map((x) => tile(x, { faded: filter !== 'all' && x.key !== filter }))}
              </div>
            </div>
          )
        })}
        {shownGroups.length === 0 && <p className="fd-tboard-empty">No table matches “{find.trim()}”.</p>}
      </div>
    </section>
  )
}

export default TableBoard
