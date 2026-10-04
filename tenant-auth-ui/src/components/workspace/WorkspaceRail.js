import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { visibleWorkspaces, visibleTabs, entryPathOf, workspaceOfPath } from '../../config/workspaces'

// Stroke icons, one per workspace. Inline so they take the rail's text colour.
const ICONS = {
  billing: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  service: 'M4 17h16M6 17a6 6 0 0 1 12 0M12 11V8M10 8h4',
  menu: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  outlet: 'M4 10h16l-1-5H5zM5 10v10h14V10M10 20v-5h4v5',
  money: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7l12-3v3M16 13h2',
  guests: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6',
  insights: 'M4 20V11M10 20V5M16 20v-7M2 20h20',
  org: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
}

/**
 * The left rail: one entry per workspace this user can open.
 *
 * Decides nothing itself — visibility comes from config/workspaces.js, the same
 * rules that build the routes, so the rail cannot offer what the router refuses.
 * Each entry lands on the first tab (and section) the user may open.
 *
 * A `bare` workspace (the till) is a single screen rather than a place with
 * tabs, so a rule sets it apart from the workspaces below it.
 */
const WorkspaceRail = () => {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const current = workspaceOfPath(pathname)
  const open = visibleWorkspaces(user)

  return (
    <nav className="ws-rail" aria-label="Workspaces">
      {open.map((ws, i) => {
        const active = current && current.key === ws.key
        const first = visibleTabs(ws, user)[0]
        const divide = ws.bare && open[i + 1] && !open[i + 1].bare
        return (
          <React.Fragment key={ws.key}>
            <NavLink
              to={entryPathOf(first, user)}
              className={`ws-rail-item ${active ? 'is-active' : ''}${ws.bare ? ' is-till' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={ws.hint}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICONS[ws.key]} />
              </svg>
              <span>{ws.workspace}</span>
            </NavLink>
            {divide && <span className="ws-rail-rule" aria-hidden="true" />}
          </React.Fragment>
        )
      })}
    </nav>
  )
}

export default WorkspaceRail
