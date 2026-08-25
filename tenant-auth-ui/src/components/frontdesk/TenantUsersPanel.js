import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import adminService from '../../services/adminService'

/**
 * Everybody in this tenancy — staff record and login in one row.
 *
 * There is no separate roster any more: a person who works here IS a member of
 * the tenancy, so their name, phone and branch live on the membership alongside
 * their roles and their access. Two records for one human is what let the rota
 * and the sign-in list drift apart.
 *
 * The three things you can change are kept apart on purpose, because they carry
 * very different risks: DETAILS (what they are called), ROLES (what they may
 * do) and ADMIN (whether they may administer). Correcting a phone number should
 * never be a permission change.
 *
 * Owns its own data and mutations; the parent supplies the role and branch
 * catalogues so a single fetch serves every panel.
 */
const TenantUsersPanel = ({ roles = [], branches = [], currentEmail, canWrite = true, onChanged }) => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)      // email being role-edited
  const [draftRoles, setDraftRoles] = useState([])
  const [editingProfile, setEditingProfile] = useState(null) // email being detail-edited
  const [draftProfile, setDraftProfile] = useState({ fullName: '', phone: '', branchDetailId: '' })
  const [busy, setBusy] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await adminService.listUsers())
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const isSelf = (email) =>
    String(email || '').toLowerCase() === String(currentEmail || '').toLowerCase()

  const run = async (email, fn, message) => {
    setBusy(email)
    try {
      await fn()
      toast.success(message)
      await load()
      onChanged?.()
    } catch (e) {
      // The server distinguishes self-demotion, super-admin protection and
      // self-removal — each is actionable, so show what it actually said.
      toast.error(e?.response?.data?.message || 'That did not work')
    } finally {
      setBusy(null)
    }
  }

  // The role ids come from the server, not from the comma-joined role NAMES on
  // the row. Those names are a GROUP_CONCAT: it truncates at
  // group_concat_max_len and splits wrongly on a name containing a comma — and
  // because saving REPLACES the whole set, a short read would quietly strip
  // roles nobody asked to remove.
  const startEdit = async (user) => {
    const email = user.user_email
    setEditing(email)
    setDraftRoles([])
    setBusy(email)
    try {
      setDraftRoles(await adminService.listUserRoleIds(email))
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not load their current roles')
      setEditing(null)
    } finally {
      setBusy(null)
    }
  }

  const startEditProfile = (u) => {
    setDraftProfile({
      fullName: u.full_name || '',
      phone: u.phone || '',
      branchDetailId: u.branch_detail_id || '',
    })
    setEditingProfile(u.user_email)
  }

  const saveProfile = (email) =>
    run(email, () => adminService.updateUserProfile(email, {
      fullName: draftProfile.fullName.trim() || null,
      phone: draftProfile.phone.trim() || null,
      branchDetailId: draftProfile.branchDetailId || null,
    }), 'Details updated').then(() => setEditingProfile(null))

  const setDraft = (key) => (e) =>
    setDraftProfile((prev) => ({ ...prev, [key]: e.target.value }))

  const branchName = (id) => {
    const b = branches.find((x) => (x.Id || x.id) === id)
    return b ? (b.BranchName || b.branchName || b.Name) : null
  }

  const saveRoles = (email) =>
    run(email, () => adminService.setUserRoles(email, draftRoles), 'Roles updated')
      .then(() => setEditing(null))

  const toggleDraft = (id) =>
    setDraftRoles((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]))

  // Name, email and roles are all things somebody might search by — a manager
  // looking for "Priya" and one looking for "cashier" are both looking for a row.
  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase()
    return !q || `${u.full_name || ''} ${u.user_email} ${u.roles || ''}`.toLowerCase().includes(q)
  })

  if (loading) return <div className="fd-loading">Loading users…</div>
  if (users.length === 0) return <div className="fd-empty">No users in this tenancy yet.</div>

  return (
    <>
      {/* Assigning a role named TENANT_ADMIN or SUPER_ADMIN grants that role's
          feature scopes and nothing else — the admin screens are gated on the
          membership flag, which is the Admin switch below. */}
      <p className="fd-page-sub">
        <strong>Admin</strong> controls access to these management screens and is separate
        from roles. Changes take effect when the person next signs in.
        You cannot change your own roles — ask another administrator here.
      </p>

      <div className="fd-token-toolbar">
        <input
          className="fd-search" type="search" placeholder="Search people…"
          aria-label="Search people" value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="muted">
          {filtered.length === users.length
            ? `${users.length} ${users.length === 1 ? 'person' : 'people'}`
            : `${filtered.length} of ${users.length}`}
        </span>
      </div>

      {filtered.length === 0 && (
        <div className="fd-empty">Nobody here matches that search.</div>
      )}

      <div className="fd-table-scroll">
        <table className="fd-table">
          <thead>
            <tr>
              <th>Person</th><th>Branch</th><th>Roles</th><th>Admin</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const email = u.user_email
              const active = String(u.status || '').toUpperCase() === 'ACTIVE'
              const isEditing = editing === email
              const isEditingProfile = editingProfile === email
              const locked = busy === email

              return (
                <tr key={email}>
                  <td>
                    {isEditingProfile ? (
                      <div className="fd-profile-edit">
                        <input
                          type="text" placeholder="Full name" maxLength={100}
                          aria-label={`Full name for ${email}`}
                          value={draftProfile.fullName} onChange={setDraft('fullName')}
                        />
                        <input
                          type="tel" placeholder="Phone" maxLength={20}
                          aria-label={`Phone for ${email}`}
                          value={draftProfile.phone} onChange={setDraft('phone')}
                        />
                        <div className="muted">{email}</div>
                      </div>
                    ) : (
                      <>
                        <strong>{u.full_name || email}</strong>
                        {u.full_name && <div className="muted">{email}</div>}
                        {u.phone && <div className="muted">{u.phone}</div>}
                        {isSelf(email) && <span className="fd-source-chip is-table">you</span>}
                        {!!u.is_super_admin && <span className="fd-source-chip is-token">super admin</span>}
                      </>
                    )}
                  </td>

                  <td>
                    {isEditingProfile ? (
                      <select
                        aria-label={`Branch for ${email}`}
                        value={draftProfile.branchDetailId} onChange={setDraft('branchDetailId')}
                      >
                        <option value="">No fixed branch</option>
                        {branches.map((b) => (
                          <option key={b.Id || b.id} value={b.Id || b.id}>
                            {b.BranchName || b.branchName || b.Name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      u.branch_name || branchName(u.branch_detail_id) || <span className="muted">—</span>
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <div className="fd-invite-role-list">
                        {roles.map((r) => {
                          const id = r.id || r.Id
                          return (
                            <label key={id} className={draftRoles.includes(id) ? 'is-on' : ''}>
                              <input
                                type="checkbox"
                                checked={draftRoles.includes(id)}
                                onChange={() => toggleDraft(id)}
                              />
                              {r.name || r.Name}
                            </label>
                          )
                        })}
                      </div>
                    ) : (
                      u.roles || <span className="muted">No roles</span>
                    )}
                  </td>

                  <td>
                    {/* A super admin already passes every check, and an admin
                        cannot withdraw their own access — both are refused by
                        the server, so the control is not offered. */}
                    {u.is_super_admin || (isSelf(email) && u.is_admin) ? (
                      <span className={u.is_admin ? 'fd-badge fd-badge-settled' : 'muted'}>
                        {u.is_admin ? 'Admin' : '—'}
                      </span>
                    ) : (
                      <label className="fd-admin-toggle">
                        <input
                          type="checkbox"
                          checked={!!u.is_admin}
                          disabled={!canWrite || locked}
                          onChange={(e) => run(email,
                            () => adminService.setUserTenantAdmin(email, e.target.checked),
                            e.target.checked ? 'Admin access granted' : 'Admin access withdrawn')}
                        />
                        <span>Admin</span>
                      </label>
                    )}
                  </td>

                  <td>
                    <span className={`fd-badge fd-badge-${active ? 'settled' : 'closed'}`}>
                      {u.status || '—'}
                    </span>
                  </td>

                  <td className="fd-token-actions">
                    {canWrite && (isEditingProfile ? (
                      <>
                        <button className="fd-btn fd-btn-success fd-btn-sm"
                                disabled={locked} onClick={() => saveProfile(email)}>Save details</button>
                        <button className="fd-btn fd-btn-outline fd-btn-sm"
                                onClick={() => setEditingProfile(null)}>Cancel</button>
                      </>
                    ) : isEditing ? (
                      <>
                        <button className="fd-btn fd-btn-success fd-btn-sm"
                                disabled={locked} onClick={() => saveRoles(email)}>Save</button>
                        <button className="fd-btn fd-btn-outline fd-btn-sm"
                                onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        {/* Editing your own NAME is harmless — it cannot lock you
                            out of anything — so this one stays available to
                            everybody. */}
                        <button className="fd-btn fd-btn-outline fd-btn-sm"
                                onClick={() => startEditProfile(u)}>Edit details</button>
                        {/* Roles REPLACE the whole set on save, so an admin
                            saving their own with the wrong boxes ticked would
                            strip their own access with nothing on screen to say
                            why. The server refuses it; the button is not offered.
                            Their tenancy-wide access is untouched either way —
                            that comes from the Admin flag, not from a role. */}
                        {isSelf(email) ? (
                          <span className="muted" title="Ask another administrator in this tenancy">
                            Roles locked
                          </span>
                        ) : (
                          <button className="fd-btn fd-btn-outline fd-btn-sm"
                                  onClick={() => startEdit(u)}>Edit roles</button>
                        )}
                        {!isSelf(email) && (
                          <>
                            <button
                              className="fd-btn fd-btn-outline fd-btn-sm"
                              disabled={locked}
                              onClick={() => run(email,
                                () => adminService.setUserStatus(email, active ? 'SUSPENDED' : 'ACTIVE'),
                                active ? 'User suspended' : 'User reactivated')}
                            >
                              {active ? 'Suspend' : 'Reactivate'}
                            </button>
                            <button className="fd-btn fd-btn-danger fd-btn-sm"
                                    disabled={locked} onClick={() => setConfirmRemove(u)}>Remove</button>
                          </>
                        )}
                      </>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Removal ends a MEMBERSHIP, not a person — worth saying plainly, because
          "delete user" reads as something more final than it is. */}
      {confirmRemove && (
        <div className="fd-modal-overlay" onClick={() => setConfirmRemove(null)}>
          <div className="fd-modal fd-confirm" role="dialog" aria-modal="true"
               onClick={(e) => e.stopPropagation()}>
            <h3>Remove {confirmRemove.user_email}?</h3>
            <p className="fd-confirm-sub">
              They lose access to <strong>this tenancy</strong> and their roles here are cleared.
              Any other tenancy they belong to is unaffected. If this was their only
              one, they become a new user again the next time they sign in.
            </p>
            <p className="fd-confirm-sub muted">
              To block access temporarily instead, use Suspend — that is reversible.
            </p>
            <div className="fd-confirm-actions">
              <button className="fd-btn fd-btn-outline" onClick={() => setConfirmRemove(null)}>
                Keep them
              </button>
              <button
                className="fd-btn fd-btn-danger"
                disabled={busy === confirmRemove.user_email}
                onClick={() => {
                  const email = confirmRemove.user_email
                  setConfirmRemove(null)
                  run(email, () => adminService.removeUser(email), 'Removed from this tenancy')
                }}
              >
                Remove from tenancy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default TenantUsersPanel
