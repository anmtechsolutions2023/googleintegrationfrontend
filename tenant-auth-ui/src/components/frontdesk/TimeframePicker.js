import React from 'react'

/**
 * The one timeframe control every financial report shares.
 *
 * Mirrors the server's `utils/dateRange` resolver exactly: the same preset
 * names, the same buckets. That is deliberate — daily, last-3-days,
 * weekend-only and custom are one query with different bounds on the server, so
 * they are one control here rather than seven screens that drift apart.
 *
 * The component owns no state. It hands the parent the same `{ preset, bucket,
 * fromDate, toDate, branchId, floorId, tableId }` object the API takes, so what
 * you see is literally what gets sent.
 */

// Values must match VALID_PRESETS on the server; anything else is rejected by Joi.
export const PRESETS = [
  { value: 'today',     label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last3',     label: 'Last 3 days' },
  { value: 'last5',     label: 'Last 5 days' },
  { value: 'week',      label: 'This week' },
  { value: 'weekend',   label: 'Weekends only' },
  { value: 'month',     label: 'This month' },
  { value: 'custom',    label: 'Custom range' },
]

export const BUCKETS = [
  { value: 'day',   label: 'Daily' },
  { value: 'week',  label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

const TimeframePicker = ({
  value,
  onChange,
  onRefresh,
  showBucket = true,
  branches = [],
  floors = [],
  tables = [],
  loading = false,
}) => {
  const range = value || {}
  const set = (patch) => onChange({ ...range, ...patch })

  const isCustom = range.preset === 'custom'

  // Tables belonging to the chosen floor. Offering every table regardless would
  // let someone pick a combination that cannot exist and read the empty result
  // as "no sales" rather than "no such place".
  const visibleTables = range.floorId
    ? tables.filter((t) => (t.FloorId || t.floorId) === range.floorId)
    : tables

  return (
    <div className="fd-timeframe" role="group" aria-label="Reporting timeframe">
      <div className="fd-timeframe-presets">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`fd-chip ${range.preset === p.value ? 'is-active' : ''}`}
            aria-pressed={range.preset === p.value}
            onClick={() => set({ preset: p.value })}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="fd-timeframe-controls">
        {/* Custom needs explicit bounds. The server refuses a custom range
            without them rather than silently collapsing it to today. */}
        {isCustom && (
          <>
            <label className="fd-field-inline">
              <span>From</span>
              <input
                type="date"
                value={range.fromDate || ''}
                max={range.toDate || undefined}
                onChange={(e) => set({ fromDate: e.target.value })}
              />
            </label>
            <label className="fd-field-inline">
              <span>To</span>
              <input
                type="date"
                value={range.toDate || ''}
                min={range.fromDate || undefined}
                onChange={(e) => set({ toDate: e.target.value })}
              />
            </label>
          </>
        )}

        {showBucket && (
          <label className="fd-field-inline">
            <span>Group by</span>
            <select
              value={range.bucket || 'day'}
              onChange={(e) => set({ bucket: e.target.value })}
              aria-label="Group by"
            >
              {BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </label>
        )}

        {/* Venue bounds — the mix-and-match half of the contract. Selecting a
            floor narrows the table list to it, and clearing the floor clears the
            table too: a table filter left behind from another floor would return
            nothing and look like missing data. */}
        {floors.length > 0 && (
          <label className="fd-field-inline">
            <span>Floor</span>
            <select
              value={range.floorId || ''}
              onChange={(e) => set({ floorId: e.target.value || undefined, tableId: undefined })}
              aria-label="Floor"
            >
              <option value="">All floors</option>
              {floors.map((f) => (
                <option key={f.Id || f.id} value={f.Id || f.id}>{f.Name || f.name}</option>
              ))}
            </select>
          </label>
        )}

        {visibleTables.length > 0 && (
          <label className="fd-field-inline">
            <span>Table</span>
            <select
              value={range.tableId || ''}
              onChange={(e) => set({ tableId: e.target.value || undefined })}
              aria-label="Table"
            >
              <option value="">All tables</option>
              {visibleTables.map((t) => (
                <option key={t.Id || t.id} value={t.Id || t.id}>{t.Name || t.name}</option>
              ))}
            </select>
          </label>
        )}

        {branches.length > 0 && (
          <label className="fd-field-inline">
            <span>Branch</span>
            <select
              value={range.branchId || ''}
              onChange={(e) => set({ branchId: e.target.value || undefined })}
              aria-label="Branch"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.Id || b.id} value={b.Id || b.id}>
                  {b.BranchName || b.Name}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          className="fd-btn fd-btn-outline"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? 'Loading…' : '🔄 Refresh'}
        </button>
      </div>
    </div>
  )
}

export default TimeframePicker
