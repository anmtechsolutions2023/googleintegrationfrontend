import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { toast } from 'react-toastify'
import './Navbar.css'

const Navbar = () => {
  const { user, logout, switchTenant } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()

  if (!user) return null

  const hasScope = (requiredScopes) => {
    return requiredScopes.some((scope) => user.scopes?.includes(scope))
  }

  const handleLogout = () => {
    logout()
    toast.info('Logged out successfully')
    navigate('/login')
  }

  const handleSwitch = async (tenantId) => {
    // Prevent switching to the one currently active
    if (user.tid === tenantId) return

    try {
      await switchTenant(tenantId)
      setIsOpen(false)
      // Most apps redirect to dashboard on switch to refresh all component data
      navigate('/dashboard')
    } catch (err) {
      toast.error('Failed to switch tenant')
    }
  }

  return (
    <nav className="navbar">
      <div className="nav-logo" onClick={() => navigate('/dashboard')}>
        🏢 TenantPortal
      </div>

      <div className="nav-links">
        <Link to="/dashboard">Home</Link>

        {hasScope(['reports:READ', 'reports:WRITE', 'TENANT:ADMIN']) && (
          <Link to="/reports">Reports</Link>
        )}

        {hasScope(['TENANT:ADMIN']) && <Link to="/admin">Admin</Link>}

        <Link to="/audit">Audit Logs</Link>
      </div>

      <div className="profile-zone">
        <div className="avatar" onClick={() => setIsOpen(!isOpen)}>
          {user.name ? user.name.charAt(0) : 'U'}
        </div>

        {isOpen && (
          <div className="dropdown">
            <div className="dropdown-header">
              <p>
                <strong>{user.name}</strong>
              </p>
              <p className="user-email">{user.email}</p>
              <p className="tid-label">
                Active ID: {user.tid?.substring(0, 8)}...
              </p>
            </div>

            {/* TENANT SWITCHER LOGIC */}
            {user.associatedTenants && user.associatedTenants.length > 1 && (
              <>
                <hr />
                <p className="switcher-label">Switch Tenant</p>
                <div className="switcher-scroll-container">
                  {user.associatedTenants.map((t) => (
                    <div
                      key={t.tenantId}
                      className={`tenant-item ${
                        user.tid === t.tenantId ? 'active' : ''
                      }`}
                      onClick={() => handleSwitch(t.tenantId)}
                    >
                      <div className="tenant-info">
                        <span className="status-dot"></span>
                        <span>{t.tenantId.substring(0, 8)}...</span>
                      </div>
                      {t.isAdmin && <span className="admin-badge">Admin</span>}
                    </div>
                  ))}
                </div>
              </>
            )}

            <hr />
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
      {isOpen && (
        <div className="dropdown-overlay" onClick={() => setIsOpen(false)} />
      )}
    </nav>
  )
}

export default Navbar
