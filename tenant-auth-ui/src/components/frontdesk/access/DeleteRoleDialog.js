import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import adminService from '../../../services/adminService'
import { roleLabel, roleCode } from '../../../utils/roleLabels'
import { formatForDisplay } from '../../../utils/phone'
import { scopeLabel } from '../../../config/permissionCatalogue'
import './access.css'

const holdsRole = (rolesText, name) =>
  String(rolesText || '').split(',').map((r) => r.trim()).includes(name)

/**
 * Delete a role — only one nobody holds.
 *
 * The old dialog said an assigned role could not be deleted; the server deleted
 * it anyway and the assignments cascaded away. Now the server refuses (409) and
 * this dialog shows who holds the role and which pending invitations offer it
 * BEFORE anything is pressed, with a way to go and change their roles.
 *
 * @param {Object} props
 * @param {Object} props.role
 * @param {string[]} props.permissionKeys - What the role grants, for the "goes with it" list.
 * @param {Function} props.onClose
 * @param {Function} props.onDeleted
 * @param {Function} [props.onGoToPeople] - Switch to the People tab.
 */
const DeleteRoleDialog = ({ role, permissionKeys = [], onClose, onDeleted, onGoToPeople }) => {
  const name = roleCode(role)
  const [holders, setHolders] = useState(null)
  const [invites, setInvites] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([
      adminService.listUsers().catch(() => []),
      adminService.listInvitations().catch(() => []),
    ]).then(([users, invitations]) => {
      if (!live) return
      setHolders(users
        .filter((u) => holdsRole(u.roles, name))
        .map((u) => ({ name: u.full_name, phone: u.user_phone, isAdmin: !!u.is_admin, roles: u.roles })))
      setInvites(invitations.filter((i) => i.status === 'PENDING' && holdsRole(i.role_names, name)).length)
    })
    return () => { live = false }
  }, [name])

  const blocked = holders === null || holders.length > 0 || invites > 0

  const remove = async () => {
    setBusy(true)
    try {
      await adminService.deleteRole(role.id)
      toast.success(`${roleLabel(role)} deleted`)
      onDeleted?.()
    } catch (e) {
      // The server is the authority: somebody may have been given the role since.
      const details = e?.response?.data?.details
      if (details?.holders) setHolders(details.holders)
      if (details?.pendingInvitations !== undefined) setInvites(details.pendingInvitations)
      toast.error(e?.response?.data?.message || 'Could not delete the role')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fd-modal-overlay" onClick={onClose}>
      <div className="fd-modal fd-confirm" role="dialog" aria-modal="true" aria-labelledby="ac-del-title"
           onClick={(e) => e.stopPropagation()}>
        <h3 id="ac-del-title">Delete {roleLabel(role)}?</h3>
        <span className="ac-code">{name} · {permissionKeys.length} permissions</span>

        {holders === null && <p className="fd-confirm-sub">Checking who holds it…</p>}

        {holders && holders.length > 0 && (
          <>
            <p className="fd-confirm-sub">
              <strong>{holders.length} {holders.length === 1 ? 'person holds' : 'people hold'} this role.</strong>
              {' '}A role that people hold cannot be deleted. Take it off them first.
            </p>
            {holders.map((h) => (
              <div className="ac-holder" key={h.phone}>
                <span className="ac-role-name">
                  <strong>{h.name && h.name !== h.phone ? h.name : formatForDisplay(h.phone)}</strong>
                  <span className="ac-code">{formatForDisplay(h.phone)}{h.isAdmin ? ' · Admin switch on' : ''}</span>
                </span>
              </div>
            ))}
            {holders.some((h) => h.isAdmin) && (
              <p className="fd-confirm-sub muted">
                Anyone with the Admin switch on keeps full access whether or not they hold this role.
              </p>
            )}
          </>
        )}

        {invites > 0 && (
          <p className="fd-confirm-sub">
            <strong>{invites} pending {invites === 1 ? 'invitation offers' : 'invitations offer'} this role.</strong>
            {' '}Withdraw {invites === 1 ? 'it' : 'them'} on the Invitations tab first.
          </p>
        )}

        {holders && holders.length === 0 && invites === 0 && (
          <>
            <p className="fd-confirm-sub">Nobody holds this role. These permissions go with it:</p>
            <p className="fd-confirm-sub muted">
              {permissionKeys.length ? permissionKeys.map(scopeLabel).join(' · ') : 'none'}
            </p>
          </>
        )}

        <div className="fd-confirm-actions">
          {holders && holders.length > 0 && onGoToPeople && (
            <button type="button" className="fd-btn fd-btn-outline" onClick={onGoToPeople}>
              Change their roles
            </button>
          )}
          <button type="button" className="fd-btn fd-btn-outline" onClick={onClose}>Keep it</button>
          <button type="button" className="fd-btn fd-btn-danger" disabled={blocked || busy} onClick={remove}
                  title={blocked && holders ? 'Take it off everyone first' : undefined}>
            {busy ? 'Deleting…' : 'Delete role'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteRoleDialog
