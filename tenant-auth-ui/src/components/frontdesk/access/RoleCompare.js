import React, { useMemo, useState } from 'react'
import { roleLabel, roleCode } from '../../../utils/roleLabels'
import { keysForIds } from '../../../utils/roleAccess'
import { groupFeatures, LEVELS, LEVEL_LABEL, scopeLabel } from '../../../config/permissionCatalogue'
import './access.css'

const MAX = 4

/**
 * Roles side by side, permission by permission.
 *
 * Nothing new is stored: it reads the same grants as the editor. "Only
 * differences" hides the rows every chosen role agrees on, which is usually
 * the question — what does a Front desk manager have that a Cashier does not?
 *
 * @param {Object} props
 * @param {Array} props.roles - Roles to choose from.
 * @param {Map} props.grants - roleId → Set(featureId).
 * @param {Array} props.features
 * @param {Map} props.featuresById
 * @param {string[]} [props.initialIds]
 */
const RoleCompare = ({ roles = [], grants, features = [], featuresById, initialIds = [] }) => {
  const [ids, setIds] = useState(() => initialIds.filter((id) => roles.some((r) => r.id === id)).slice(0, MAX))
  const [onlyDiff, setOnlyDiff] = useState(true)
  const chosen = ids.map((id) => roles.find((r) => r.id === id)).filter(Boolean)
  const keysByRole = useMemo(() => new Map(chosen.map((r) => [r.id, new Set(keysForIds(grants.get(r.id), featuresById))])), [chosen, grants, featuresById])
  const groups = useMemo(() => groupFeatures(features), [features])

  const rowsFor = (subject) => LEVELS
    .filter((l) => subject.levels[l])
    .map((l) => `${subject.key}:${l}`)
    .filter((key) => {
      const holders = chosen.filter((r) => keysByRole.get(r.id).has(key)).length
      if (holders === 0) return false
      return !onlyDiff || holders < chosen.length
    })

  const allKeys = groups.flatMap((g) => g.subjects.flatMap((s) => LEVELS.filter((l) => s.levels[l]).map((l) => `${s.key}:${l}`)))
  const shared = allKeys.filter((k) => chosen.length > 0 && chosen.every((r) => keysByRole.get(r.id).has(k)))
  const none = allKeys.filter((k) => chosen.every((r) => !keysByRole.get(r.id).has(k)))

  const add = (id) => { if (id && !ids.includes(id) && ids.length < MAX) setIds([...ids, id]) }

  return (
    <div>
      <div className="ac-toolbar">
        {chosen.map((r) => (
          <button key={r.id} type="button" className="fd-btn fd-btn-outline fd-btn-sm"
                  aria-label={`Remove ${roleLabel(r)} from the comparison`}
                  onClick={() => setIds(ids.filter((x) => x !== r.id))}>
            {roleLabel(r)} &#215;
          </button>
        ))}
        {ids.length < MAX && (
          <select aria-label="Add a role to compare" value="" onChange={(e) => add(e.target.value)}>
            <option value="">+ Add role</option>
            {roles.filter((r) => !ids.includes(r.id)).map((r) => (
              <option key={r.id} value={r.id}>{roleLabel(r)} ({roleCode(r)})</option>
            ))}
          </select>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontWeight: 700, fontSize: 13 }}>
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          Only differences
        </label>
      </div>

      {chosen.length < 2 ? (
        <div className="fd-empty">Choose at least two roles to compare.</div>
      ) : (
        <>
          <div className="ac-scroll">
            <table className="ac-table">
              <thead>
                <tr>
                  <th>Permission</th>
                  {chosen.map((r) => (
                    <th key={r.id}>{roleLabel(r)}<div className="ac-code">{keysByRole.get(r.id).size} permissions</div></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const rows = g.subjects.flatMap((s) => rowsFor(s))
                  if (!rows.length) return null
                  return (
                    <React.Fragment key={g.rail}>
                      <tr className="ac-rail-row"><td colSpan={chosen.length + 1}>{g.rail}</td></tr>
                      {rows.map((key) => {
                        const holders = chosen.filter((r) => keysByRole.get(r.id).has(key)).length
                        return (
                          <tr key={key} className={holders === 1 ? 'is-unique' : ''}>
                            <td>{scopeLabel(key)} <span className="ac-code">{key}</span></td>
                            {chosen.map((r) => (
                              <td key={r.id}>{keysByRole.get(r.id).has(key)
                                ? <span className="ac-tick" aria-label="granted">&#10003;</span>
                                : <span className="ac-dot" aria-label="not granted">·</span>}</td>
                            ))}
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="ac-caption">
            {onlyDiff && <>Hidden: {shared.length} {shared.length === 1 ? 'permission' : 'permissions'} all of them hold{shared.length ? ` (${shared.map(scopeLabel).join(', ')})` : ''}, and </>}
            {none.length} that none of them hold. Shaded rows belong to one role only.
            {' '}{LEVEL_LABEL.WRITE} always includes {LEVEL_LABEL.READ}.
          </p>
        </>
      )}
    </div>
  )
}

export default RoleCompare
