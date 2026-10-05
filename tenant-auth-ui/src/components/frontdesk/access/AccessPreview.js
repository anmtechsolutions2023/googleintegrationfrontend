import React, { useMemo } from 'react'
import { previewAccess, railSummary, sortByStatus } from '../../../utils/roleAccess'
import './access.css'

const STATUS = {
  Edit: { label: 'Can change', cls: 'is-edit' },
  Part: { label: 'Some actions', cls: 'is-part' },
  View: { label: 'View only', cls: 'is-view' },
}

/**
 * What somebody holding these scopes would see and be able to change, rail by
 * rail — worked out by the same navigation config that draws the real rail, so
 * it cannot disagree with it.
 *
 * Used for "Preview access as <role>" and, inside a person's access summary,
 * for "if the Admin switch were turned off".
 *
 * @param {Object} props
 * @param {string[]} props.scopes
 * @param {boolean} [props.compact] - Counts per rail only, no screen lists.
 */
const AccessPreview = ({ scopes = [], compact = false }) => {
  const { home, homeName, rails } = useMemo(() => previewAccess(scopes), [scopes])
  const open = rails.filter((r) => r.items.length > 0)

  if (compact) {
    return (
      <div className="ac-split" style={{ gap: '6px 18px' }}>
        {rails.map((r) => {
          const n = railSummary(r)
          return (
            <div key={r.key} className="ac-card-row">
              <strong style={{ color: n.visible ? undefined : '#94A3B8' }}>{r.name}</strong>
              <span style={{ color: n.visible ? undefined : '#94A3B8' }}>
                {n.visible ? `${n.visible} screen${n.visible === 1 ? '' : 's'} · ${n.editable} can change` : 'hidden'}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="ac-preview">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <nav className="ac-mini-rail" aria-label="The rail they would see">
          {open.length === 0 && <span>No rail at all</span>}
          {open.map((r) => <span key={r.key} className={r.name === homeName ? 'is-home' : ''}>{r.name}</span>)}
        </nav>
        <span className="ac-caption" style={{ margin: 0 }}>
          <strong>Lands on</strong> {home ? homeName : 'nowhere — no screen is open to them'}
        </span>
        <span className="ac-caption" style={{ margin: 0 }}>
          {Object.values(STATUS).map((s) => (
            <span key={s.label} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span className={`ac-chip ${s.cls}`}>{s.label}</span>
            </span>
          ))}
        </span>
      </div>
      <div className="ac-cards">
        {rails.map((r) => {
          const n = railSummary(r)
          return (
            <section key={r.key} className="ac-card" aria-label={r.name}>
              <div className="ac-card-head">
                <strong>{r.name}</strong>
                <span className="ac-code">{n.visible ? `${n.visible} of ${n.total}` : 'hidden'}</span>
              </div>
              {sortByStatus(r.items).map((i) => (
                <div key={i.path} className="ac-card-row">
                  <span>{i.label}</span>
                  <span className={`ac-chip ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
                </div>
              ))}
              {r.hidden.length > 0 && <span className="ac-hidden">Hidden: {r.hidden.join(', ')}</span>}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default AccessPreview
