import React, { useMemo } from 'react';
import { STRINGS } from '../../constants';
import './MasterData.css';

/**
 * DataTable Component
 * A generic, reusable table component for displaying module data
 *
 * @param {Object} props
 * @param {Array} props.columns - Column definitions with key, label, render
 * @param {Array} props.data - Array of data objects to display
 * @param {boolean} props.loading - Loading state
 * @param {Function} props.onEdit - Edit handler (row) => void
 * @param {Function} [props.onView] - Optional view handler (row) => void. When
 *   omitted the button is not rendered at all, so every existing caller is
 *   unaffected — this extends the table rather than changing it.
 * @param {Function} props.onDelete - Delete handler (row) => void
 * @param {Object} props.pagination - { page, pageSize, total }
 * @param {Function} props.onPageChange - Page change handler
 * @param {Object} props.sortConfig - { key, direction } for current sort
 * @param {Function} props.onSort - Sort handler (columnKey) => void
 * @param {string} props.emptyMessage - Message when no data
 */
const DataTable = ({
  columns = [],
  data = [],
  loading = false,
  onEdit,
  onView,
  onDelete,
  pagination = null,
  onPageChange,
  sortConfig = { key: null, direction: 'asc' },
  onSort,
  emptyMessage = 'No data available',
}) => {
  // Calculate pagination info
  const paginationInfo = useMemo(() => {
    if (!pagination) return null;

    const { page, pageSize, total } = pagination;
    const totalPages = Math.ceil(total / pageSize);
    const startItem = (page - 1) * pageSize + 1;
    const endItem = Math.min(page * pageSize, total);

    return {
      totalPages,
      startItem,
      endItem,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    };
  }, [pagination]);

  // Generate page numbers for pagination
  const pageNumbers = useMemo(() => {
    if (!paginationInfo || !pagination) return [];

    const { totalPages } = paginationInfo;
    const currentPage = pagination.page;
    const pages = [];

    // Show max 5 page numbers
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);

    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }, [paginationInfo, pagination]);

  // Render loading state
  if (loading) {
    return (
      <div className="data-table-container">
        <div className="loading-state">
          <div className="loading-spinner" />
          <span>{STRINGS.status.loading}</span>
        </div>
      </div>
    );
  }

  // Render empty state
  if (!data || data.length === 0) {
    return (
      <div className="data-table-container">
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3>No Records Found</h3>
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  // Render cell value
  const renderCell = (column, row) => {
    if (column.render) {
      return column.render(row[column.key], row);
    }

    const value = row[column.key];

    // Handle boolean values
    if (typeof value === 'boolean') {
      return (
        <span className={`status-badge ${value ? 'active' : 'inactive'}`}>
          {value ? 'Active' : 'Inactive'}
        </span>
      );
    }

    // Handle null/undefined
    if (value === null || value === undefined) {
      return <span style={{ color: '#bdc3c7' }}>—</span>;
    }

    // Handle JSON columns (objects/arrays) — React can't render raw objects.
    if (typeof value === 'object') {
      return (
        <span
          title={JSON.stringify(value, null, 2)}
          style={{ fontFamily: 'monospace', fontSize: '0.85em' }}
        >
          {JSON.stringify(value)}
        </span>
      );
    }

    return value;
  };

  // Get sort indicator for column header
  const getSortIndicator = (columnKey) => {
    if (sortConfig.key !== columnKey) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="data-table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  ...(column.width ? { width: column.width } : {}),
                  cursor: onSort ? 'pointer' : 'default',
                }}
                onClick={() => onSort && onSort(column.key)}
                className={sortConfig.key === column.key ? 'sorted' : ''}
              >
                <span className="th-content">
                  {column.label || column.key || column.name}
                  {onSort && (
                    <span className="sort-indicator">
                      {getSortIndicator(column.key)}
                    </span>
                  )}
                </span>
              </th>
            ))}
            {/* Width is set in CSS, not inline: an inline width outranks the
                responsive rule that releases this column below 768px, which is
                what kept 120–160px frozen on a phone. */}
            {(onEdit || onView || onDelete) && (
              <th className={onView ? 'col-actions col-actions-3' : 'col-actions'}>
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={row.id || row.Id || index}>
              {columns.map((column) => (
                <td key={column.key}>{renderCell(column, row)}</td>
              ))}
              {(onEdit || onView || onDelete) && (
                <td>
                  <div className="table-actions">
                    {/* Read before write: viewing is the commoner intent and
                        the only one available to someone without write access. */}
                    {onView && (
                      <button
                        className="btn btn-secondary btn-icon btn-sm"
                        onClick={() => onView(row)}
                        title="View details"
                        aria-label="View details"
                      >
                        👁️
                      </button>
                    )}
                    {onEdit && (
                      <button
                        className="btn btn-secondary btn-icon btn-sm"
                        onClick={() => onEdit(row)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                    )}
                    {onDelete && (
                      <button
                        className="btn btn-danger btn-icon btn-sm"
                        onClick={() => onDelete(row)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {pagination && paginationInfo && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {paginationInfo.startItem} to {paginationInfo.endItem} of{' '}
            {pagination.total} entries
          </div>
          <div className="pagination-controls">
            {paginationInfo.totalPages > 1 && (
              <>
                <button
                  className="pagination-btn"
                  disabled={!paginationInfo.hasPrev}
                  onClick={() => onPageChange(pagination.page - 1)}
                >
                  ◀ Prev
                </button>
                {pageNumbers.map((num) => (
                  <button
                    key={num}
                    className={`pagination-btn ${
                      pagination.page === num ? 'active' : ''
                    }`}
                    onClick={() => onPageChange(num)}
                  >
                    {num}
                  </button>
                ))}
                <button
                  className="pagination-btn"
                  disabled={!paginationInfo.hasNext}
                  onClick={() => onPageChange(pagination.page + 1)}
                >
                  Next ▶
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
