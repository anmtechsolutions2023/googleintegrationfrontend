import React, { useEffect, useState, useCallback } from 'react'
import { getAuditLogs, getAuditCategories } from '../services/dataService'
import { toast } from 'react-toastify'
import { MESSAGES, STRINGS, ERROR_CODES } from '../constants'
import logger from '../utils/logger'

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
    <div style={containerStyle}>
      <div style={headerRowStyle}>
        <h2 style={{ margin: 0 }}>{STRINGS.pages.auditLogs.title}</h2>
        <span style={totalBadgeStyle}>{total.toLocaleString()} total</span>
        {hasActiveFilter && (
          <span style={filterActiveBadgeStyle}>Filtered</span>
        )}
      </div>

      {/* Filter Bar */}
      <div style={filterBarStyle}>
        {/* Email dropdown */}
        <select
          value={emailFilter}
          onChange={handleEmailChange}
          style={selectStyle}
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
          style={selectStyle}
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
          style={selectStyle}
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
          style={selectStyle}
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
          style={{ ...inputStyle, width: '150px' }}
          title="From date"
        />
        <input
          type="date"
          value={endDate}
          onChange={handleFilterChange(setEndDate, 'endDate')}
          style={{ ...inputStyle, width: '150px' }}
          title="To date"
        />

        <button onClick={handleReset} style={resetBtnStyle}>
          Reset
        </button>

        <button
          onClick={handleRefresh}
          style={refreshBtnStyle}
          disabled={loading}
        >
          {loading ? '…' : STRINGS.buttons.refresh}
        </button>
      </div>

      {/* Action filter note */}
      {actionFilter && (
        <div style={actionNoteStyle}>
          Showing actions matching <strong>{actionFilter}</strong> from current
          page.
          <button onClick={() => setActionFilter('')} style={clearActionStyle}>
            ✕ Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              <th style={thStyle}>#</th>
              <th style={thStyle}>{STRINGS.tableHeaders.timestamp}</th>
              <th style={thStyle}>{STRINGS.tableHeaders.email}</th>
              <th style={thStyle}>{STRINGS.tableHeaders.action}</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Level</th>
              <th style={thStyle}>{STRINGS.tableHeaders.status}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={centeredCellStyle}>
                  {MESSAGES.info.loading}
                </td>
              </tr>
            ) : displayedLogs.length === 0 ? (
              <tr>
                <td colSpan={7} style={centeredCellStyle}>
                  {STRINGS.emptyStates.noLogs}
                </td>
              </tr>
            ) : (
              displayedLogs.map((log) => (
                <tr key={log.log_id} style={rowStyle}>
                  <td style={tdStyle}>{log.log_id}</td>
                  <td style={tdStyle}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td style={tdStyle}>{log.user_email}</td>
                  <td style={tdStyle}>{log.action}</td>
                  <td style={tdStyle}>
                    <span style={categoryBadgeStyle()}>{log.category}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={levelBadgeStyle(log.log_level)}>
                      {log.log_level}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={statusBadgeStyle(log.status)}>
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
      <div style={paginationBarStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#6c757d',
            fontSize: '14px',
          }}
        >
          {STRINGS.pagination.rowsPerPage}
          <select
            value={limit}
            onChange={handleLimitChange}
            style={{ ...selectStyle, padding: '4px 8px' }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <span style={{ fontSize: '14px', color: '#6c757d' }}>
          {total > 0
            ? STRINGS.pagination.showingOf(from, to, total)
            : 'No results'}
        </span>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={pageNavBtnStyle(page <= 1 || loading)}
          >
            {STRINGS.pagination.previous}
          </button>

          <span
            style={{
              fontSize: '14px',
              fontWeight: '500',
              minWidth: '100px',
              textAlign: 'center',
            }}
          >
            {STRINGS.pagination.pageOf(page, totalPages || 1)}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            style={pageNavBtnStyle(page >= totalPages || loading)}
          >
            {STRINGS.pagination.next}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle = { padding: '30px' }
const headerRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '20px',
  flexWrap: 'wrap',
}
const totalBadgeStyle = {
  background: '#e9ecef',
  borderRadius: '12px',
  padding: '2px 10px',
  fontSize: '13px',
  color: '#495057',
}
const filterActiveBadgeStyle = {
  background: '#dbeafe',
  borderRadius: '12px',
  padding: '2px 10px',
  fontSize: '12px',
  color: '#1e40af',
  fontWeight: '600',
}

const filterBarStyle = {
  display: 'flex',
  gap: '10px',
  marginBottom: '10px',
  flexWrap: 'wrap',
  alignItems: 'center',
}
const inputStyle = {
  padding: '8px 12px',
  borderRadius: '5px',
  border: '1px solid #ccc',
  fontSize: '14px',
}
const selectStyle = {
  padding: '8px 12px',
  borderRadius: '5px',
  border: '1px solid #ccc',
  fontSize: '14px',
  maxWidth: '220px',
}

const resetBtnStyle = {
  padding: '8px 16px',
  cursor: 'pointer',
  background: '#fff',
  border: '1px solid #ccc',
  borderRadius: '5px',
  fontSize: '14px',
}
const refreshBtnStyle = {
  padding: '8px 16px',
  cursor: 'pointer',
  background: '#0d6efd',
  color: '#fff',
  border: 'none',
  borderRadius: '5px',
  fontSize: '14px',
}

const actionNoteStyle = {
  marginBottom: '10px',
  fontSize: '13px',
  color: '#6c757d',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}
const clearActionStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#dc3545',
  fontSize: '13px',
  padding: '0 4px',
}

const tableWrapStyle = {
  overflowX: 'auto',
  background: '#fff',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
}
const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
}
const theadRowStyle = {
  backgroundColor: '#f8f9fa',
  borderBottom: '2px solid #dee2e6',
}
const thStyle = {
  padding: '12px 16px',
  fontWeight: '600',
  fontSize: '13px',
  whiteSpace: 'nowrap',
}
const tdStyle = {
  padding: '10px 16px',
  fontSize: '14px',
  borderBottom: '1px solid #f0f0f0',
}
const rowStyle = { transition: 'background 0.1s' }
const centeredCellStyle = {
  padding: '30px',
  textAlign: 'center',
  color: '#6c757d',
}

const paginationBarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '16px',
  flexWrap: 'wrap',
  gap: '12px',
}

