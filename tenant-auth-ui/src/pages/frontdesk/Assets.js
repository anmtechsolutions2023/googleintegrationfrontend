import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES, APP_CONFIG } from '../../constants'
import posService from '../../services/posService'
import './finance.css'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

/**
 * The fixed-asset register: what equipment each branch has, and what it is worth.
 *
 * Branch is required, not optional — an asset that belongs to no outlet answers
 * none of the questions the register exists for, which is why the server makes
 * the column NOT NULL and the form marks it mandatory.
 *
 * Depreciation is deliberately out of scope; the register reports purchase cost.
 */

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0)

const STATUSES = [
  { value: 'in_use',       label: 'In use' },
  { value: 'under_repair', label: 'Under repair' },
  { value: 'retired',      label: 'Retired' },
]

const statusLabel = (v) => STATUSES.find((s) => s.value === v)?.label || v || '—'

const emptyForm = {
  Name: '',
  AssetCategoryId: '',
  BranchDetailId: '',
  SerialNo: '',
  PurchaseDate: '',
  PurchaseCost: '',
  Status: 'in_use',
  Notes: '',
}

const Assets = () => {
  const { user } = useAuth()
  const canWrite = hasScope(user, [SCOPES.ASSET_WRITE, SCOPES.TENANT_ADMIN])

  const [assets, setAssets]         = useState([])
  const [summary, setSummary]       = useState(null)
  const [categories, setCategories] = useState([])
  const [branches, setBranches]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, sum] = await Promise.all([
        posService.getAssets({ limit: MAX_LIMIT }),
        posService.getAssetSummary().catch(() => null),
      ])
      setAssets(list)
      setSummary(sum)
    } catch {
      toast.error('Failed to load the asset register')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    posService.getAssetCategories().then(setCategories).catch(() => setCategories([]))
    // The POS-scoped branch list. /api/branchdetails is gated on
    // ORGANIZATION_READ, which a POS user does not hold — it 403'd and every
    // branch picker on these screens rendered empty, with the .catch below
    // turning the failure into a silent "no branches".
    posService.getPosBranches()
      .then(setBranches)
      .catch(() => setBranches([]))
  }, [])

  const visible = useMemo(() => assets.filter((a) => (
    (!branchFilter || a.BranchDetailId === branchFilter) &&
    (!statusFilter || a.Status === statusFilter)
  )), [assets, branchFilter, statusFilter])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormOpen(true) }

  const openEdit = (a) => {
    setEditing(a)
    setForm({
      Name: a.Name || '',
      AssetCategoryId: a.AssetCategoryId || '',
      BranchDetailId: a.BranchDetailId || '',
      SerialNo: a.SerialNo || '',
      PurchaseDate: a.PurchaseDate ? String(a.PurchaseDate).slice(0, 10) : '',
      PurchaseCost: a.PurchaseCost ?? '',
      Status: a.Status || 'in_use',
      Notes: a.Notes || '',
    })
    setFormOpen(true)
  }

  const save = async (ev) => {
    ev.preventDefault()
    if (!form.Name || !form.AssetCategoryId || !form.BranchDetailId) {
      toast.warn('Name, category and branch are required')
      return
    }
    const payload = {
      Name: form.Name,
      AssetCategoryId: form.AssetCategoryId,
      BranchDetailId: form.BranchDetailId,
      // Empty string would collide under the unique serial key for every
      // asset without one; null does not.
      SerialNo: form.SerialNo || null,
      PurchaseDate: form.PurchaseDate || null,
      PurchaseCost: Number(form.PurchaseCost) || 0,
      Status: form.Status,
      Notes: form.Notes || null,
    }
    setSaving(true)
    try {
      if (editing) {
        await posService.updateAsset(editing.Id, payload)
        toast.success('Asset updated')
      } else {
        await posService.createAsset(payload)
        toast.success('Asset registered')
      }
      setFormOpen(false)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save asset')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (a) => {
    if (!window.confirm(`Remove "${a.Name}" from the register?`)) return
    try {
      await posService.deleteAsset(a.Id)
      toast.success('Asset removed')
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to remove asset')
    }
  }

  return (
    <div className="fd-assets">
      <div className="fd-reports-header">
        <div>
          <h1>🏗️ Asset Register</h1>
          <p className="fd-lead">
            Equipment, furniture and fittings, by branch. Purchase cost only —
            depreciation is not tracked.
          </p>
        </div>
        {canWrite && (
          <button className="fd-btn fd-btn-primary" onClick={openCreate}>+ Register asset</button>
        )}
      </div>

      {summary && (
        <div className="fd-kpi-grid fd-kpi-compact">
          <div className="fd-kpi-card accent-blue">
            <span className="kpi-label">Assets</span>
            <span className="kpi-value">{summary.totalAssets ?? 0}</span>
          </div>
          <div className="fd-kpi-card accent-green">
            <span className="kpi-label">Register value</span>
            <span className="kpi-value">{money(summary.totalValue)}</span>
            <span className="kpi-hint">At purchase cost</span>
          </div>
        </div>
      )}

      <div className="fd-ledger-filters">
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
                aria-label="Branch filter">
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Status filter">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className="fd-btn fd-btn-outline" onClick={load}>🔄 Refresh</button>
      </div>

      {loading ? (
        <div className="fd-loading">Loading register…</div>
      ) : visible.length === 0 ? (
        <div className="fd-empty">No assets registered.</div>
      ) : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr>
                <th>Asset</th><th>Category</th><th>Branch</th><th>Serial</th>
                <th>Purchased</th><th className="num">Cost</th><th>Status</th>
                {canWrite && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.Id}>
                  <td className="strong">{a.Name}</td>
                  <td>{a.CategoryName || '—'}</td>
                  <td>{a.BranchName || '—'}</td>
                  <td>{a.SerialNo || <span className="muted">—</span>}</td>
                  <td>{a.PurchaseDate ? String(a.PurchaseDate).slice(0, 10) : <span className="muted">—</span>}</td>
                  <td className="num strong">{money(a.PurchaseCost)}</td>
                  <td>
                    <span className={`fd-asset-status ${a.Status}`}>{statusLabel(a.Status)}</span>
                  </td>
                  {canWrite && (
                    <td className="fd-row-actions">
                      <button className="fd-btn fd-btn-sm fd-btn-outline" onClick={() => openEdit(a)}>Edit</button>
                      <button className="fd-btn fd-btn-sm fd-btn-danger" onClick={() => remove(a)}>Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary?.groups?.length > 0 && (
        <>
          <div className="fd-section-title">Value by branch and category</div>
          <div className="fd-table-scroll">
            <table className="fd-table">
              <thead>
                <tr><th>Branch</th><th>Category</th><th className="num">Assets</th><th className="num">Value</th></tr>
              </thead>
              <tbody>
                {summary.groups.map((g, i) => (
                  <tr key={i}>
                    <td className="strong">{g.BranchName || '—'}</td>
                    <td>{g.CategoryName || '—'}</td>
                    <td className="num">{g.Assets}</td>
                    <td className="num strong">{money(g.PurchaseCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {formOpen && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Asset">
          <form className="fd-form-modal" onSubmit={save}>
            <h3>{editing ? 'Edit asset' : 'Register an asset'}</h3>

            <label htmlFor="as-name">Name *</label>
            <input id="as-name" type="text" maxLength={150} required value={form.Name}
                   onChange={(e) => setForm({ ...form, Name: e.target.value })}
                   placeholder="e.g. Deep Fryer" />

            <label htmlFor="as-cat">Category *</label>
            <select id="as-cat" required value={form.AssetCategoryId}
                    onChange={(e) => setForm({ ...form, AssetCategoryId: e.target.value })}>
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.Id || c.id} value={c.Id || c.id}>{c.Name}</option>
              ))}
            </select>

            <label htmlFor="as-branch">Branch *</label>
            <select id="as-branch" required value={form.BranchDetailId}
                    onChange={(e) => setForm({ ...form, BranchDetailId: e.target.value })}>
              <option value="">Select…</option>
              {branches.map((b) => (
                <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName}</option>
              ))}
            </select>
            <span className="fd-field-hint">An asset always belongs to an outlet.</span>

            <label htmlFor="as-serial">Serial number</label>
            <input id="as-serial" type="text" maxLength={100} value={form.SerialNo}
                   onChange={(e) => setForm({ ...form, SerialNo: e.target.value })} />

            <label htmlFor="as-date">Purchase date</label>
            <input id="as-date" type="date" value={form.PurchaseDate}
                   onChange={(e) => setForm({ ...form, PurchaseDate: e.target.value })} />

            <label htmlFor="as-cost">Purchase cost</label>
            <input id="as-cost" type="number" min="0" step="0.01" value={form.PurchaseCost}
                   onChange={(e) => setForm({ ...form, PurchaseCost: e.target.value })} />

            <label htmlFor="as-status">Status</label>
            <select id="as-status" value={form.Status}
                    onChange={(e) => setForm({ ...form, Status: e.target.value })}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>

            <label htmlFor="as-notes">Notes</label>
            <input id="as-notes" type="text" maxLength={500} value={form.Notes}
                   onChange={(e) => setForm({ ...form, Notes: e.target.value })} />

            <div className="fd-variant-actions">
              <button type="submit" className="fd-btn fd-btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Register asset'}
              </button>
              <button type="button" className="fd-btn fd-btn-outline"
                      onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default Assets
