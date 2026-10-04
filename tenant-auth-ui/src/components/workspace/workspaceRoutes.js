import React from 'react'
import { Route, Navigate } from 'react-router-dom'
import { ScopeGuard } from '../Guards'
import { useAuth } from '../../context/AuthContext'
import { WORKSPACES, MOVED_PATHS, entryPathOf } from '../../config/workspaces'
import { screenFor, NESTED_SCREENS } from '../../config/workspaceScreens'
import SectionedTab, { TabBanner } from './SectionedTab'
import { LegacyRedirect } from './WorkspaceRedirects'

/** /menu/options → its first section this user may open. */
const FirstSection = ({ tab }) => {
  const { user } = useAuth()
  return <Navigate to={entryPathOf(tab, user)} replace />
}

const guarded = (scopes, element) => <ScopeGuard requiredScopes={scopes}>{element}</ScopeGuard>

/**
 * Every workspace route, generated from config/workspaces.js.
 *
 * Each tab and section is guarded by the scopes its config line names — the
 * same list that decides whether the rail and tab strip offer it — so the menu
 * and the router cannot disagree. Returned as <Route> elements for App.js to
 * place under the workspace layout.
 */
export const workspaceRoutes = () => WORKSPACES.flatMap((ws) => ws.tabs
  .filter((tab) => !tab.external)
  .flatMap((tab) => {
    const tabKey = `${ws.key}.${tab.key}`
    if (!tab.sections) {
      const screen = guarded(tab.scopes, screenFor(tabKey, tab))
      return [
        <Route
          key={tab.path}
          path={tab.path}
          element={tab.banner ? <><TabBanner name={tab.banner} />{screen}</> : screen}
        />,
        ...(NESTED_SCREENS[tabKey] || []).map((n) => (
          <Route key={`${tab.path}/${n.path}`} path={`${tab.path}/${n.path}`} element={guarded(tab.scopes, n.element)} />
        )),
      ]
    }
    return [
      <Route key={tab.path} path={tab.path} element={<SectionedTab tab={tab} />}>
        <Route index element={<FirstSection tab={tab} />} />
        {tab.sections.flatMap((s) => {
          const key = `${tabKey}.${s.key}`
          return [
            <Route key={s.key} path={s.key} element={guarded(s.scopes, screenFor(key, s))} />,
            ...(NESTED_SCREENS[key] || []).map((n) => (
              <Route key={`${s.key}/${n.path}`} path={`${s.key}/${n.path}`} element={guarded(s.scopes, n.element)} />
            )),
          ]
        })}
      </Route>,
    ]
  }))

/**
 * Redirects for old addresses that sit inside the workspace URLs (see
 * MOVED_PATHS), each with its sub-paths. `wrap` lets App.js put them behind
 * the same sign-in guard as its other legacy routes.
 */
export const movedRoutes = (wrap = (el) => el) => MOVED_PATHS.flatMap((from) => [
  <Route key={from} path={from} element={wrap(<LegacyRedirect />)} />,
  <Route key={`${from}/*`} path={`${from}/*`} element={wrap(<LegacyRedirect />)} />,
])
