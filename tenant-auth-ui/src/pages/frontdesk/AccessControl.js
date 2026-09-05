import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import adminService from '../../services/adminService'
import InvitePanel from '../../components/frontdesk/InvitePanel'
import TenantUsersPanel from '../../components/frontdesk/TenantUsersPanel'
import RolesPanel from '../../components/frontdesk/RolesPanel'
import TenantDirectoryPanel from '../../components/frontdesk/TenantDirectoryPanel'
import { useAuth } from '../../context/AuthContext'
import { hasScope, isSuperAdmin } from '../../utils/permissions'
import { SCOPES } from '../../constants'

const TABS = [
  { key: 'users',   label: '👥 People' },
  { key: 'invites', label: '✉️ Invitations' },
  { key: 'roles',   label: '🛡️ Roles' },
  // Spans every tenancy, so it is the one tab that is not about "this
  // tenancy" — hence super admins only, matching the API guard exactly.
  { key: 'tenants', label: '🌐 All Tenants', superAdminOnly: true },
]

/**
 * Everything about who works in this tenancy, in one place.
 *
 * Three tabs, and the distinction between them is the point:
 *   People      — everybody in this tenancy. Their details, their roles, their access.
 *   Invitations — people asked to join who have not signed in yet.
 *   Roles       — the grants you can hand out, and what each one covers.
 *
 * A super admin gets a fourth, All Tenants, which is the one tab NOT about this
 * tenancy: every tenancy on the platform and who is in each. It is read-only,
 * because role assignment is scoped to the caller's own tenancy on the server
 * and a super admin cannot switch into a tenancy they do not belong to — so a
 * cross-tenant editor would be a button that always 403s.
 *
 * This screen is the ONLY place a tenancy's people are managed. /admin/users and
 * /admin/roles redirect here: they were a second implementation over the same
 * API, built when a tenant admin could not reach /admin at all, and the two had
 * already drifted to where each could do something the other could not.
 * /admin is now the platform console — onboarding, the global feature catalogue
 * and cross-tenant views, none of which can be narrowed to one tenancy.
 *
 * There is deliberately no separate Staff tab either. Staff and users were two
 * records for one person — a rota entry with a name and a branch, and a
 * membership that could actually sign in — with nothing keeping them in step, so
 * the same human could be present in one and missing from the other. A person
 * who works here IS a member of the tenancy: one row, one place to edit it.
 */
const AccessControl = () => {
  const { user } = useAuth()
  // Managing access is a tenant-admin act. A read-only viewer still sees lists.
  const canManage = hasScope(user, [SCOPES.TENANT_ADMIN, SCOPES.TENANT_SUPER_ADMIN])
  // Cross-tenant sight is a platform authority, not a tenancy one.
  const isSuper = isSuperAdmin(user)
  const tabs = TABS.filter((t) => !t.superAdminOnly || isSuper)

  const [roles, setRoles] = useState([])
  const [branches, setBranches] = useState([])
  const [features, setFeatures] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('users')

  // The three catalogues every panel below draws on, fetched once here: roles
  // for the invite form and the people editor, branches for the staff details,
  // features for the permissions editor. Fetching them per panel could show two
  // different versions of the same list on one screen, and the permissions
  // editor would refetch the whole catalogue for every role opened.
  //
  // Branches and features are individually tolerant of failure: a tenancy with
  // no branches yet, or a viewer who may not read the feature catalogue, should
  // still get the people list rather than an error page.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [roleList, branchList, featureList] = await Promise.all([
        adminService.listRoles(),
        posService.getPosBranches().catch(() => []),
        adminService.listFeatures().catch(() => []),
      ])
      setRoles(roleList)
      setBranches(branchList)
      setFeatures(featureList)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load access data')
      setRoles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="fd-crud-page">
      <h1>🔐 Access & Staff</h1>
      <p className="fd-page-sub">
        Everyone who works in this tenancy: their details, what they may do, and
        who has been invited but has not signed in yet.
        {isSuper && ' As a super admin you can also see every other tenancy.'}
      </p>

      <div className="fd-token-toolbar">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`fd-btn ${activeTab === t.key ? 'fd-btn-primary' : 'fd-btn-outline'}`}
            aria-pressed={activeTab === t.key}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <button className="fd-btn fd-btn-outline" onClick={load} style={{ marginLeft: 'auto' }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="fd-loading">Loading access data…</div>
      ) : activeTab === 'users' ? (
        <TenantUsersPanel
          roles={roles}
          branches={branches}
          currentPhone={user?.phone}
          canWrite={canManage}
        />
      ) : activeTab === 'invites' ? (
        <InvitePanel roles={roles} branches={branches} canWrite={canManage} />
      ) : activeTab === 'tenants' ? (
        <TenantDirectoryPanel currentTenantId={user?.tid} currentPhone={user?.phone} />
      ) : (
        // Reloads the shared catalogue when a role is created, renamed or
        // deleted, so the People and Invitations tabs cannot offer a role that
        // no longer exists.
        <RolesPanel features={features} canWrite={canManage} onRolesChanged={load} />
      )}
    </div>
  )
}

export default AccessControl
