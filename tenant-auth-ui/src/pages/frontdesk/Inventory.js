import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { APP_CONFIG } from '../../constants'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

// Inventory tab — reads from existing master-data inventory endpoints.
// Uses INVENTORY_READ scope (already in the app's scope set).

const INVENTORY_ENDPOINTS = [
  { key: 'itemDetails',  label: 'Item Details',    path: '/api/itemdetails',   icon: '🍽️' },
  { key: 'batchDetails', label: 'Batch Details',   path: '/api/batchdetails',  icon: '📦' },
  { key: 'stockAdjust',  label: 'Stock Adjustments', path: '/api/stockadjustments', icon: '📋' },
]

const Inventory = () => {
  const [activeTab, setActiveTab] = useState(INVENTORY_ENDPOINTS[0].key)
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')

  const activeEndpoint = INVENTORY_ENDPOINTS.find((e) => e.key === activeTab)

  const load = useCallback(async () => {
    if (!activeEndpoint) return
    setLoading(true)
    setItems([])
    try {
      const items = await posService.getInventoryEndpoint(activeEndpoint.path, { limit: MAX_LIMIT, expand: true })
      setItems(items)
    } catch {
      toast.error(`Failed to load ${activeEndpoint.label}`)
    } finally {
      setLoading(false)
    }
  }, [activeEndpoint])

  useEffect(() => { load() }, [load])

  const columns = items.length > 0
    ? Object.keys(items[0]).filter((k) => !['id', 'Id', 'TenantId', 'tenantId'].includes(k)).slice(0, 6)
    : []

  const filtered = search
    ? items.filter((item) => Object.values(item).some((v) => String(v || '').toLowerCase().includes(search.toLowerCase())))
    : items

  return (
    <div className="fd-crud-page">
      <h1>📦 Inventory View</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {INVENTORY_ENDPOINTS.map((ep) => (
          <button
            key={ep.key}
            className={`fd-btn ${activeTab === ep.key ? 'fd-btn-primary' : 'fd-btn-outline'}`}
            onClick={() => { setActiveTab(ep.key); setSearch('') }}
          >
            {ep.icon} {ep.label}
          </button>
        ))}
        <button className="fd-btn fd-btn-outline" onClick={load} style={{ marginLeft: 'auto' }}>Refresh</button>
      </div>

      <input
        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d0d4da', borderRadius: 6, fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
        placeholder={`Search ${activeEndpoint?.label}...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="fd-loading">Loading inventory...</div>
      ) : filtered.length === 0 ? (
        <div className="fd-empty">No records found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="fd-table">
            <thead>
              <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={item.Id || item.id || i}>
                  {columns.map((c) => (
                    <td key={c}>
                      {item[c] != null && typeof item[c] === 'object'
                        ? JSON.stringify(item[c]).slice(0, 40)
                        : String(item[c] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Inventory
