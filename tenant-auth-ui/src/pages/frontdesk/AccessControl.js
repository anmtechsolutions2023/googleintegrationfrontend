import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'

const POS_ROLE_PREFIXES = ['POS_']

const AccessControl = () => {
  const [roles, setRoles]   = useState([])
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('roles')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rolesRes, usersRes] = await Promise.allSettled([
        posService.getAdminRoles(),
        posService.getAdminUsers(),
      ])
      const allRoles = rolesRes.status === 'fulfilled' ? rolesRes.value : []
      const allUsers = usersRes.status === 'fulfilled' ? usersRes.value : []
      // Filter to POS-related roles
      const posRoles = allRoles.filter((r) =>
        POS_ROLE_PREFIXES.some((prefix) => (r.name || r.Name || '').toUpperCase().startsWith(prefix))
      )
      setRoles(posRoles)
      setUsers(allUsers)
    } catch {
      toast.error('Failed to load access control data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const getRoleNames = (user) => {
    const roles = user.roles || user.Roles || []
    if (Array.isArray(roles)) return roles.map((r) => r.name || r.Name || r).join(', ') || '—'
    return '—'
  }

  const hasPosRole = (user) => {
    const r = getRoleNames(user)
    return POS_ROLE_PREFIXES.some((prefix) => r.toUpperCase().includes(prefix))
  }

  const posUsers = users.filter(hasPosRole)

  return (
    <div className="fd-crud-page">
      <h1>🔐 Access Control (POS)</h1>
      <p style={{ color: '#7f8c8d', fontSize: 13, marginBottom: 20 }}>
        Read-only view. Manage roles and users in the Access section.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`fd-btn ${activeTab === 'roles' ? 'fd-btn-primary' : 'fd-btn-outline'}`}
          onClick={() => setActiveTab('roles')}
        >
          POS Roles ({roles.length})
        </button>
        <button
          className={`fd-btn ${activeTab === 'users' ? 'fd-btn-primary' : 'fd-btn-outline'}`}
          onClick={() => setActiveTab('users')}
        >
          POS Users ({posUsers.length})
        </button>
        <button className="fd-btn fd-btn-outline" onClick={load} style={{ marginLeft: 'auto' }}>Refresh</button>
      </div>

      {loading ? (
        <div className="fd-loading">Loading access data...</div>
      ) : activeTab === 'roles' ? (
        roles.length === 0 ? (
          <div className="fd-empty">No POS roles found. Run the POS seed (04-pos-seed.sql) to create them.</div>
        ) : (
          <table className="fd-table">
            <thead>
              <tr><th>Role Name</th><th>Description</th><th>System Role</th><th>Active</th></tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id || r.Id}>
                  <td><strong>{r.name || r.Name}</strong></td>
                  <td>{r.description || r.Description || '—'}</td>
                  <td>{r.is_system_role || r.IsSystemRole ? 'Yes' : 'No'}</td>
                  <td>
                    <span className={`fd-badge ${(r.is_active ?? r.IsActive) ? 'fd-badge-active' : 'fd-badge-closed'}`}>
                      {(r.is_active ?? r.IsActive) ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        posUsers.length === 0 ? (
          <div className="fd-empty">No users with POS roles found.</div>
        ) : (
          <table className="fd-table">
            <thead>
              <tr><th>Email</th><th>Name</th><th>POS Roles</th><th>Status</th></tr>
            </thead>
            <tbody>
              {posUsers.map((u) => (
                <tr key={u.id || u.Id || u.email}>
                  <td>{u.email || u.Email || '—'}</td>
                  <td>{u.name || u.Name || '—'}</td>
                  <td>{getRoleNames(u)}</td>
                  <td>
                    <span className={`fd-badge ${u.onboardingStatus === 'APPROVED' || u.status === 'active' ? 'fd-badge-active' : 'fd-badge-pending'}`}>
                      {u.onboardingStatus || u.status || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

export default AccessControl
