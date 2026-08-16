import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'
import posService from '../../services/posService'
import crudService from '../../services/crudService'
import './finance.css'

/**
 * Expenses — money out, with an approval gate before it becomes a cost.
 *
 *     draft --approve--> approved --settle--> settled
 *          \--reject---> cancelled
 *
 * Only settling posts to the ledger, and the UI says so out loud: a draft is a
 * claim, an approved expense is a commitment, and neither appears in cash flow
 * until the money actually leaves.
 *
 * Two server rules are respected here rather than re-implemented:
 *  - Status is never sent as a field. Each move is its own endpoint, because the
 *    server rejects a Status on the CRUD path so the gate cannot be skipped.
 *  - Approving needs EXPENSE:APPROVE, deliberately not POS_OPS:WRITE — whoever
 *    raises a claim should not be able to approve their own spending.
 */

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
    .format(Number(n) || 0)

const STATUS_META = {
  draft:     { label: 'Draft',     cls: 'draft' },
  approved:  { label: 'Approved',  cls: 'approved' },
  settled:   { label: 'Settled',   cls: 'settled' },
  cancelled: { label: 'Cancelled', cls: 'cancelled' },
}

const StatusBadge = ({ status }) => {
  const meta = STATUS_META[String(status || '').toLowerCase()] || { label: status || '—', cls: 'draft' }
  return <span className={`fd-exp-status ${meta.cls}`}>{meta.label}</span>
}

const emptyForm = {
  ExpenseCategoryId: '',
  Description: '',
  Amount: '',
  ExpenseDate: '',
  PaymentModeId: '',
  BranchDetailId: '',
}

const FILTERS = [
  { value: '',          label: 'All' },
  { value: 'draft',     label: 'Draft' },
  { value: 'approved',  label: 'Awaiting payment' },
  { value: 'settled',   label: 'Settled' },
  { value: 'cancelled', label: 'Cancelled' },
]

