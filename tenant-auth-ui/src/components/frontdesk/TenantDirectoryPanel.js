import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import adminService from '../../services/adminService'

/**
 * Every tenancy on the platform, and who is in each one.
 *
 * Super-admin only, and the only view in the app that spans tenancies. What
 * makes it worth its own screen is the set of questions that cannot be asked
 * from inside a single tenancy — above all **which tenancies have no admin at
 * all**, where nobody there can invite staff, assign a role or even open this
 * screen. Somebody outside has to notice, and this is the only place they can.
 *
 * Deliberately read-only, with one exception. Role assignment is scoped to the
 * caller's own tenancy on the server (`req.user.tid`), and a super admin cannot
 * switch into a tenancy they do not belong to, so there is no honest way to
 * offer role editing here — a button that always 403s is worse than no button.
 * Suspend/reactivate IS offered, because the API genuinely supports it across
 * tenancies.
 *
 * Members are fetched when a tenancy is expanded rather than up front: the list
 * page carries counts, and pulling every person on the platform to render four
 * collapsed rows is a cost paid for nothing.
 */

const FILTERS = [
  { key: 'all', label: 'All' },
  // The three states a super admin is actually looking for.
  { key: 'no-admin', label: 'No admin' },
  { key: 'setup', label: 'Setup incomplete' },
  { key: 'suspended', label: 'Has suspended' },
]

const n = (v) => Number(v) || 0

// A tenancy with no organisation record has no name to show. It is a real
// state — a tenancy is created at first sign-in, before the setup wizard runs —
// so it gets a label rather than an empty cell.
const tenantLabel = (t) => t.tenant_name || null

