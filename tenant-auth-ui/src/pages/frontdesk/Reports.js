import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)

const statusBadge = (status) => {
  const s = (status || '').toLowerCase()
  const cls = s === 'closed' || s === 'settled' ? 'active' : s === 'fired' ? 'pending' : 'pending'
  return <span className={`fd-badge fd-badge-${cls}`}>{status || '—'}</span>
}

const Reports = () => {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays]     = useState(7)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await posService.getReports({ days })
      setData(result.data || result)
    } catch {
      toast.error('Failed to load POS reports')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="fd-loading">Loading reports...</div>
  if (!data)   return <div className="fd-empty">No report data available.</div>

  const today   = data.today   || {}
  const tables  = data.tables  || {}
  const customers = data.customers || {}
  const feedback  = data.feedback  || {}
  const trends    = data.trends    || {}
  const recentOrders = data.recentOrders || []

  return (
    <div className="fd-dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>📈 POS Reports</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: '#7f8c8d' }}>Last</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: '6px 10px', border: '1px solid #d0d4da', borderRadius: 6, fontSize: 14 }}
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
          <button className="fd-btn fd-btn-outline" onClick={load}>Refresh</button>
        </div>
      </div>

      {/* Today KPIs */}
      <div className="fd-kpi-grid" style={{ marginBottom: 32 }}>
        <div className="fd-kpi-card accent-green">
          <span className="kpi-label">Today's Revenue</span>
          <span className="kpi-value">{fmt(today.revenue)}</span>
        </div>
        <div className="fd-kpi-card accent-blue">
          <span className="kpi-label">Today's Orders</span>
          <span className="kpi-value">{today.orders ?? 0}</span>
        </div>
        <div className="fd-kpi-card accent-red">
          <span className="kpi-label">Pending KOTs</span>
          <span className="kpi-value">{today.pendingKots ?? 0}</span>
        </div>
        <div className="fd-kpi-card accent-orange">
          <span className="kpi-label">Tables Occupied / Total</span>
          <span className="kpi-value">{tables.occupied ?? 0} / {tables.total ?? 0}</span>
        </div>
        <div className="fd-kpi-card">
          <span className="kpi-label">Total Customers</span>
          <span className="kpi-value">{customers.total ?? 0}</span>
        </div>
        <div className="fd-kpi-card">
          <span className="kpi-label">Avg Feedback Rating</span>
          <span className="kpi-value">{feedback.avgRating != null ? `${feedback.avgRating} ⭐` : '—'}</span>
        </div>
      </div>

      {/* Revenue trend table */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        <div>
          <div className="fd-section-title">Revenue Trend (last {days} days)</div>
          {!trends.revenue || trends.revenue.length === 0 ? (
            <div className="fd-empty" style={{ padding: '20px 0' }}>No revenue data yet.</div>
          ) : (
            <table className="fd-table">
              <thead>
                <tr><th>Date</th><th>Bills</th><th>Revenue</th></tr>
              </thead>
              <tbody>
                {trends.revenue.map((r, i) => (
                  <tr key={i}>
                    <td>{r.day ? new Date(r.day).toLocaleDateString() : '—'}</td>
                    <td>{r.bills}</td>
                    <td>{fmt(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="fd-section-title">Order Trend (last {days} days)</div>
          {!trends.orders || trends.orders.length === 0 ? (
            <div className="fd-empty" style={{ padding: '20px 0' }}>No order data yet.</div>
          ) : (
            <table className="fd-table">
              <thead>
                <tr><th>Date</th><th>Orders</th></tr>
              </thead>
              <tbody>
                {trends.orders.map((r, i) => (
                  <tr key={i}>
                    <td>{r.day ? new Date(r.day).toLocaleDateString() : '—'}</td>
                    <td>{r.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent orders */}
      <div className="fd-section-title">Recent Orders</div>
      {recentOrders.length === 0 ? (
        <div className="fd-empty">No recent orders.</div>
      ) : (
        <table className="fd-table">
          <thead>
            <tr><th>Order No</th><th>Type</th><th>Status</th><th>Total</th><th>Created</th></tr>
          </thead>
          <tbody>
            {recentOrders.map((o) => (
              <tr key={o.Id || o.id}>
                <td>{o.OrderNo || '—'}</td>
                <td>{o.OrderType || '—'}</td>
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

export default Reports