const pageNavBtnStyle = (disabled) => ({
  padding: '6px 14px',
  borderRadius: '5px',
  fontSize: '14px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? '#f8f9fa' : '#fff',
  border: '1px solid #dee2e6',
  color: disabled ? '#adb5bd' : '#212529',
})

const statusBadgeStyle = (status) => ({
  padding: '3px 8px',
  borderRadius: '4px',
  fontSize: '12px',
  fontWeight: '600',
  backgroundColor:
    status === 'SUCCESS'
      ? '#d1fae5'
      : status === 'DENIED'
        ? '#fee2e2'
        : '#fef9c3',
  color:
    status === 'SUCCESS'
      ? '#065f46'
      : status === 'DENIED'
        ? '#991b1b'
        : '#854d0e',
})

const levelBadgeStyle = (level) => {
  const map = {
    ERROR: { bg: '#fee2e2', color: '#991b1b' },
    WARN: { bg: '#fef9c3', color: '#854d0e' },
    INFO: { bg: '#dbeafe', color: '#1e40af' },
    DEBUG: { bg: '#f3f4f6', color: '#6b7280' },
  }
  const s = map[level] || map.DEBUG
  return {
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: s.bg,
    color: s.color,
  }
}

const categoryBadgeStyle = () => ({
  padding: '3px 8px',
  borderRadius: '4px',
  fontSize: '12px',
  backgroundColor: '#ede9fe',
  color: '#5b21b6',
})

export default AuditLogs
