import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { OrderNoLink } from '../../components/frontdesk/OrderLinkProvider'
import { normalizeStatus, statusLabel } from '../../utils/posStatus'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'
import { FRONT_DESK_NAV, visibleNavGroups } from '../../config/navigation'

const FrontDeskDashboard = () => {
  const { user } = useAuth()
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)

  // The takings figures come from /api/pos/reports, which needs
  // POS_REPORTS:READ. A cashier, waiter or kitchen user has no reason to hold
  // it — and this is the landing page of the whole section, so asking anyway
  // greeted most of the staff with a red error the moment they signed in.
  const canSeeStats = hasScope(user, [SCOPES.POS_REPORTS_READ, SCOPES.TENANT_ADMIN])

  useEffect(() => {
    if (!canSeeStats) { setLoading(false); return }
    posService.getDashboardStats()
      .then(setStats)
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [canSeeStats])

  if (loading) return <div className="fd-loading">Loading dashboard...</div>

  // Without the figures, the useful thing to show is the way to the work. The
  // sidebar has already been filtered to what this user may open, so the same
  // list makes an honest starting point rather than an apology.
  if (!canSeeStats) {
    const shortcuts = visibleNavGroups(FRONT_DESK_NAV, user)
      .flatMap((g) => g.items)
      .filter((i) => i.path !== '/frontdesk')

    return (
      <div className="fd-dashboard">
        <h1>📊 Front Desk</h1>
        <p className="fd-page-sub">
          Takings and order figures need reports access, which your role does not
          include. Everything you can work on is here.
        </p>
        {shortcuts.length === 0 ? (
          <div className="fd-empty">
            No front-desk screens are available to your role yet. Ask an
            administrator in this tenancy to review your permissions.
          </div>
        ) : (
          <div className="fd-shortcut-grid">
            {shortcuts.map((item) => (
              <Link key={item.key} to={item.path} className="fd-shortcut-card">
                <span className="fd-shortcut-icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

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
        <div className="fd-table-scroll">
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
        </div>
      )}
    </div>
  )
}

export default FrontDeskDashboard
