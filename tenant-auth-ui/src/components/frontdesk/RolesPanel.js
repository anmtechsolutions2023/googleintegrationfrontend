import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import adminService from '../../services/adminService'

/**
 * The roles this tenancy can hand out, and what each one grants.
 *
 * Roles are per-tenancy; the FEATURES they are built from are global. So this
 * screen creates and edits roles freely, but only ever picks from a catalogue
 * it cannot change — adding a feature would change what every tenant on the
 * platform can be granted, which is why that stays with the super admin.
 *
 * SUPER_ADMIN and TENANT_ADMIN are system roles and are read-only here. Two
 * further things they cannot do, worth knowing before hunting for the control:
 * assigning a role NAMED 'TENANT_ADMIN' does not make somebody an administrator
 * (that is the membership flag, on the People tab), and a role in use cannot be
 * deleted until it is unassigned.
 *
 * Owns its own roles list; the parent supplies the feature catalogue so the
 * permissions editor does not refetch it per role.
 */

const isSystem = (r) => (r.is_system_role ?? r.IsSystemRole) === 1

// ── Create / edit a role ─────────────────────────────────────────────────────
const RoleFormModal = ({ role, onClose, onDone }) => {
  const isEdit = !!role
  const locked = isEdit && isSystem(role)
  const [name, setName] = useState(role?.name || '')
  const [description, setDescription] = useState(role?.description || '')
  const [isActive, setIsActive] = useState(role ? !!role.is_active : true)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.warn('Give the role a name'); return }
    setSaving(true)
    try {
      await adminService.saveRole(isEdit ? role.id : null, isEdit
        ? { name: name.trim(), description: description.trim(), is_active: isActive }
        : { name: name.trim(), description: description.trim() })
      toast.success(isEdit ? 'Role updated' : 'Role created')
      onDone()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save the role')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fd-modal-overlay" onClick={onClose}>
      <form className="fd-modal" role="dialog" aria-modal="true"
            onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="fd-modal-header">
          <h3>{isEdit ? `Edit ${role.name}` : 'New role'}</h3>
          <button type="button" className="fd-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        {locked && (
          <p className="fd-page-sub">
            System roles cannot be renamed or deleted — the login path depends on them.
          </p>
        )}

        <div className="fd-invite-row">
          <label htmlFor="role-name">Role name</label>
          <input
            id="role-name" type="text" maxLength={100} value={name} disabled={locked}
            onChange={(e) => setName(e.target.value)} autoFocus
          />
        </div>

        <div className="fd-invite-row" style={{ marginTop: 12 }}>
          <label htmlFor="role-desc">Description</label>
          <input
            id="role-desc" type="text" maxLength={500} value={description} disabled={locked}
            placeholder="What this role is for"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {isEdit && (
          <label className="fd-admin-toggle" style={{ marginTop: 14 }}>
            <input
              type="checkbox" checked={isActive} disabled={locked}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Active</span>
          </label>
        )}

        <div className="fd-confirm-actions">
          <button type="button" className="fd-btn fd-btn-outline" onClick={onClose}>Cancel</button>
          <button className="fd-btn fd-btn-primary" disabled={saving || locked}>
            {saving ? 'Saving…' : isEdit ? 'Save role' : 'Create role'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── What a role grants ───────────────────────────────────────────────────────
const PermissionsModal = ({ role, features, onClose, onDone }) => {
  const locked = isSystem(role)
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [category, setCategory] = useState('ALL')

  useEffect(() => {
    let live = true
    adminService.listRolePermissionIds(role.id)
      .then((ids) => { if (live) setSelected(ids) })
      .catch(() => toast.error('Failed to load what this role grants'))
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [role.id])

  const categories = useMemo(
    () => ['ALL', ...new Set(features.map((f) => f.category).filter(Boolean))],
    [features],
  )
  const visible = category === 'ALL' ? features : features.filter((f) => f.category === category)

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const save = async () => {
    setSaving(true)
    try {
      await adminService.saveRolePermissions(role.id, selected)
      toast.success('Permissions updated')
      onDone()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save the permissions')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fd-modal-overlay" onClick={onClose}>
      <div className="fd-modal fd-modal-wide" role="dialog" aria-modal="true"
           onClick={(e) => e.stopPropagation()}>
        <div className="fd-modal-header">
          <h3>What {role.name} grants</h3>
          <button className="fd-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        {/* Scopes are frozen into the token at login, so a change here reaches
            somebody only when they next sign in. Saying so prevents the usual
            "I granted it and nothing happened". */}
        <p className="fd-page-sub">
          {locked
            ? 'This is a system role — what it grants is fixed.'
            : 'Takes effect for each member the next time they sign in.'}
        </p>

        {loading ? (
          <div className="fd-loading">Loading permissions…</div>
        ) : features.length === 0 ? (
          <div className="fd-empty">No features available to assign.</div>
        ) : (
          <>
            <div className="fd-token-toolbar">
              <select aria-label="Filter by category" value={category}
                      onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>
                ))}
              </select>
              <span className="muted">{selected.length} selected</span>
            </div>

            <div className="fd-invite-role-list">
              {visible.map((f) => {
                const id = f.feature_id
                const on = selected.includes(id)
                return (
                  <label key={id} className={on ? 'is-on' : ''}>
                    <input
                      type="checkbox" checked={on} disabled={locked}
                      onChange={() => toggle(id)}
                    />
                    {f.display_name || `${f.feature_short_name}:${f.scope}`}
                  </label>
                )
              })}
            </div>
          </>
        )}

        <div className="fd-confirm-actions">
          <button className="fd-btn fd-btn-outline" onClick={onClose}>Cancel</button>
          <button className="fd-btn fd-btn-primary" disabled={saving || loading || locked}
                  onClick={save}>
            {saving ? 'Saving…' : 'Save permissions'}
          </button>
        </div>
      </div>
    </div>
  )
}