const Expenses = () => {
  const { user } = useAuth()
  const canWrite   = hasScope(user, [SCOPES.POS_OPS_WRITE, SCOPES.TENANT_ADMIN])
  const canApprove = hasScope(user, [SCOPES.EXPENSE_APPROVE, SCOPES.TENANT_ADMIN])

  const [expenses, setExpenses]     = useState([])
  const [categories, setCategories] = useState([])
  const [modes, setModes]           = useState([])
  const [branches, setBranches]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('')
  const [busyId, setBusyId]         = useState(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)

  const [settleTarget, setSettleTarget] = useState(null)
  const [settleMode, setSettleMode]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setExpenses(await posService.getExpenses({ limit: 200 }))
    } catch {
      toast.error('Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    // Reference data. Each is optional context — a failure must not block the
    // list, so they settle independently.
    posService.getExpenseCategories().then(setCategories).catch(() => setCategories([]))
    posService.getPaymentModes().then(setModes).catch(() => setModes([]))
    crudService.getAll('branchDetails', { limit: 200 })
      .then((r) => setBranches(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setBranches([]))
  }, [])

  const visible = useMemo(
    () => (filter ? expenses.filter((e) => String(e.Status).toLowerCase() === filter) : expenses),
    [expenses, filter],
  )

  const totals = useMemo(() => expenses.reduce((t, e) => {
    const amt = Number(e.Amount) || 0
    const s = String(e.Status).toLowerCase()
    return {
      draft:    t.draft    + (s === 'draft' ? amt : 0),
      approved: t.approved + (s === 'approved' ? amt : 0),
      settled:  t.settled  + (s === 'settled' ? amt : 0),
    }
  }, { draft: 0, approved: 0, settled: 0 }), [expenses])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormOpen(true) }

  const openEdit = (e) => {
    setEditing(e)
    setForm({
      ExpenseCategoryId: e.ExpenseCategoryId || '',
      Description: e.Description || '',
      Amount: e.Amount ?? '',
      ExpenseDate: e.ExpenseDate ? String(e.ExpenseDate).slice(0, 10) : '',
      PaymentModeId: e.PaymentModeId || '',
      BranchDetailId: e.BranchDetailId || '',
    })
    setFormOpen(true)
  }

  const save = async (ev) => {
    ev.preventDefault()
    if (!form.ExpenseCategoryId) { toast.warn('Pick a category'); return }
    if (!(Number(form.Amount) > 0)) { toast.warn('Amount must be greater than zero'); return }

    // Only fields the write schema accepts. Status is deliberately absent.
    const payload = {
      ExpenseCategoryId: form.ExpenseCategoryId,
      Amount: Number(form.Amount),
      Description: form.Description || null,
      ExpenseDate: form.ExpenseDate || null,
      PaymentModeId: form.PaymentModeId || null,
      BranchDetailId: form.BranchDetailId || null,
    }

    setSaving(true)
    try {
      if (editing) {
        await posService.updateExpense(editing.Id, payload)
        toast.success('Expense updated')
      } else {
        await posService.createExpense(payload)
        toast.success('Expense raised as a draft')
      }
      setFormOpen(false)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  const act = async (id, fn, successMsg) => {
    setBusyId(id)
    try {
      await fn()
      toast.success(successMsg)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  const doSettle = async () => {
    if (!settleTarget) return
    if (!settleTarget.PaymentModeId && !settleMode) {
      toast.warn('Choose how it was paid')
      return
    }
    await act(
      settleTarget.Id,
      () => posService.settleExpense(settleTarget.Id, settleMode || undefined),
      'Expense settled and posted to the ledger',
    )
    setSettleTarget(null)
    setSettleMode('')
  }

  const remove = async (e) => {
    if (!window.confirm(`Delete this ${money(e.Amount)} expense?`)) return
    await act(e.Id, () => posService.deleteExpense(e.Id), 'Expense deleted')
  }

  const categoryName = (e) =>
    e.CategoryName || categories.find((c) => (c.Id || c.id) === e.ExpenseCategoryId)?.Name || '—'

  return (
    <div className="fd-expenses">
      <div className="fd-reports-header">
        <div>
          <h1>💸 Expenses</h1>
          <p className="fd-lead">
            Raised as a draft, approved, then settled. Only settling posts to the
            ledger — a claim is not a cost until the money leaves.
          </p>
        </div>
        {canWrite && (
          <button className="fd-btn fd-btn-primary" onClick={openCreate}>+ New expense</button>
        )}
      </div>

      <div className="fd-kpi-grid fd-kpi-compact">
        <div className="fd-kpi-card">
          <span className="kpi-label">Draft</span>
          <span className="kpi-value">{money(totals.draft)}</span>
          <span className="kpi-hint">Not yet approved</span>
        </div>
        <div className="fd-kpi-card accent-orange">
          <span className="kpi-label">Awaiting payment</span>
          <span className="kpi-value">{money(totals.approved)}</span>
          <span className="kpi-hint">Approved, not yet paid</span>
        </div>
        <div className="fd-kpi-card accent-red">
          <span className="kpi-label">Settled</span>
          <span className="kpi-value">{money(totals.settled)}</span>
          <span className="kpi-hint">Posted to the ledger</span>
        </div>
      </div>

      <div className="fd-ledger-filters">
        {FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            className={`fd-chip ${filter === f.value ? 'is-active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
        <button className="fd-btn fd-btn-outline" onClick={load}>🔄 Refresh</button>
      </div>

      {loading ? (
        <div className="fd-loading">Loading expenses…</div>
      ) : visible.length === 0 ? (
        <div className="fd-empty">No expenses here yet.</div>
      ) : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr>
                <th>Category</th><th>Description</th><th className="num">Amount</th>
                <th>Date</th><th>Paid by</th><th>Status</th><th>Document</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const status = String(e.Status || '').toLowerCase()
                const busy = busyId === e.Id
                const isPosted = !!e.TransactionDetailLogId
                return (
                  <tr key={e.Id}>
                    <td className="strong">{categoryName(e)}</td>
                    <td>{e.Description || <span className="muted">—</span>}</td>
                    <td className="num strong">{money(e.Amount)}</td>
                    <td>{e.ExpenseDate ? String(e.ExpenseDate).slice(0, 10) : <span className="muted">—</span>}</td>
                    <td>{e.PaymentMode || <span className="muted">—</span>}</td>
                    <td><StatusBadge status={e.Status} /></td>
                    <td>
                      {e.TransactionNo
                        ? <span className="fd-doc-no">{e.TransactionNo}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td className="fd-row-actions">
                      {/* A posted expense is corrected by reversing its document,
                          never by editing — so no edit control is offered at all. */}
                      {status === 'draft' && canWrite && (
                        <button className="fd-btn fd-btn-sm fd-btn-outline"
                                onClick={() => openEdit(e)} disabled={busy}>Edit</button>
                      )}
                      {status === 'draft' && canApprove && (
                        <>
                          <button className="fd-btn fd-btn-sm fd-btn-primary" disabled={busy}
                                  onClick={() => act(e.Id, () => posService.approveExpense(e.Id), 'Expense approved')}>
                            Approve
                          </button>
                          <button className="fd-btn fd-btn-sm fd-btn-danger" disabled={busy}
                                  onClick={() => act(e.Id, () => posService.rejectExpense(e.Id), 'Expense rejected')}>
                            Reject
                          </button>
                        </>
                      )}
                      {status === 'approved' && canApprove && (
                        <button className="fd-btn fd-btn-sm fd-btn-primary" disabled={busy}
                                onClick={() => { setSettleTarget(e); setSettleMode(e.PaymentModeId || '') }}>
                          Settle &amp; pay
                        </button>
                      )}
                      {status === 'draft' && canWrite && !isPosted && (
                        <button className="fd-btn fd-btn-sm fd-btn-outline" disabled={busy}
                                onClick={() => remove(e)}>Delete</button>
                      )}
                      {isPosted && <span className="muted small">Locked — reverse to correct</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Expense">
          <form className="fd-form-modal" onSubmit={save}>
            <h3>{editing ? 'Edit expense' : 'New expense'}</h3>
            <p className="fd-variant-hint">
              Saved as a <strong>draft</strong>. It becomes a cost only once approved and settled.
            </p>

            <label htmlFor="exp-cat">Category *</label>
            <select id="exp-cat" value={form.ExpenseCategoryId} required
                    onChange={(e) => setForm({ ...form, ExpenseCategoryId: e.target.value })}>
              <option value="">Select a category…</option>
              {categories.map((c) => (
                <option key={c.Id || c.id} value={c.Id || c.id}>{c.Name}</option>
              ))}
            </select>

            <label htmlFor="exp-amt">Amount *</label>
            <input id="exp-amt" type="number" min="0.01" step="0.01" required
                   value={form.Amount}
                   onChange={(e) => setForm({ ...form, Amount: e.target.value })} />

            <label htmlFor="exp-desc">Description</label>
            <input id="exp-desc" type="text" maxLength={500} value={form.Description}
                   onChange={(e) => setForm({ ...form, Description: e.target.value })}
                   placeholder="e.g. LPG cylinder refill" />

            <label htmlFor="exp-date">Expense date</label>
            <input id="exp-date" type="date" value={form.ExpenseDate}
                   onChange={(e) => setForm({ ...form, ExpenseDate: e.target.value })} />

            <label htmlFor="exp-mode">Paid by</label>
            <select id="exp-mode" value={form.PaymentModeId}
                    onChange={(e) => setForm({ ...form, PaymentModeId: e.target.value })}>
              <option value="">Decide at settlement…</option>
              {modes.map((m) => (
                <option key={m.Id || m.id} value={m.Id || m.id}>{m.Type}</option>
              ))}
            </select>
            <span className="fd-field-hint">Decides which account the money leaves.</span>

            <label htmlFor="exp-branch">Branch</label>
            <select id="exp-branch" value={form.BranchDetailId}
                    onChange={(e) => setForm({ ...form, BranchDetailId: e.target.value })}>
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName}</option>
              ))}
            </select>

            <div className="fd-variant-actions">
              <button type="submit" className="fd-btn fd-btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Raise expense'}
              </button>
              <button type="button" className="fd-btn fd-btn-outline"
                      onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {settleTarget && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Settle expense">
          <div className="fd-variant-modal">
            <h3>Settle {money(settleTarget.Amount)}?</h3>
            <p className="fd-variant-hint">
              This posts an expense document to the ledger and records the money
              leaving the account below. It cannot be edited afterwards — only reversed.
            </p>

            <label htmlFor="settle-mode">Paid by *</label>
            <select id="settle-mode" value={settleMode} onChange={(e) => setSettleMode(e.target.value)}>
              <option value="">Select…</option>
              {modes.map((m) => (
                <option key={m.Id || m.id} value={m.Id || m.id}>{m.Type}</option>
              ))}
            </select>

            <div className="fd-variant-actions">
              <button className="fd-btn fd-btn-primary" onClick={doSettle}
                      disabled={busyId === settleTarget.Id}>
                {busyId === settleTarget.Id ? 'Posting…' : 'Settle & post'}
              </button>
              <button className="fd-btn fd-btn-outline"
                      onClick={() => { setSettleTarget(null); setSettleMode('') }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Expenses
