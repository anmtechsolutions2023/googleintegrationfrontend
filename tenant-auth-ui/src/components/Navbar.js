import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SCOPES, MESSAGES, STRINGS, APP_CONFIG } from '../constants';
import { ROUTES } from '../constants/routes';
import { hasScope } from '../utils/permissions';
import { toast } from 'react-toastify';
import './Navbar.css';

const Navbar = () => {
  const { user, logout, switchTenant } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    toast.info(MESSAGES.success.loggedOut);
    navigate(ROUTES.LOGIN);
  };

  const handleSwitch = async (tenantId) => {
    // Prevent switching to the one currently active
    if (user.tid === tenantId) return;

    try {
      await switchTenant(tenantId);
      setIsOpen(false);
      // Most apps redirect to dashboard on switch to refresh all component data
      navigate(ROUTES.DASHBOARD);
    } catch (err) {
      toast.error(MESSAGES.error.SWITCH_TENANT_FAILED);
    }
  };

  return (
    <nav className="navbar">
      <div className="nav-logo" onClick={() => navigate(ROUTES.DASHBOARD)}>
        {STRINGS.app.logo} {STRINGS.app.name}
      </div>

      <div className="nav-links">
        <Link to={ROUTES.DASHBOARD}>{STRINGS.nav.home}</Link>

        {hasScope(user, [
          SCOPES.REPORTS_READ,
          SCOPES.REPORTS_WRITE,
          SCOPES.TENANT_ADMIN,
        ]) && <Link to={ROUTES.REPORTS}>{STRINGS.nav.reports}</Link>}

        {hasScope(user, [SCOPES.TENANT_ADMIN]) && (
          <Link to={ROUTES.ADMIN}>{STRINGS.nav.admin}</Link>
        )}

        <Link to={ROUTES.AUDIT}>{STRINGS.nav.auditLogs}</Link>
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
                {STRINGS.labels.activeId}{' '}
                {user.tid?.substring(0, APP_CONFIG.UI.TRUNCATE_ID_LENGTH)}...
              </p>
            </div>

            {/* TENANT SWITCHER LOGIC */}
            {user.associatedTenants && user.associatedTenants.length > 1 && (
              <>
                <hr />
                <p className="switcher-label">{STRINGS.labels.switchTenant}</p>
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
                        <span>
                          {t.tenantId.substring(
                            0,
                            APP_CONFIG.UI.TRUNCATE_ID_LENGTH
                          )}
                          ...
                        </span>
                      </div>
                      {t.isAdmin && (
                        <span className="admin-badge">
                          {STRINGS.roles.admin}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            <hr />
            <button className="logout-btn" onClick={handleLogout}>
              {STRINGS.buttons.logout}
            </button>
          </div>
        )}
      </div>
      {isOpen && (
        <div className="dropdown-overlay" onClick={() => setIsOpen(false)} />
      )}
    </nav>
  );
};

export default Navbar;
