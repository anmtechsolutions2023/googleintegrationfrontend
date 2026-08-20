import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { OrderNoLink } from '../../components/frontdesk/OrderLinkProvider'
import { normalizeStatus, statusLabel } from '../../utils/posStatus'

const FrontDeskDashboard = () => {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    posService.getDashboardStats()
      .then(setStats)
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="fd-loading">Loading dashboard...</div>
  if (!stats)  return <div className="fd-empty">No data available.</div>

  const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

  // Statuses are stored lowercase; the badge renders them Title Case. Matching
  // on the raw value is what broke the Pending KOTs count, so every read here
  // normalizes first.
  const statusBadge = (status) => {
    const s = normalizeStatus(status)
    const cls = s === 'open' || s === 'fired' ? 'active' : s === 'closed' ? 'closed' : 'pending'
    return <span className={`fd-badge fd-badge-${cls}`}>{statusLabel(status)}</span>
  }

  return (
    <div className="fd-dashboard">
      <h1>📊 Front Desk Dashboard</h1>

      <div className="fd-kpi-grid">
        <div className="fd-kpi-card accent-green">
          <span className="kpi-label">Today's Revenue</span>
          <span className="kpi-value">{fmt(stats.todayRevenue)}</span>
        </div>
        <div className="fd-kpi-card accent-blue">
          <span className="kpi-label">Today's Orders</span>
          <span className="kpi-value">{stats.todayOrders}</span>
        </div>
        <div className="fd-kpi-card accent-orange">
          <span className="kpi-label">Occupied / Total Tables</span>
          <span className="kpi-value">{stats.occupiedTables} / {stats.totalTables}</span>
        </div>
        <div className="fd-kpi-card accent-red">
          <span className="kpi-label">Pending KOTs</span>
          <span className="kpi-value">{stats.pendingKots}</span>
        </div>
      </div>

      <div className="fd-section-title">Recent Orders</div>
      {stats.recentOrders.length === 0 ? (
        <div className="fd-empty">No recent orders.</div>
      ) : (
        <table className="fd-table">
          <thead>
            <tr>
              <th>Order No</th>
              <th>Token / Table</th>
              <th>Type</th>
              <th>Status</th>
              <th>Total</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentOrders.map((o) => (
              <tr key={o.id || o.Id}>
                <td><OrderNoLink orderId={o.Id || o.id}>{o.OrderNo || '—'}</OrderNoLink></td>
                {/* The identifier the CUSTOMER is holding. The table was joined
                    server-side already; the token was not, so every counter
                    order showed a dash in the one column that could say which
                    order it was. */}
                <td>
                  {o.TokenLabel ? (
                    <span className="fd-source-chip is-token">🎫 {o.TokenLabel}</span>
                  ) : o.TableName ? (
                    <span className="fd-source-chip is-table">🪑 {o.TableName}</span>
                  ) : <span className="muted">—</span>}
                </td>
                <td>{statusLabel(o.OrderType)}</td>
                <td>{statusBadge(o.Status)}</td>
                <td>{o.Total != null ? fmt(o.Total) : '—'}</td>
                <td>{o.CreatedOn ? new Date(o.CreatedOn).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default FrontDeskDashboard
