import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import adminService from '../../../services/adminService'
import { roleLabel, roleCode, roleDescription } from '../../../utils/roleLabels'
import {
  groupFeatures, featureKey, LEVELS, LEVEL_LABEL, scopeLabel, screensFor, actionScreensFor,
} from '../../../config/permissionCatalogue'
import { withRequirements, requiredBy } from '../../../config/permissionRules'
import './access.css'

const isSystem = (r) => (r?.is_system_role ?? r?.IsSystemRole) === 1

/** "Manage" for the same permission's other level, the full name otherwise. */
const neededByName = (needer, subject) => {
  const [s, level] = needer.split(':')
  return s === subject ? LEVEL_LABEL[level] : scopeLabel(needer)
}

const shorten = (screens) => {
  const tabs = [...new Set(screens.map((x) => x.split(' › ').slice(0, 2).join(' › ')))]
  return tabs.length > 4 ? `${tabs.slice(0, 4).join(' · ')} · +${tabs.length - 4} more` : tabs.join(' · ')
}

/**
 * "Opens: Billing & KOT · Service › Floor", shortened to whole tabs — or, for a
 * permission that is an action rather than a screen, where it is used.
 */
const opensText = (key) => {
  const opens = screensFor(key)
  if (opens.length) return `Opens: ${shorten(opens)}`
  const used = actionScreensFor(key)
  return used.length ? `Used on: ${shorten(used)}` : 'No screen of its own'
}

/**
 * One role's permissions, grouped by the rail.
 *
 * The same 31-odd permissions the old flat list showed, laid out the way the
 * app is: each under the rail entry where it mostly lives, with View / Manage /
 * Approve as columns and the screens each one opens written out. Ticking
 * Manage ticks View with it ("needed by …") — a role holding Manage alone used
 * to be able to call the API but never see the screens — and the server adds
 * the same requirements on save, so what is shown is what gets stored.
 *
 * @param {Object} props
 * @param {Object} props.role
 * @param {Array} props.features - The global catalogue.
 * @param {Set<string>} props.grantedIds - Feature ids the role holds now.
 * @param {boolean} props.canWrite
 * @param {Function} props.onSaved - Called after a save, with the server's change.
 * @param {Function} props.onEdit - Open the name / description / active form.
 * @param {Function} props.onDelete
 * @param {Function} props.onCompare
 * @param {Function} props.onPreview
 */
