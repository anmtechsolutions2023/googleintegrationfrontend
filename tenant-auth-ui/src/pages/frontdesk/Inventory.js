import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { APP_CONFIG } from '../../constants'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

// Inventory tab — reads from existing master-data inventory endpoints.
// Uses INVENTORY_READ scope (already in the app's scope set).

// Stock Adjustments was listed here but /api/stockadjustments has no module,
// route or table behind it — the feature was never built, so the tab only ever
// produced a 404. Removed rather than stubbed: a screen that silently shows "no
// records" for something that does not exist is how a gap goes unnoticed.
const INVENTORY_ENDPOINTS = [
  { key: 'itemDetails',  label: 'Item Details',  path: '/api/itemdetails',  icon: '🍽️' },
  { key: 'batchDetails', label: 'Batch Details', path: '/api/batchdetails', icon: '📦' },
]

// TASK 5: which columns to show, and what to call them.
//
// The backend ALREADY resolves these — ?expand=true returns CategoryName,
// UOMName and CostAmount alongside the ids (ITEM_DETAIL.SELECT_ALL_WITH_DETAILS).
// The bug was purely here: columns were `Object.keys(row).slice(0, 6)`, which
// takes the first six RAW keys — the foreign keys — while the resolved names
// sat past the cut and were never rendered.
//
// Declaring the columns per endpoint also stops the table's shape depending on
// whatever order MySQL happens to return fields in.
const COLUMNS = {
  itemDetails: [
    { key: 'Name',         label: 'Item' },
    { key: 'CategoryName', label: 'Category', fallback: 'CategoryId' },
    { key: 'UOMName',      label: 'Unit',     fallback: 'UOMId' },
    { key: 'CostAmount',   label: 'Price',    money: true },
    { key: 'CostTaxGroupName', label: 'Tax Group' },
    { key: 'Description',  label: 'Description' },
  ],
  batchDetails: [
    { key: 'BatchNo',      label: 'Batch' },
    { key: 'ItemName',     label: 'Item',     fallback: 'ItemDetailId' },
    { key: 'Quantity',     label: 'Qty' },
    { key: 'ExpiryDate',   label: 'Expiry',   date: true },
    { key: 'CreatedOn',    label: 'Received', date: true },
  ],
}

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`
const dateOnly = (v) => (v ? new Date(v).toLocaleDateString() : '—')

/**
 * One cell. Prefers the resolved NAME and falls back to the raw id only when the
 * join found nothing — a missing category is worth seeing, but it should look
 * like the exception it is rather than the norm.
 */
const renderCell = (row, col) => {
  const value = row[col.key]
  if (value == null || value === '') {
    const raw = col.fallback ? row[col.fallback] : null
    return raw
      ? <span className="fd-unresolved" title={`Unresolved ${col.label}: ${raw}`}>Unresolved</span>
      : <span className="muted">—</span>
  }
  if (col.money) return money(value)
  if (col.date) return dateOnly(value)
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 40)
  return String(value)
}

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

  // Declared per endpoint, with a generic fallback for anything not yet mapped
  // so a new endpoint still renders something rather than nothing.
  const columns = COLUMNS[activeTab]
    || (items.length > 0
      ? Object.keys(items[0])
        .filter((k) => !['id', 'Id', 'TenantId', 'tenantId'].includes(k))
        .slice(0, 6)
        .map((k) => ({ key: k, label: k }))
      : [])

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
              <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={item.Id || item.id || i}>
                  {columns.map((c) => (
                    <td key={c.key}>{renderCell(item, c)}</td>
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
