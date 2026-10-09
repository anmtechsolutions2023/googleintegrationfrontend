import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import adminService from '../../services/adminService'
import { roleLabel, roleCode, roleArea, roleDescription } from '../../utils/roleLabels'
import { grantsByRole, indexFeatures, keysForIds } from '../../utils/roleAccess'
import RoleEditor from './access/RoleEditor'
import DeleteRoleDialog from './access/DeleteRoleDialog'
import RoleCompare from './access/RoleCompare'
import PermissionMatrix from './access/PermissionMatrix'
import AccessPreview from './access/AccessPreview'
import './access/access.css'

/**
 * The roles this tenancy can hand out, and what each one grants.
 *
 * Roles are per-tenancy; the FEATURES they are built from are global. So this
 * screen creates and edits roles freely, but only ever picks from a catalogue
 * it cannot change — adding a feature would change what every tenant on the
 * platform can be granted, which is why that stays with the super admin.
 *
 * Four views over the same data — one read of every grant in the tenancy:
 *   Roles    — the list, grouped the way the business is (front desk, back
 *              office), and an editor that lays a role's permissions out by
 *              the rail, in words, with what each one opens.
 *   Compare  — roles side by side, differences only.
 *   Matrix   — every role against every permission; exportable.
 *   Preview  — what a role's holder would see and be able to change.
 *
 * SUPER_ADMIN is not shown to a tenancy: nobody can be given it, and listing it
 * with 31 grants invited exactly that mistake. Platform super admins still see
 * it. TENANT_ADMIN is shown, and says that it is not the Admin switch.
 */

const isSystem = (r) => (r.is_system_role ?? r.IsSystemRole) === 1
const AREA_ORDER = ['Administration', 'Front desk', 'Back office']
const VIEWS = [['roles', 'Roles'], ['compare', 'Compare'], ['matrix', 'Matrix'], ['preview', 'Preview access']]

const RoleFormModal = ({ role, onClose, onDone }) => {
  const isEdit = !!role
  const [name, setName] = useState(role?.name || '')
  const [description, setDescription] = useState(role?.description || '')
  const [isActive, setIsActive] = useState(role ? !!role.is_active : true)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.warn('Give the role a name'); return }
    setSaving(true)
    try {
      const saved = await adminService.saveRole(isEdit ? role.id : null, isEdit
        ? { name: name.trim(), description: description.trim(), is_active: isActive }
        : { name: name.trim(), description: description.trim() })
      toast.success(isEdit ? 'Role updated' : 'Role created — now choose what it grants')
      onDone(saved)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save the role')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fd-modal-overlay" onClick={onClose}>
      <form className="fd-modal" role="dialog" aria-modal="true" aria-labelledby="ac-form-title"
            onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="fd-modal-header">
          <h3 id="ac-form-title">{isEdit ? `Edit ${roleLabel(role)}` : 'New role'}</h3>
          <button type="button" className="fd-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="fd-invite-row">
          <label htmlFor="role-name">Role name</label>
          <input id="role-name" type="text" maxLength={100} value={name}
                 onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className="fd-invite-row" style={{ marginTop: 12 }}>
          <label htmlFor="role-desc">Description</label>
          <input id="role-desc" type="text" maxLength={500} value={description}
                 placeholder="What this role is for"
                 onChange={(e) => setDescription(e.target.value)} />
        </div>

        {isEdit && (
          <>
            <label className="fd-admin-toggle" style={{ marginTop: 14 }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span>Active</span>
            </label>
            <p className="fd-page-sub" style={{ marginTop: 6 }}>
              An inactive role grants nothing to the people who hold it, from their next action on.
            </p>
          </>
        )}
        {!isEdit && (
          <p className="fd-page-sub" style={{ marginTop: 12 }}>
            A new role starts with no permissions; you choose them next.
          </p>
        )}

        <div className="fd-confirm-actions">
          <button type="button" className="fd-btn fd-btn-outline" onClick={onClose}>Cancel</button>
          <button className="fd-btn fd-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save role' : 'Create role'}
          </button>
        </div>
      </form>
    </div>
  )
}

