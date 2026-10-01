import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { visibleTabs, entryPathOf, tabLabelOf, workspaceOfPath } from '../../config/workspaces'

/**
 * The current workspace's name and its tabs.
 *
 * A tab is active when the path is inside it, so a section (/menu/options/addons)
 * or a nested page (/guests/offers/<id>) keeps its tab lit. An `external` tab
 * (the setup wizard) is a plain link out of the workspace.
 */
const WorkspaceHeader = () => {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const ws = workspaceOfPath(pathname)
  if (!ws) return null
  const tabs = visibleTabs(ws, user)

  return (
    <header className="ws-header">
      <div className="ws-title">
        <h1>{ws.workspace}</h1>
        <span>{ws.hint}</span>
      </div>
      <nav className="ws-tabs" aria-label={`${ws.workspace} sections`}>
        {tabs.map((tab) => {
          const active = !tab.external && (pathname === tab.path || pathname.startsWith(`${tab.path}/`))
          return (
            <Link
              key={tab.key}
              to={entryPathOf(tab, user)}
              className={`ws-tab ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {tabLabelOf(tab)}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}

export default WorkspaceHeader