const RolesPanel = ({ features = [], canWrite = true, onRolesChanged }) => {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [formTarget, setFormTarget] = useState(null)   // role, or null for "new"
  const [formOpen, setFormOpen] = useState(false)
  const [permTarget, setPermTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRoles(await adminService.listRoles())
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load roles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const done = () => {
    setFormOpen(false); setFormTarget(null); setPermTarget(null)
    load()
    onRolesChanged?.()
  }

  const remove = async () => {
    const role = deleteTarget
    setDeleteTarget(null)
    try {
      await adminService.deleteRole(role.id)
      toast.success('Role deleted')
      load()
      onRolesChanged?.()
    } catch (e) {
      // "Cannot delete role: it is currently assigned to one or more users" is
      // actionable, so show what the server said.
      toast.error(e?.response?.data?.message || 'Could not delete the role')
    }
  }

  const filtered = roles.filter((r) => {
    const q = search.trim().toLowerCase()
    return !q || `${r.name} ${r.description || ''}`.toLowerCase().includes(q)
  })

  if (loading) return <div className="fd-loading">Loading roles…</div>

  return (
    <>
      <div className="fd-token-toolbar">
        <input
          className="fd-search" type="search" placeholder="Search roles…"
          aria-label="Search roles" value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canWrite && (
          <button className="fd-btn fd-btn-primary" style={{ marginLeft: 'auto' }}
                  onClick={() => { setFormTarget(null); setFormOpen(true) }}>
            + New role
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="fd-empty">
          {roles.length === 0 ? 'No roles in this tenancy yet.' : 'No role matches that search.'}
        </div>
      ) : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr>
                <th>Role</th><th>Description</th><th>Grants</th><th>People</th>
                <th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    {isSystem(r) && <span className="fd-source-chip is-token">system</span>}
                  </td>
                  <td>{r.description || <span className="muted">—</span>}</td>
                  <td>{r.permission_count ?? <span className="muted">—</span>}</td>
                  <td>{r.user_count ?? <span className="muted">—</span>}</td>
                  <td>
                    <span className={`fd-badge fd-badge-${r.is_active ? 'settled' : 'closed'}`}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="fd-token-actions">
                    <button className="fd-btn fd-btn-outline fd-btn-sm"
                            onClick={() => setPermTarget(r)}>
                      {canWrite && !isSystem(r) ? 'Permissions' : 'View permissions'}
                    </button>
                    {canWrite && !isSystem(r) && (
                      <>
                        <button className="fd-btn fd-btn-outline fd-btn-sm"
                                onClick={() => { setFormTarget(r); setFormOpen(true) }}>Edit</button>
                        <button className="fd-btn fd-btn-danger fd-btn-sm"
                                onClick={() => setDeleteTarget(r)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <RoleFormModal role={formTarget} onClose={() => setFormOpen(false)} onDone={done} />
      )}

      {permTarget && (
        <PermissionsModal role={permTarget} features={features}
                          onClose={() => setPermTarget(null)} onDone={done} />
      )}

      {deleteTarget && (
        <div className="fd-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="fd-modal fd-confirm" role="dialog" aria-modal="true"
               onClick={(e) => e.stopPropagation()}>
            <h3>Delete {deleteTarget.name}?</h3>
            <p className="fd-confirm-sub">
              Anyone holding this role loses what it granted when they next sign in.
              A role that is still assigned cannot be deleted — take it off those
              people first.
            </p>
            <div className="fd-confirm-actions">
              <button className="fd-btn fd-btn-outline" onClick={() => setDeleteTarget(null)}>
                Keep it
              </button>
              <button className="fd-btn fd-btn-danger" onClick={remove}>Delete role</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default RolesPanel
