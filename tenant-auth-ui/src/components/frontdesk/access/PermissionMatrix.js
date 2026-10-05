import React, { useMemo } from 'react'
import { roleLabel, roleCode } from '../../../utils/roleLabels'
import { keysForIds } from '../../../utils/roleAccess'
import { groupFeatures, LEVELS, scopeLabel } from '../../../config/permissionCatalogue'
import './access.css'

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`

/**
 * Every role against every permission, grouped by the rail — the whole access
 * model of the tenancy on one screen, and as a CSV for anybody who has to sign
 * it off.
 *
 * @param {Object} props
 * @param {Array} props.roles
 * @param {Map} props.grants - roleId → Set(featureId).
 * @param {Array} props.features
 * @param {Map} props.featuresById
 */
const PermissionMatrix = ({ roles = [], grants, features = [], featuresById }) => {
  const groups = useMemo(() => groupFeatures(features), [features])
  const keysByRole = useMemo(
    () => new Map(roles.map((r) => [r.id, new Set(keysForIds(grants.get(r.id), featuresById))])),
    [roles, grants, featuresById],
  )
  const rows = groups.flatMap((g) => g.subjects.flatMap((s) => LEVELS.filter((l) => s.levels[l]).map((l) => ({ rail: g.rail, key: `${s.key}:${l}` }))))

  const exportCsv = () => {
    const head = ['Rail', 'Permission', 'Key', ...roles.map((r) => `${roleLabel(r)} (${roleCode(r)})`)]
    const body = rows.map(({ rail, key }) => [rail, scopeLabel(key), key, ...roles.map((r) => (keysByRole.get(r.id).has(key) ? 'yes' : ''))])
    const csv = [head, ...body].map((line) => line.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'permission-matrix.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="ac-toolbar">
        <span className="ac-caption" style={{ margin: 0 }}>
          {roles.length} roles × {rows.length} permissions. People &amp; Access is not a permission: it is the Admin switch on a person.
        </span>
        <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" style={{ marginLeft: 'auto' }} onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <div className="ac-scroll">
        <table className="ac-table">
          <thead>
            <tr>
              <th>Permission</th>
              {roles.map((r) => (
                <th key={r.id}>{roleLabel(r)}<div className="ac-code">{keysByRole.get(r.id).size}</div></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g.rail}>
                <tr className="ac-rail-row"><td colSpan={roles.length + 1}>{g.rail}</td></tr>
                {rows.filter((row) => row.rail === g.rail).map(({ key }) => (
                  <tr key={key}>
                    <td>{scopeLabel(key)}</td>
                    {roles.map((r) => (
                      <td key={r.id}>{keysByRole.get(r.id).has(key)
                        ? <span className="ac-tick" aria-label={`${roleLabel(r)} has ${scopeLabel(key)}`}>&#10003;</span>
                        : <span className="ac-dot" aria-hidden="true">·</span>}</td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PermissionMatrix