const when = (v) => {
  if (!v) return 'Never'
  const d = new Date(v)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`
  if (mins < 60 * 24 * 7) return `${Math.round(mins / 1440)} d ago`
  return d.toLocaleDateString()
}

const roleChips = (roles, max = 2) => {
  const list = String(roles || '').split(', ').filter(Boolean)
  if (list.length === 0) return <span className="muted">No roles</span>
  return (
    <>
      {list.slice(0, max).map((r) => (
        <span key={r} className="fd-badge fd-badge-role">{r}</span>
      ))}
      {list.length > max && (
        <span className="fd-badge fd-badge-more" title={list.join(', ')}>
          +{list.length - max}
        </span>
      )}
    </>
  )
}

const TenantDirectoryPanel = ({ currentTenantId, currentPhone }) => {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [members, setMembers] = useState({})       // tenantId -> people
  const [loadingMembers, setLoadingMembers] = useState(null)
  const [busy, setBusy] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  // The tenancy queued for deletion, plus what the super admin has typed to
  // confirm it. Held here rather than on the row so only one can ever be open.
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTenants(await adminService.listTenants())
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load tenancies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openTenant = async (tenantId) => {
    if (expanded === tenantId) { setExpanded(null); return }
    setExpanded(tenantId)
    if (members[tenantId]) return
    setLoadingMembers(tenantId)
    try {
      const people = await adminService.listTenantUsers(tenantId)
      setMembers((prev) => ({ ...prev, [tenantId]: people }))
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load that tenancy’s people')
      setExpanded(null)
    } finally {
      setLoadingMembers(null)
    }
  }

  // Suspending reaches across tenancies; the server refuses a super admin and
  // refuses you your own account, so neither is offered.
  const setStatus = async (person, status) => {
    const key = `${person.tenant_id}:${person.user_phone}`
    setBusy(key)
    try {
      await adminService.updateUserStatusCrossTenant(person.user_phone, person.tenant_id, status)
      toast.success(status === 'ACTIVE' ? 'Access restored' : 'Access suspended')
      const people = await adminService.listTenantUsers(person.tenant_id)
      setMembers((prev) => ({ ...prev, [person.tenant_id]: people }))
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'That did not work')
    } finally {
      setBusy(null)
    }
  }

  // What the super admin has to type to arm the button. A named tenancy asks for
  // its name; an unnamed one has nothing to type, so it asks for the word
  // instead — the friction is the point either way, and a 36-character uuid is
  // friction you defeat by pasting.
  const confirmPhrase = (t) => tenantLabel(t) || 'DELETE'

  const closeDelete = () => {
    setDeleteTarget(null)
    setConfirmText('')
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await adminService.deleteTenant(deleteTarget.tenant_id)
      // Say what happened to the people, not just that rows went. The two
      // numbers mean genuinely different things and the distinction is the
      // whole reason this operation needed designing.
      const kept = n(res?.disassociated)
      const reset = n(res?.accountsReset)
      const parts = []
      if (kept) parts.push(`${kept} ${kept === 1 ? 'account' : 'accounts'} kept their other tenancies`)
      if (reset) parts.push(`${reset} returned to onboarding`)
      toast.success(
        `Deleted ${tenantLabel(deleteTarget) || 'the tenancy'}.${parts.length ? ` ${parts.join('; ')}.` : ''}`
      )
      closeDelete()
      // Collapse it if it happened to be the expanded one — its members are
      // gone and the fetched list behind it is now describing nothing.
      setExpanded((cur) => (cur === deleteTarget.tenant_id ? null : cur))
      setMembers((prev) => {
        const next = { ...prev }
        delete next[deleteTarget.tenant_id]
        return next
      })
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not delete that tenancy.')
    } finally {
      setDeleting(false)
    }
  }

  const totals = useMemo(() => tenants.reduce((acc, t) => ({
    people: acc.people + n(t.user_count),
    admins: acc.admins + n(t.admin_count),
    // What needs a human: a tenancy nobody can administer, or one still to be
    // set up. Counted as tenancies, since that is the thing you would act on.
    attention: acc.attention + (n(t.admin_count) === 0 || t.setup_status !== 'COMPLETED' ? 1 : 0),
  }), { people: 0, admins: 0, attention: 0 }), [tenants])

  const visible = useMemo(() => tenants.filter((t) => {
    if (filter === 'no-admin' && n(t.admin_count) > 0) return false
    if (filter === 'setup' && t.setup_status === 'COMPLETED') return false
    if (filter === 'suspended' && n(t.suspended_count) === 0) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return `${t.tenant_name || ''} ${t.tenant_id} ${t.roles || ''}`.toLowerCase().includes(q)
  }), [tenants, filter, search])

  if (loading) return <div className="fd-loading">Loading tenancies…</div>

  return (
    <>
      <p className="fd-page-sub">
        Every tenancy on the platform. Read-only: roles are assigned inside the
        tenancy that owns them, so this shows what each one holds rather than
        changing it. Suspending an account works from here.
      </p>

      <div className="fd-tenant-stats">
        <div className="fd-stat"><span className="k">Tenancies</span><span className="v">{tenants.length}</span></div>
        <div className="fd-stat"><span className="k">People</span><span className="v">{totals.people}</span></div>
        <div className="fd-stat"><span className="k">Admins</span><span className="v">{totals.admins}</span></div>
        <div className={`fd-stat${totals.attention > 0 ? ' is-alert' : ''}`}>
          <span className="k">Need attention</span><span className="v">{totals.attention}</span>
        </div>
      </div>

      <div className="fd-token-toolbar">
        <input
          className="fd-search" type="search" placeholder="Search tenancy, id or role…"
          aria-label="Search tenancies" value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`fd-chip${filter === f.key ? ' is-on' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <button className="fd-btn fd-btn-outline" onClick={load} style={{ marginLeft: 'auto' }}>
          Refresh
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="fd-empty">
          {tenants.length === 0
            ? 'No tenancies found.'
            : 'No tenancy matches that search.'}
        </div>
      ) : visible.map((t) => {
        const id = t.tenant_id
        const open = expanded === id
        const noAdmin = n(t.admin_count) === 0
        const people = members[id] || []
        const name = tenantLabel(t)

        return (
          <div key={id} className={`fd-tenant${open ? ' is-open' : ''}${noAdmin ? ' is-flagged' : ''}`}>
           <div className="fd-tenant-headrow">
            <button
              className="fd-tenant-head"
              aria-expanded={open}
              onClick={() => openTenant(id)}
            >
              <span className="fd-tenant-caret" aria-hidden="true">▶</span>

              <span className="fd-tenant-name">
                {name || <span className="fd-tenant-unnamed">Unnamed tenancy</span>}
                {id === currentTenantId && <span className="fd-source-chip is-table">yours</span>}
                <span className="fd-tenant-id">{id}</span>
              </span>

              <span className="fd-tenant-counts">
                <span><b>{n(t.user_count)}</b> {n(t.user_count) === 1 ? 'person' : 'people'}</span>
                <span><b>{n(t.admin_count)}</b> {n(t.admin_count) === 1 ? 'admin' : 'admins'}</span>
                <span><b>{n(t.branch_count)}</b> {n(t.branch_count) === 1 ? 'branch' : 'branches'}</span>
              </span>

              <span className="fd-tenant-roles">{roleChips(t.roles)}</span>

              <span className="fd-tenant-setup">
                <span className={`fd-badge fd-badge-${t.setup_status === 'COMPLETED' ? 'settled' : 'pending'}`}>
                  {t.setup_status === 'COMPLETED' ? 'Set up' : 'Setup incomplete'}
                </span>
              </span>
            </button>

            {/* Outside the toggle rather than inside it: the header is itself a
                button, and the one thing worse than burying a destructive action
                is nesting it in a control that expands a row. */}
            <span className="fd-tenant-danger">
              <button
                type="button"
                className="fd-tenant-delete"
                disabled={id === currentTenantId}
                title={id === currentTenantId
                  ? 'You cannot delete the tenancy you are signed in to.'
                  : 'Erase this tenancy and everything in it'}
                onClick={() => { setDeleteTarget(t); setConfirmText('') }}
              >
                Delete Tenant
              </button>
            </span>
           </div>

            {open && (
              <div className="fd-tenant-body">
                {/* Only somebody outside the tenancy can see this, because
                    everybody inside it is locked out of the screen that would
                    show it. */}
                {noAdmin && (
                  <div className="fd-tenant-warn">
                    <span aria-hidden="true">⚠</span>
                    <span>
                      No tenant admin. Nobody here can invite staff, assign a role
                      or open Access &amp; Staff.
                    </span>
                  </div>
                )}

                {loadingMembers === id ? (
                  <div className="fd-loading">Loading people…</div>
                ) : people.length === 0 ? (
                  <div className="fd-empty">Nobody belongs to this tenancy.</div>
                ) : (
                  <>
                    <div className="fd-tenant-table">
                      <table className="fd-table">
                        <thead>
                          <tr>
                            <th>Person</th><th>Branch</th><th>Roles</th>
                            <th>Access</th><th>Status</th><th>Last active</th><th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {people.map((p) => {
                            const active = String(p.status || '').toUpperCase() === 'ACTIVE'
                            const key = `${p.tenant_id}:${p.user_phone}`
                            const self = String(p.user_phone).toLowerCase()
                              === String(currentPhone || '').toLowerCase()
                            return (
                              <tr key={p.user_phone}>
                                <td>
                                  <strong>{p.full_name || p.user_phone}</strong>
                                  {p.full_name && <div className="muted">{p.user_phone}</div>}
                                  {p.phone && <div className="muted">{p.phone}</div>}
                                </td>
                                <td>{p.branch_name || <span className="muted">—</span>}</td>
                                <td className="fd-tenant-roles">{roleChips(p.roles, 3)}</td>
                                <td>
                                  {p.is_super_admin
                                    ? <span className="fd-source-chip is-token">super admin</span>
                                    : p.is_admin
                                      ? <span className="fd-badge fd-badge-settled">Admin</span>
                                      : <span className="muted">—</span>}
                                </td>
                                <td>
                                  <span className={`fd-badge fd-badge-${active ? 'settled' : 'closed'}`}>
                                    {p.status || '—'}
                                  </span>
                                </td>
                                <td className="muted">{when(p.last_active_at)}</td>
                                <td className="fd-token-actions">
                                  {/* The server refuses both of these, so they
                                      are not offered: a super admin's access is
                                      not changeable here, and you cannot suspend
                                      yourself. */}
                                  {p.is_super_admin || self ? (
                                    <span className="muted">Protected</span>
                                  ) : (
                                    <button
                                      className={`fd-btn fd-btn-sm ${active ? 'fd-btn-outline' : 'fd-btn-success'}`}
                                      disabled={busy === key}
                                      onClick={() => setStatus(p, active ? 'SUSPENDED' : 'ACTIVE')}
                                    >
                                      {active ? 'Suspend' : 'Reactivate'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Under the panel's own breakpoint the table is replaced by
                        one card per person carrying the same fields, so nothing
                        is hidden behind a sideways scroll. */}
                    <div className="fd-tenant-cards">
                      {people.map((p) => {
                        const active = String(p.status || '').toUpperCase() === 'ACTIVE'
                        const key = `${p.tenant_id}:${p.user_phone}`
                        const self = String(p.user_phone).toLowerCase()
                          === String(currentPhone || '').toLowerCase()
                        return (
                          <div className="fd-person-card" key={p.user_phone}>
                            <div className="fd-person-top">
                              <div>
                                <strong>{p.full_name || p.user_phone}</strong>
                                {p.full_name && <div className="muted">{p.user_phone}</div>}
                              </div>
                              <span className={`fd-badge fd-badge-${active ? 'settled' : 'closed'}`}>
                                {p.status || '—'}
                              </span>
                            </div>
                            <dl>
                              <dt>Roles</dt>
                              <dd className="fd-tenant-roles">{roleChips(p.roles, 3)}</dd>
                              <dt>Branch</dt>
                              <dd>{p.branch_name || '—'}</dd>
                              <dt>Access</dt>
                              <dd>
                                {p.is_super_admin ? 'Super admin' : p.is_admin ? 'Admin' : '—'}
                              </dd>
                              <dt>Active</dt>
                              <dd>{when(p.last_active_at)}</dd>
                            </dl>
                            {!(p.is_super_admin || self) && (
                              <button
                                className={`fd-btn fd-btn-sm ${active ? 'fd-btn-outline' : 'fd-btn-success'}`}
                                disabled={busy === key}
                                style={{ marginTop: 10 }}
                                onClick={() => setStatus(p, active ? 'SUSPENDED' : 'ACTIVE')}
                              >
                                {active ? 'Suspend' : 'Reactivate'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Deleting a tenancy is irreversible and has no export behind it, so the
          dialog spends its space on the two things a super admin cannot get
          back: what the tenancy contained, and what happens to the people in
          it. The typed phrase exists to stop a misfired click, not to prove
          anything — the server does the actual checking. */}
      {deleteTarget && (
        <div className="fd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Delete tenancy">
          <div className="fd-confirm-modal fd-tenant-confirm">
            <h3>Delete {tenantLabel(deleteTarget) || 'this tenancy'}?</h3>
            <p>
              This erases the tenancy and everything recorded under it — its
              branches, menu, orders, bills, ledger and audit trail — across{' '}
              <b>72 tables</b>. There is no undo and no export.
            </p>

            <div className="fd-tenant-confirm-counts">
              <span><b>{n(deleteTarget.user_count)}</b> {n(deleteTarget.user_count) === 1 ? 'person' : 'people'}</span>
              <span><b>{n(deleteTarget.branch_count)}</b> {n(deleteTarget.branch_count) === 1 ? 'branch' : 'branches'}</span>
              <span className="fd-tenant-confirm-id">{deleteTarget.tenant_id}</span>
            </div>

            <p className="fd-confirm-sub">
              Anybody who also belongs to another tenancy keeps their account and
              that tenancy untouched — only their membership here goes. Anybody
              for whom this was their only tenancy is returned to onboarding, so
              they can be invited somewhere new later.
            </p>

            <label className="fd-tenant-confirm-label" htmlFor="fd-tenant-confirm-input">
              Type <b>{confirmPhrase(deleteTarget)}</b> to confirm
            </label>
            <input
              id="fd-tenant-confirm-input"
              className="fd-input fd-tenant-confirm-input"
              value={confirmText}
              autoComplete="off"
              disabled={deleting}
              onChange={(e) => setConfirmText(e.target.value)}
            />

            <div className="fd-confirm-actions">
              <button className="fd-btn fd-btn-outline" onClick={closeDelete} disabled={deleting}>
                Cancel
              </button>
              <button
                className="fd-btn fd-btn-danger"
                disabled={deleting || confirmText.trim() !== confirmPhrase(deleteTarget)}
                onClick={confirmDelete}
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default TenantDirectoryPanel