const RoleEditor = ({
  role, features = [], grantedIds = new Set(), canWrite = true,
  onSaved, onEdit, onDelete, onCompare, onPreview,
}) => {
  const groups = useMemo(() => groupFeatures(features), [features])
  const idByKey = useMemo(() => new Map(features.map((f) => [featureKey(f), f.feature_id])), [features])
  const available = useMemo(() => new Set(features.map(featureKey)), [features])
  const initial = useMemo(() => {
    const byId = new Map(features.map((f) => [f.feature_id, featureKey(f)]))
    return new Set([...grantedIds].map((id) => byId.get(id)).filter(Boolean))
  }, [features, grantedIds])

  const [chosen, setChosen] = useState(initial)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setChosen(initial) }, [initial, role?.id])

  const locked = !canWrite || isSystem(role)
  const finalKeys = useMemo(() => new Set(withRequirements([...chosen], available)), [chosen, available])
  const dirty = finalKeys.size !== initial.size || [...finalKeys].some((k) => !initial.has(k))

  const toggle = (key) => setChosen((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const save = async () => {
    setSaving(true)
    try {
      const ids = [...finalKeys].map((k) => idByKey.get(k)).filter(Boolean)
      const change = await adminService.saveRolePermissions(role.id, ids)
      const added = change?.added?.length || 0
      const removed = change?.removed?.length || 0
      toast.success(`${roleLabel(role)} saved: ${added} added, ${removed} removed`)
      onSaved?.(change)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not save the permissions')
    } finally {
      setSaving(false)
    }
  }

  const people = role.user_count ?? 0
  const code = roleCode(role)

  return (
    <section className="ac-editor" aria-label={`${roleLabel(role)} permissions`}>
      <div className="ac-editor-head">
        <div className="ac-editor-title">
          <h2>{roleLabel(role)} <span className="ac-code">{code}</span>
            {isSystem(role) && <span className="ac-chip is-system">system</span>}
            {!role.is_active && <span className="ac-chip">inactive</span>}
          </h2>
          {roleDescription(role) && <p>{roleDescription(role)}</p>}
          <p><strong>{finalKeys.size} permissions</strong> · held by {people} {people === 1 ? 'person' : 'people'}</p>
        </div>
        <div className="ac-editor-actions">
          <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" onClick={onCompare}>Compare</button>
          <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" onClick={onPreview}>Preview access</button>
          {canWrite && !isSystem(role) && (
            <>
              <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" onClick={onEdit}>Edit details</button>
              <button type="button" className="fd-btn fd-btn-danger fd-btn-sm" onClick={onDelete}>Delete</button>
            </>
          )}
          {!locked && (
            <button type="button" className="fd-btn fd-btn-primary fd-btn-sm" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      </div>

      {isSystem(role) ? (
        <div className="ac-banner is-info">
          {code === 'TENANT_ADMIN'
            ? 'A system role: it grants every business permission and cannot be changed. It does not open People & Access — that is the Admin switch on a person.'
            : 'A system role — what it grants is fixed.'}
        </div>
      ) : (
        <div className="ac-banner">
          Saved changes apply to everyone holding this role on their next action — within 15 seconds on another device. Nobody has to sign out.
        </div>
      )}

      <div className="ac-grid">
        <div className="ac-grid-head"><span>Permission</span>{LEVELS.map((l) => <span key={l}>{LEVEL_LABEL[l]}</span>)}</div>
        {groups.map((g) => (
          <React.Fragment key={g.rail}>
            <div className="ac-rail">{g.rail}</div>
            {g.subjects.map((s) => {
              const firstKey = LEVELS.map((l) => `${s.key}:${l}`).find((k) => s.levels[k.split(':')[1]])
              const holdsAny = LEVELS.some((l) => finalKeys.has(`${s.key}:${l}`))
              return (
                <div className="ac-grid-row" key={s.key}>
                  <span className="ac-perm">
                    <span className="ac-perm-name">{s.name} <span className="ac-code">{s.key}</span></span>
                    <span className="ac-perm-opens">{opensText(firstKey)}</span>
                    {s.note && holdsAny && <span className="ac-perm-warn">{s.note}</span>}
                  </span>
                  {LEVELS.map((l) => {
                    const key = `${s.key}:${l}`
                    if (!s.levels[l]) return <span key={l} className="ac-none" aria-hidden="true">—</span>
                    const on = finalKeys.has(key)
                    const needers = on ? requiredBy(key, [...finalKeys]) : []
                    const forced = on && !chosen.has(key)
                    return (
                      <label key={l} className="ac-cell" title={scopeLabel(key)}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={locked || forced}
                          aria-label={scopeLabel(key)}
                          onChange={() => toggle(key)}
                        />
                        {needers.length > 0 && forced && (
                          <span>needed by {needers.map((n) => neededByName(n, s.key)).join(', ')}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )
            })}
          </React.Fragment>
        ))}
        <div className="ac-grid-row ac-flag-row">
          <span className="ac-perm">
            <span className="ac-perm-name">People &amp; Access</span>
            <span className="ac-perm-opens">Opens: Admin › People &amp; Access</span>
          </span>
          <span className="ac-perm-opens" style={{ gridColumn: `span ${LEVELS.length}` }}>
            Set by the Admin switch on a person, not by a role
          </span>
        </div>
      </div>
    </section>
  )
}

export default RoleEditor
