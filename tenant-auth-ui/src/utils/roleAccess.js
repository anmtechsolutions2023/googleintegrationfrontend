import { SCOPES } from '../constants/scopes'
import { WORKSPACES, visibleTabs, visibleSections, homePathFor, workspaceOfPath } from '../config/workspaces'
import { SCREEN_WRITE_SCOPES } from '../config/screenWriteScopes'
import { featureKey } from '../config/permissionCatalogue'
import { effectiveScopes } from '../config/permissionRules'

// What a set of permissions amounts to, worked out the way the app itself
// works it out.
//
// Role comparison, the permission matrix, "preview access as" and a person's
// access summary all answer "what can somebody with these scopes see and do?".
// The answer comes from running the REAL navigation config (workspaces.js) for
// a stand-in user — the same evaluation that draws the rail — so a preview can
// never disagree with what that person will actually be shown.

/** [{ role_id, feature_id }] → Map(roleId → Set(featureId)). */
export const grantsByRole = (rows = []) => {
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.role_id)) map.set(r.role_id, new Set())
    map.get(r.role_id).add(r.feature_id)
  }
  return map
}

/** Feature ids → "FEATURE:SCOPE" keys, skipping ids the catalogue lacks. */
export const keysForIds = (ids, featuresById) =>
  [...(ids || [])]
    .map((id) => featuresById.get(id))
    .filter(Boolean)
    .map(featureKey)
    .sort()

/** Map(featureId → feature row). */
export const indexFeatures = (features = []) =>
  new Map(features.map((f) => [f.feature_id, f]))

/** A stand-in for a signed-in member holding exactly these scopes. */
export const standInUser = (scopes) => ({
  tid: 'preview',
  onboardingStatus: 'APPROVED',
  setupCompleted: true,
  scopes,
})

const STATUS_RANK = { Edit: 0, Part: 1, View: 2 }

/**
 * "Edit" when every write scope that screen's actions need is held, "Part" when
 * some are, "View" when none are (or the screen has no actions at all).
 * Tenant admins pass every action.
 */
export const screenStatus = (path, scopes) => {
  if (scopes.includes(SCOPES.TENANT_ADMIN) || scopes.includes(SCOPES.TENANT_SUPER_ADMIN)) return 'Edit'
  const writes = SCREEN_WRITE_SCOPES[path]
  if (!writes) return 'View'
  const held = effectiveScopes(scopes)
  const have = writes.filter((s) => held.has(s)).length
  if (have === writes.length) return 'Edit'
  return have ? 'Part' : 'View'
}

/**
 * Everything a member with these scopes would see, rail by rail.
 *
 * @param {string[]} scopes
 * @returns {{ home: string|null, homeName: string|null, rails: Array<{
 *   key, name, items: Array<{ label, path, status }>, hidden: string[] }> }}
 */
export const previewAccess = (scopes = []) => {
  const user = standInUser(scopes)
  const rails = WORKSPACES.map((ws) => {
    const openTabs = new Set(visibleTabs(ws, user).map((t) => t.key))
    const items = []
    const hidden = []
    for (const tab of ws.tabs) {
      if (tab.external) continue
      const tabName = tab.tabLabel || tab.label
      if (tab.sections) {
        const open = new Set(openTabs.has(tab.key) ? visibleSections(tab, user).map((s) => s.key) : [])
        for (const s of tab.sections) {
          const label = `${tabName} › ${s.label}`
          const path = `${tab.path}/${s.key}`
          if (open.has(s.key)) items.push({ label, path, status: screenStatus(path, scopes) })
          else hidden.push(label)
        }
      } else if (openTabs.has(tab.key)) {
        items.push({ label: tabName, path: tab.path, status: screenStatus(tab.path, scopes) })
      } else {
        hidden.push(tabName)
      }
    }
    return { key: ws.key, name: ws.workspace, items, hidden }
  })
  const home = homePathFor(user)
  return { home, homeName: home ? workspaceOfPath(home)?.workspace || null : null, rails }
}

/** Counts per rail: { visible, total, editable }. */
export const railSummary = (rail) => ({
  visible: rail.items.length,
  total: rail.items.length + rail.hidden.length,
  editable: rail.items.filter((i) => i.status === 'Edit').length,
})

export const sortByStatus = (items) =>
  [...items].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