const RolesPanel = ({ features = [], roles: rolesProp, canWrite = true, onRolesChanged, viewerIsSuper = false, onGoToPeople }) => {
  const [roles, setRoles] = useState([])
  const [grants, setGrants] = useState(() => new Map())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('roles')
  const [selectedId, setSelectedId] = useState(null)
  const [compareIds, setCompareIds] = useState([])
  const [previewId, setPreviewId] = useState(null)
  const [formTarget, setFormTarget] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const featuresById = useMemo(() => indexFeatures(features), [features])
  const editorRef = useRef(null)

  // On a tablet or phone the list sits above the editor; picking a role should
  // take you to it rather than leave you looking at the list.
  const pick = (id) => {
    setSelectedId(id)
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setTimeout(() => editorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // The roles come from the parent when it already holds them (Access &
      // Staff fetches them for every tab); asking again here sent the same
      // request twice on opening the Roles tab.
      const [roleList, rows] = await Promise.all([
        rolesProp ? null : adminService.listRoles(),
        adminService.listRolePermissionMatrix().catch(() => []),
      ])
      if (roleList) setRoles(roleList)
      setGrants(grantsByRole(rows))
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load roles')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (rolesProp) setRoles(rolesProp) }, [rolesProp])

  const shown = useMemo(
    () => roles.filter((r) => viewerIsSuper || roleCode(r) !== 'SUPER_ADMIN'),
    [roles, viewerIsSuper],
  )
  const selected = shown.find((r) => r.id === selectedId) || shown.find((r) => !isSystem(r)) || shown[0]

  const changed = (keepId) => {
    load()
    onRolesChanged?.()
    if (keepId) setSelectedId(keepId)
  }

  const matches = (r) => {
    const q = search.trim().toLowerCase()
    return !q || `${roleLabel(r)} ${roleCode(r)} ${roleDescription(r)}`.toLowerCase().includes(q)
  }
  const areas = AREA_ORDER
    .map((area) => ({ area, list: shown.filter((r) => roleArea(r) === area && matches(r)) }))
    .filter((a) => a.list.length > 0)

  const openCompare = (role) => { setCompareIds(role ? [role.id] : []); setView('compare') }
  const openPreview = (role) => { setPreviewId(role?.id || null); setView('preview') }
  const previewRole = shown.find((r) => r.id === previewId) || selected

  if (loading) return <div className="fd-loading">Loading roles…</div>

  return (
    <>
      <div className="ac-views" role="tablist" aria-label="Roles views">
        {VIEWS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key}
                  className={`fd-btn fd-btn-sm ${view === key ? 'fd-btn-primary' : 'fd-btn-outline'}`}
                  onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 && <div className="fd-empty">No roles in this tenancy yet.</div>}

      {shown.length > 0 && view === 'roles' && (
        <div className="ac-layout">
          <div className="ac-list">
            <div className="fd-token-toolbar" style={{ margin: 0 }}>
              <input className="fd-search" type="search" placeholder="Search roles…" aria-label="Search roles"
                     value={search} onChange={(e) => setSearch(e.target.value)} />
              {canWrite && (
                <button className="fd-btn fd-btn-primary" style={{ marginLeft: 'auto' }}
                        onClick={() => { setFormTarget(null); setFormOpen(true) }}>
                  + New role
                </button>
              )}
            </div>
            <div className="ac-note">
              <strong>Admin access is not a role.</strong> It is the Admin switch on a person, on the People tab,
              and it opens everything here including People &amp; Access.
            </div>
            {areas.length === 0 && <div className="fd-empty">No role matches that search.</div>}
            {areas.map(({ area, list }) => (
              <div key={area}>
                <div className="ac-area-title">{area}</div>
                {list.map((r) => (
                  <button key={r.id} type="button"
                          className={`ac-role-item ${selected?.id === r.id ? 'is-selected' : ''}`}
                          aria-pressed={selected?.id === r.id}
                          onClick={() => pick(r.id)}>
                    <span className="ac-role-name">
                      <strong>{roleLabel(r)}</strong>
                      <span className="ac-code">{roleCode(r)}{!r.is_active ? ' · inactive' : ''}</span>
                    </span>
                    <span className="ac-role-meta">
                      {r.permission_count ?? 0} perms<br />
                      {r.user_count ?? 0} {r.user_count === 1 ? 'person' : 'people'}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {selected && (
            <div ref={editorRef}>
            <RoleEditor
              role={selected}
              features={features}
              grantedIds={grants.get(selected.id) || new Set()}
              canWrite={canWrite}
              onSaved={() => changed(selected.id)}
              onEdit={() => { setFormTarget(selected); setFormOpen(true) }}
              onDelete={() => setDeleteTarget(selected)}
              onCompare={() => openCompare(selected)}
              onPreview={() => openPreview(selected)}
            />
            </div>
          )}
        </div>
      )}

      {shown.length > 0 && view === 'compare' && (
        <RoleCompare roles={shown} grants={grants} features={features} featuresById={featuresById}
                     initialIds={compareIds.length ? compareIds : shown.filter((r) => !isSystem(r)).slice(0, 3).map((r) => r.id)} />
      )}

      {shown.length > 0 && view === 'matrix' && (
        <PermissionMatrix roles={shown} grants={grants} features={features} featuresById={featuresById} />
      )}

      {shown.length > 0 && view === 'preview' && previewRole && (
        <div>
          <div className="ac-toolbar">
            <label htmlFor="ac-preview-role" style={{ fontWeight: 700 }}>Preview access as</label>
            <select id="ac-preview-role" value={previewRole.id} onChange={(e) => setPreviewId(e.target.value)}>
              {shown.map((r) => <option key={r.id} value={r.id}>{roleLabel(r)} ({roleCode(r)})</option>)}
            </select>
            <span className="ac-caption" style={{ margin: 0 }}>
              Worked out by the same navigation the app uses, without the Admin switch.
            </span>
          </div>
          <AccessPreview scopes={keysForIds(grants.get(previewRole.id), featuresById)} />
        </div>
      )}

      {formOpen && (
        <RoleFormModal
          role={formTarget}
          onClose={() => setFormOpen(false)}
          onDone={(saved) => { setFormOpen(false); setView('roles'); changed(saved?.id || formTarget?.id) }}
        />
      )}

      {deleteTarget && (
        <DeleteRoleDialog
          role={deleteTarget}
          permissionKeys={keysForIds(grants.get(deleteTarget.id), featuresById)}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); setSelectedId(null); changed() }}
          onGoToPeople={onGoToPeople ? () => { setDeleteTarget(null); onGoToPeople() } : undefined}
        />
      )}
    </>
  )
}

export default RolesPanel
