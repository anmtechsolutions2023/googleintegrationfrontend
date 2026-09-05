import React, { useCallback, useEffect, useState } from 'react'
import { groupNational, looksComplete, toE164, formatForDisplay } from '../../utils/phone'
import { toast } from 'react-toastify'
import adminService from '../../services/adminService'
import { roleLabel, roleCode, roleDescription, grantableRoles } from '../../utils/roleLabels'

const when = (v) => (v ? new Date(v).toLocaleDateString() : '—')

const STATUS_CLASS = {
  PENDING: 'pending', ACCEPTED: 'settled', REVOKED: 'closed', EXPIRED: 'closed',
}

/**
 * Invite somebody into this tenancy.
 *
 * The gap this fills: a tenant admin had no way to add anybody at all. The only
 * route in was approving an onboarding request, which the person has to raise
 * themselves by attempting to sign in — and with auto-approval enabled they
 * never reach that queue, because they are handed a brand-new tenancy of their
 * own instead. An invitation is claimed at login and outranks that, so the
 * invitee joins THIS tenancy.
 *
 * Owns its own data; the tenancy is never sent — the server reads it from the
 * token, so this panel cannot invite into anyone else's.
 */
const InvitePanel = ({ roles = [], branches = [], canWrite = true }) => {
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)

  // Staff details. Adding somebody to the rota IS inviting them — one person,
  // one record — so these are captured here rather than in a second screen the
  // admin has to remember to visit once the person first signs in.
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [branchDetailId, setBranchDetailId] = useState('')
  const [roleIds, setRoleIds] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setInvitations(await adminService.listInvitations())
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load invitations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggleRole = (id) =>
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]))

  const submit = async (e) => {
    e.preventDefault()
    if (!looksComplete(phone)) { toast.warn('Enter a valid mobile number'); return }
    // Required now, not optional: a membership carries the name, and a list of
    // bare numbers tells an admin nothing about who is who.
    if (!fullName.trim()) { toast.warn('Enter their full name'); return }
    setSaving(true)
    try {
      await adminService.createInvitation({
        phone: toE164(phone), roleIds, isAdmin,
        fullName: fullName.trim(),
        branchDetailId: branchDetailId || undefined,
      })
      toast.success(`${fullName.trim()} joins this tenancy when they first sign in`)
      setRoleIds([]); setIsAdmin(false)
      setFullName(''); setPhone(''); setBranchDetailId('')
      await load()
    } catch (err) {
      // The server distinguishes "already a member" from "already invited" —
      // both are actionable, so show what it said rather than a generic failure.
      toast.error(err?.response?.data?.message || 'Could not send the invitation')
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (inv) => {
    setBusyId(inv.id)
    try {
      await adminService.revokeInvitation(inv.id)
      toast.info(`Invitation to ${inv.full_name || formatForDisplay(inv.phone)} withdrawn`)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not withdraw the invitation')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fd-invite-panel">
      {canWrite && (
        <form className="fd-invite-form" onSubmit={submit}>
          <div className="fd-invite-row">
            <label htmlFor="inv-phone">WhatsApp number</label>
            <div className="fd-invite-phone">
              <span className="fd-invite-dial">+91</span>
              <input
                id="inv-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                placeholder="98765 43210"
                value={groupNational(phone)}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="fd-invite-row">
            <label htmlFor="inv-name">Full name</label>
            <input
              id="inv-name"
              type="text"
              placeholder="Priya Ramanathan"
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          {branches.length > 0 && (
            <div className="fd-invite-row">
              <label htmlFor="inv-branch">Branch</label>
              <select
                id="inv-branch"
                value={branchDetailId}
                onChange={(e) => setBranchDetailId(e.target.value)}
              >
                <option value="">No fixed branch</option>
                {branches.map((b) => (
                  <option key={b.Id || b.id} value={b.Id || b.id}>
                    {b.BranchName || b.branchName || b.Name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {grantableRoles(roles).length > 0 && (
            <fieldset className="fd-invite-roles">
              <legend>Roles in this tenancy</legend>
              <div className="fd-invite-role-list">
                {grantableRoles(roles).map((r) => {
                  const id = r.id || r.Id
                  const desc = roleDescription(r)
                  return (
                    <label key={id} className={roleIds.includes(id) ? 'is-on' : ''}>
                      <input
                        type="checkbox"
                        checked={roleIds.includes(id)}
                        onChange={() => toggleRole(id)}
                      />
                      {/* The job, then the code. The code stays visible so
                          support can still ask which role somebody holds and
                          get an answer that matches the seed. */}
                      <span className="fd-role-text">
                        <span className="fd-role-head">
                          <strong>{roleLabel(r)}</strong>
                          <code>{roleCode(r)}</code>
                        </span>
                        {desc && <em>{desc}</em>}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {/* Tenant-admin rights come from the membership, not from any role, so
              this is the only way to invite somebody as a co-admin. */}
          <label className="fd-invite-admin">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            <span>
              <strong>Invite as tenant admin</strong>
              <em>They can manage users, roles and invitations for this tenancy.</em>
            </span>
          </label>

          <button className="fd-btn fd-btn-primary" disabled={saving}>
            {saving ? 'Sending…' : 'Send invitation'}
          </button>
          <p className="fd-invite-note">
            They join when they next sign in with this Google account — whether or
            not they already have one. The details above become their staff record
            in this tenancy.
          </p>
        </form>
      )}

      <div className="fd-section-title">Invitations</div>
      {loading ? (
        <div className="fd-loading">Loading invitations…</div>
      ) : invitations.length === 0 ? (
        <div className="fd-empty">
          No invitations yet. Invite someone above to add them to this tenancy.
        </div>
      ) : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr>
                <th>Person</th><th>Roles</th><th>Status</th>
                <th>Invited by</th><th>Expires</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <strong>{inv.full_name || formatForDisplay(inv.phone)}</strong>
                    {inv.full_name && <div className="muted">{formatForDisplay(inv.phone)}</div>}
                    {!!inv.is_admin && <span className="fd-source-chip is-token">admin</span>}
                  </td>
                  <td>
                    {inv.role_names || <span className="muted">No roles</span>}
                  </td>
                  <td>
                    <span className={`fd-badge fd-badge-${STATUS_CLASS[inv.status] || 'pending'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="muted">{inv.invited_by}</td>
                  <td>{inv.status === 'PENDING' ? when(inv.expires_at) : <span className="muted">—</span>}</td>
                  <td>
                    {canWrite && inv.status === 'PENDING' && (
                      <button
                        className="fd-btn fd-btn-outline fd-btn-sm"
                        disabled={busyId === inv.id}
                        onClick={() => revoke(inv)}
                      >
                        Withdraw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default InvitePanel
