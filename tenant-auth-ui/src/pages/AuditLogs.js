import React, { useEffect, useState, useCallback } from 'react'
import { getAuditLogs, getAuditCategories } from '../services/dataService'
import { toast } from 'react-toastify'
import { MESSAGES, STRINGS, ERROR_CODES } from '../constants'
import logger from '../utils/logger'
import './auditLogs.css'

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR']
const PAGE_SIZE_OPTIONS = [25, 50, 100]

const AuditLogs = () => {
  const [logs, setLogs] = useState([])
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0,
  })
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])

  // Dropdown options populated from initial fetch
  const [emailOptions, setEmailOptions] = useState([])
  const [actionOptions, setActionOptions] = useState([])

  // Filters
  const [emailFilter, setEmailFilter] = useState('') // server-side
  const [actionFilter, setActionFilter] = useState('') // client-side only (no backend param)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [logLevelFilter, setLogLevelFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)

  const fetchLogs = useCallback(
    async (overrides = {}) => {
      setLoading(true)
      try {
        const params = {
          page: overrides.page ?? page,
          limit: overrides.limit ?? limit,
          userEmail:
            (overrides.email !== undefined ? overrides.email : emailFilter) ||
            undefined,
          category:
            (overrides.category !== undefined
              ? overrides.category
              : categoryFilter) || undefined,
          logLevel:
            (overrides.logLevel !== undefined
              ? overrides.logLevel
              : logLevelFilter) || undefined,
          startDate:
            (overrides.startDate !== undefined
              ? overrides.startDate
              : startDate) || undefined,
          endDate:
            (overrides.endDate !== undefined ? overrides.endDate : endDate) ||
            undefined,
        }
        // Strip undefined and empty strings — backend rejects empty enum params
        Object.keys(params).forEach(
          (k) =>
            (params[k] === undefined || params[k] === '') && delete params[k],
        )

        const res = await getAuditLogs(params)
        const newLogs = res.data.logs || []
        setLogs(newLogs)
        setPagination(
          res.data.pagination || {
            total: 0,
            page: 1,
            limit: 50,
            totalPages: 0,
          },
        )
      } catch (err) {
        logger.error('Failed to load audit logs', err)
        toast.error(MESSAGES.error[ERROR_CODES.GENERIC_ERROR])
      } finally {
        setLoading(false)
      }
    },
    [
      page,
      limit,
      emailFilter,
      categoryFilter,
      logLevelFilter,
      startDate,
      endDate,
    ],
  )

  // Load categories for dropdown
  useEffect(() => {
    getAuditCategories()
      .then((res) => setCategories(res.data.categories || []))
      .catch(() => {})
  }, [])

  // Initial options fetch: load a large batch once to populate Email and Action dropdowns
  useEffect(() => {
    getAuditLogs({ page: 1, limit: 500 })
      .then((res) => {
        const all = res.data.logs || []
        setEmailOptions(
          [...new Set(all.map((l) => l.user_email).filter(Boolean))].sort(),
        )
        setActionOptions(
          [...new Set(all.map((l) => l.action).filter(Boolean))].sort(),
        )
      })
      .catch(() => {})
  }, [])

  // Fetch whenever page or limit changes
  useEffect(() => {
    fetchLogs()
  }, [page, limit]) // eslint-disable-line

  // Email dropdown: server-side filter
  const handleEmailChange = (e) => {
    const val = e.target.value
    setEmailFilter(val)
    setActionFilter('')
    setPage(1)
    fetchLogs({ email: val, page: 1 })
  }

  // Action dropdown: client-side only — no API call needed
  const handleActionChange = (e) => setActionFilter(e.target.value)

  // Generic server-side filter change
  const handleFilterChange = (setter, key) => (e) => {
    const val = e.target.value
    setter(val)
    setPage(1)
    fetchLogs({ [key]: val, page: 1 })
  }

  const handleLimitChange = (e) => {
    const val = Number(e.target.value)
    setLimit(val)
    setPage(1)
    fetchLogs({ limit: val, page: 1 })
  }

  const handleReset = () => {
    setEmailFilter('')
    setActionFilter('')
    setCategoryFilter('')
    setLogLevelFilter('')
    setStartDate('')
    setEndDate('')
    setPage(1)
    setLimit(50)
    fetchLogs({
      email: '',
      category: '',
      logLevel: '',
      startDate: '',
      endDate: '',
      page: 1,
      limit: 50,
    })
  }

  const handleRefresh = () => fetchLogs()

  // Apply client-side action filter on top of server-fetched logs
  const displayedLogs = actionFilter
    ? logs.filter((l) => l.action === actionFilter)
    : logs

  const { total, totalPages } = pagination
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  const hasActiveFilter =
    emailFilter ||
    actionFilter ||
    categoryFilter ||
    logLevelFilter ||
    startDate ||
    endDate

  return (
    <div className="al-page">
      <div className="al-head">
        <h1>{STRINGS.pages.auditLogs.title}</h1>
        <span className="al-badge">{total.toLocaleString()} total</span>
        {hasActiveFilter && (
          <span className="al-badge al-badge-filtered">Filtered</span>
        )}
      </div>

      {/* Filter Bar */}
      <div className="al-filters">
        {/* Email dropdown */}
        <select
          value={emailFilter}
          onChange={handleEmailChange}
          className="al-select"
          title="Filter by user email"
        >
          <option value="">All Emails</option>
          {emailOptions.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        {/* Action dropdown (client-side) */}
        <select
          value={actionFilter}
          onChange={handleActionChange}
          className="al-select"
          title="Filter by action (current page)"
        >
          <option value="">All Actions</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        {/* Category dropdown */}
        <select
          value={categoryFilter}
          onChange={handleFilterChange(setCategoryFilter, 'category')}
          className="al-select"
        >
          <option value="">{STRINGS.filters.allCategories}</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        {/* Log level dropdown */}
        <select
          value={logLevelFilter}
          onChange={handleFilterChange(setLogLevelFilter, 'logLevel')}
          className="al-select"
        >
          <option value="">{STRINGS.filters.allLevels}</option>
          {LOG_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        {/* Date range */}
        <input
          type="date"
          value={startDate}
          onChange={handleFilterChange(setStartDate, 'startDate')}
          className="al-input"
          title="From date"
        />
        <input
          type="date"
          value={endDate}
          onChange={handleFilterChange(setEndDate, 'endDate')}
          className="al-input"
          title="To date"
        />

        <button onClick={handleReset} className="al-btn">
          Reset
        </button>

        <button
          onClick={handleRefresh}
          className="al-btn al-btn-primary"
          disabled={loading}
        >
          {loading ? '…' : STRINGS.buttons.refresh}
        </button>
      </div>

      {/* Action filter note */}
      {actionFilter && (
        <div className="al-note">
          Showing actions matching <strong>{actionFilter}</strong> from current
          page.
          <button onClick={() => setActionFilter('')} className="al-note-clear">
            ✕ Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="al-table-wrap">
        <table className="al-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{STRINGS.tableHeaders.timestamp}</th>
              <th>{STRINGS.tableHeaders.email}</th>
              <th>{STRINGS.tableHeaders.action}</th>
              <th>Category</th>
              <th>Level</th>
              <th>{STRINGS.tableHeaders.status}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="al-cell-center">
                  {MESSAGES.info.loading}
                </td>
              </tr>
            ) : displayedLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="al-cell-center">
                  {STRINGS.emptyStates.noLogs}
                </td>
              </tr>
            ) : (
              displayedLogs.map((log) => (
                <tr key={log.log_id} >
                  <td>{log.log_id}</td>
                  <td>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td>{log.user_email}</td>
                  <td>{log.action}</td>
                  <td>
                    <span className="al-pill al-pill-category">{log.category}</span>
                  </td>
                  <td>
                    <span className={`al-pill ${levelPill(log.log_level)}`}>
                      {log.log_level}
                    </span>
                  </td>
                  <td>
                    <span className={`al-pill ${statusPill(log.status)}`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="al-pagination">
        <div className="al-rows-per-page">
          {STRINGS.pagination.rowsPerPage}
          <select
            value={limit}
            onChange={handleLimitChange}
            className="al-select"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <span className="al-count">
          {total > 0
            ? STRINGS.pagination.showingOf(from, to, total)
            : 'No results'}
        </span>

        <div className="al-pager">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="al-pager-btn"
          >
            {STRINGS.pagination.previous}
          </button>

          <span className="al-pager-label">
            {STRINGS.pagination.pageOf(page, totalPages || 1)}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="al-pager-btn"
          >
            {STRINGS.pagination.next}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── State → badge class ──────────────────────────────────────────────────────
// The only two styles that ever depended on data. Everything else is in
// auditLogs.css, where it can carry a media query.

const statusPill = (status) =>
  status === 'SUCCESS'
    ? 'al-pill-success'
    : status === 'DENIED'
      ? 'al-pill-denied'
      : 'al-pill-other'

const LEVEL_PILL = {
  ERROR: 'al-pill-error',
  WARN: 'al-pill-warn',
  INFO: 'al-pill-info',
  DEBUG: 'al-pill-debug',
}

const levelPill = (level) => LEVEL_PILL[level] || LEVEL_PILL.DEBUG

export default AuditLogs
