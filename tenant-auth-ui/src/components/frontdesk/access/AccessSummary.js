import React, { useEffect, useMemo, useState } from 'react'
import adminService from '../../../services/adminService'
import { getAuditLogs } from '../../../services/dataService'
import { roleLabel } from '../../../utils/roleLabels'
import { formatForDisplay } from '../../../utils/phone'
import { grantsByRole, indexFeatures, keysForIds } from '../../../utils/roleAccess'
import AccessPreview from './AccessPreview'
import './access.css'

const splitRoles = (text) => String(text || '').split(',').map((r) => r.trim()).filter(Boolean)
const when = (v) => (v ? new Date(v).toLocaleString() : '')

/**
 * One person's effective access, in one place.
 *
 * What used to take three screens and some arithmetic: whether the Admin switch
 * is on (it overrides every role), which roles they hold and what those add up
 * to, what they would see if the switch were turned off, and the recent changes
 * to their access from the audit trail — each one now a single row that says
 * what changed.
 *
 * @param {Object} props
 * @param {Object} props.person - A row from GET /api/admin/users.
 * @param {Array} props.roles - The tenancy's roles.
 * @param {Array} props.features - The global catalogue.
 * @param {Function} props.onClose
 */
const AccessSummary = ({ person, roles = [], features = [], onClose }) => {
  const [grants, setGrants] = useState(null)
  const [changes, setChanges] = useState(null)
  const phone = person.user_phone

  useEffect(() => {
    let live = true
    adminService.listRolePermissionMatrix()
      .then((rows) => { if (live) setGrants(grantsByRole(rows)) })
      .catch(() => { if (live) setGrants(new Map()) })
    getAuditLogs({ category: 'USER_MGMT', limit: 200 })
      .then((res) => {
        if (!live) return
        const logs = res?.data?.logs || []
        setChanges(logs
          .filter((l) => l.resource_id === phone && !/^Viewed/.test(l.action || ''))
          .slice(0, 8))
      })
      .catch(() => { if (live) setChanges([]) })
    return () => { live = false }
  }, [phone])

  const held = useMemo(() => {
    const names = splitRoles(person.roles)
    return names.map((name) => roles.find((r) => (r.name || r.Name) === name) || { name })
  }, [person.roles, roles])

  const featuresById = useMemo(() => indexFeatures(features), [features])
  const roleScopes = useMemo(() => {
    if (!grants) return []
    const ids = new Set(held.flatMap((r) => [...(grants.get(r.id) || [])]))
    return keysForIds(ids, featuresById)
  }, [grants, held, featuresById])

  const name = person.full_name && person.full_name !== phone ? person.full_name : null
  const active = String(person.status || '').toUpperCase() === 'ACTIVE'

  return (
    <div className="fd-modal-overlay" onClick={onClose}>
      <div className="fd-modal ac-modal-wide" role="dialog" aria-modal="true" aria-labelledby="ac-sum-title"
           onClick={(e) => e.stopPropagation()}>
        <div className="fd-modal-header">
          <h3 id="ac-sum-title">{name || formatForDisplay(phone)}</h3>
          <button type="button" className="fd-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="ac-summary">
          <p className="fd-page-sub" style={{ margin: 0 }}>
            {formatForDisplay(phone)} · <span className={`fd-badge fd-badge-${active ? 'settled' : 'closed'}`}>{person.status || '—'}</span>
            {' · '}home branch {person.branch_name || 'none'}
            <span className="muted"> (a label — it does not limit what they can open)</span>
          </p>

          {person.is_super_admin ? (
            <div className="ac-summary-callout"><strong>Platform super admin.</strong> Passes every check, in every tenancy.</div>
          ) : person.is_admin ? (
            <div className="ac-summary-callout">
              <strong>Admin switch on — full access to every rail, plus People &amp; Access.</strong>
              {' '}The roles below do not limit this person while the switch is on.
            </div>
          ) : null}

          <div className="ac-split">
            <div className="ac-card">
              <strong>Roles</strong>
              {held.length === 0 && <span className="muted">No roles in this tenancy.</span>}
              {held.map((r) => (
                <div key={r.name} className="ac-card-row">
                  <span><strong>{roleLabel(r)}</strong> <span className="ac-code">{r.name}</span></span>
                  <span className="muted">{r.permission_count ?? '—'} permissions</span>
                </div>
              ))}
              {grants && <span style={{ fontSize: 13 }}><strong>{roleScopes.length} distinct permissions</strong> from roles</span>}
            </div>
            <div className="ac-card">
              <strong>{person.is_admin || person.is_super_admin ? 'If the Admin switch were turned off' : 'What their roles open'}</strong>
              {grants ? <AccessPreview scopes={roleScopes} compact /> : <span className="muted">Working it out…</span>}
            </div>
          </div>

          <div className="ac-card">
            <strong>Recent access changes</strong>
            {changes === null && <span className="muted">Reading the audit trail…</span>}
            {changes && changes.length === 0 && <span className="muted">No changes recorded for this person.</span>}
            {changes && changes.length > 0 && (
              <div className="ac-changes">
                {changes.map((c) => (
                  <div key={c.log_id} className="ac-change">
                    <span className="muted">{when(c.timestamp)}</span>
                    <span><strong>{c.action}</strong>{c.details ? ` — ${c.details}` : ''}
                      <span className="muted"> · by {formatForDisplay(c.user_phone)}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ac-banner is-info">
            Access is checked on every request: a change made here reaches them on their next action, with no sign-out.
          </div>
        </div>
      </div>
    </div>
  )
}

export default AccessSummary
