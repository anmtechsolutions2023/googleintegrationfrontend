import React, { useEffect, useState } from 'react';
import { getAuditLogs } from '../services/dataService';
import { toast } from 'react-toastify';
import { MESSAGES, STRINGS, ERROR_CODES } from '../constants';
import logger from '../utils/logger';

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('DESC'); // Newest first

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await getAuditLogs();
      setLogs(res.data.logs);
      setFilteredLogs(res.data.logs);
      setLoading(false);
    } catch (err) {
      logger.error('Failed to load audit logs', err);
      toast.error(MESSAGES.error[ERROR_CODES.GENERIC_ERROR]);
      setLoading(false);
    }
  };

  // Handle Filtering and Sorting logic
  useEffect(() => {
    let updatedLogs = [...logs];

    // Search Filter (Email or Action)
    if (searchTerm) {
      updatedLogs = updatedLogs.filter(
        (log) =>
          log.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.action.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status Filter
    if (statusFilter !== 'ALL') {
      updatedLogs = updatedLogs.filter((log) => log.status === statusFilter);
    }

    // Sorting (by Timestamp)
    updatedLogs.sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return sortOrder === 'ASC' ? dateA - dateB : dateB - dateA;
    });

    setFilteredLogs(updatedLogs);
  }, [searchTerm, statusFilter, sortOrder, logs]);

  if (loading)
    return <div style={{ padding: '20px' }}>{MESSAGES.info.loading}</div>;

  return (
    <div style={{ padding: '30px' }}>
      <h2 style={{ marginBottom: '20px' }}>{STRINGS.pages.auditLogs.title}</h2>

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          gap: '15px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder={STRINGS.placeholders.searchByEmailOrAction}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '10px',
            width: '300px',
            borderRadius: '5px',
            border: '1px solid #ccc',
          }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '10px',
            borderRadius: '5px',
            border: '1px solid #ccc',
          }}
        >
          <option value="ALL">{STRINGS.filters.allStatuses}</option>
          <option value="SUCCESS">{STRINGS.filters.success}</option>
          <option value="DENIED">{STRINGS.filters.denied}</option>
        </select>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          style={{
            padding: '10px',
            borderRadius: '5px',
            border: '1px solid #ccc',
          }}
        >
          <option value="DESC">{STRINGS.filters.newestFirst}</option>
          <option value="ASC">{STRINGS.filters.oldestFirst}</option>
        </select>

        <button
          onClick={fetchLogs}
          style={{
            padding: '10px 20px',
            cursor: 'pointer',
            background: '#f0f0f0',
            border: '1px solid #ccc',
            borderRadius: '5px',
          }}
        >
          {STRINGS.buttons.refresh}
        </button>
      </div>

      {/* Table */}
      <div
        style={{
          overflowX: 'auto',
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: '#f8f9fa',
                borderBottom: '2px solid #dee2e6',
              }}
            >
              <th style={tableHeaderStyle}>ID</th>
              <th style={tableHeaderStyle}>{STRINGS.tableHeaders.email}</th>
              <th style={tableHeaderStyle}>{STRINGS.tableHeaders.action}</th>
              <th style={tableHeaderStyle}>{STRINGS.tableHeaders.status}</th>
              <th style={tableHeaderStyle}>{STRINGS.tableHeaders.timestamp}</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.log_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tableCellStyle}>{log.log_id}</td>
                <td style={tableCellStyle}>{log.user_email}</td>
                <td style={tableCellStyle}>
                  <code>{log.action}</code>
                </td>
                <td style={tableCellStyle}>
                  <span style={statusBadgeStyle(log.status)}>{log.status}</span>
                </td>
                <td style={tableCellStyle}>
                  {new Date(log.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredLogs.length === 0 && (
          <p style={{ textAlign: 'center', padding: '20px' }}>
            {STRINGS.emptyStates.noResults}
          </p>
        )}
      </div>
    </div>
  );
};

// Styles
const tableHeaderStyle = { padding: '15px', fontWeight: 'bold' };
const tableCellStyle = { padding: '12px 15px', fontSize: '14px' };
const statusBadgeStyle = (status) => ({
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '12px',
  fontWeight: 'bold',
  backgroundColor: status === 'SUCCESS' ? '#d4edda' : '#f8d7da',
  color: status === 'SUCCESS' ? '#155724' : '#721c24',
});

export default AuditLogs;
