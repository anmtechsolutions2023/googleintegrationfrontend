import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SCOPES, MESSAGES, STRINGS, APP_CONFIG } from '../constants';
import { ROUTES } from '../constants/routes';
import { hasScope, isSetupPending, canRunSetupWizard } from '../utils/permissions';
import { toast } from 'react-toastify';
import './Navbar.css';

const Navbar = () => {
  const { user, logout, switchTenant } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  if (!user) return null;

  const isGuest = !user.tid || user.onboardingStatus !== 'APPROVED';
  // Tenant has not finished the first-time wizard: collapse the menu to the only
  // destinations the route guards and the API will actually allow.
  const setupPending = isSetupPending(user);
  // The wizard entry point disappears for good once setup is done.
  const showSetupWizard = canRunSetupWizard(user);

  const handleLogout = () => {
    logout();
    toast.info(MESSAGES.success.loggedOut);
    navigate(ROUTES.LOGIN);
  };

  const handleSwitch = async (tenantId) => {
    if (user.tid === tenantId) return;
    try {
      await switchTenant(tenantId);
      setIsProfileOpen(false);
      navigate(ROUTES.DASHBOARD);
    } catch {
      toast.error(MESSAGES.error.SWITCH_TENANT_FAILED);
    }
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  // Single source for both the desktop bar and the mobile drawer — they used to
  // be duplicated, which is exactly the kind of drift the setup gate cannot
  // afford (a link left visible in one menu is a way around the gate).
  //
  // While setup is pending only Home and Audit Logs survive; the wizard has its
  // own always-visible entry below, and Logout lives in the profile dropdown.
  const renderNavLinks = (onClick) => (
    <>
      <Link to={ROUTES.DASHBOARD} onClick={onClick}>{STRINGS.nav.home}</Link>

      {!setupPending && (
        <Link to={ROUTES.MASTER} onClick={onClick}>{STRINGS.nav.masterData}</Link>
      )}

      {showSetupWizard && (
        <Link to={ROUTES.MASTER_SETUP} onClick={onClick}>{STRINGS.nav.masterSetup}</Link>
      )}

      {!setupPending &&
        hasScope(user, [SCOPES.REPORTS_READ, SCOPES.REPORTS_WRITE, SCOPES.TENANT_ADMIN]) && (
        <Link to={ROUTES.REPORTS} onClick={onClick}>{STRINGS.nav.reports}</Link>
      )}

      {!setupPending && hasScope(user, [SCOPES.ADMIN_ACCESS]) && (
        <Link to={ROUTES.ADMIN} onClick={onClick}>{STRINGS.nav.access}</Link>
      )}

      {!setupPending &&
        hasScope(user, [
          SCOPES.POS_ORDER_READ, SCOPES.POS_CONFIG_READ, SCOPES.POS_KITCHEN_READ,
          SCOPES.POS_BILLING_READ, SCOPES.POS_CRM_READ, SCOPES.POS_OPS_READ,
          SCOPES.POS_REPORTS_READ, SCOPES.TENANT_ADMIN,
        ]) && (
        <Link to={ROUTES.FRONTDESK} onClick={onClick}>{STRINGS.nav.frontDesk}</Link>
      )}

      {hasScope(user, [SCOPES.AUDIT_READ, SCOPES.ADMIN_ACCESS]) && (
        <Link to={ROUTES.AUDIT} onClick={onClick}>{STRINGS.nav.auditLogs}</Link>
      )}
    </>
  );

  return (
    <nav className="navbar">
      <div className="nav-logo" onClick={() => navigate(isGuest ? ROUTES.ONBOARDING : ROUTES.DASHBOARD)}>
        {STRINGS.app.logo} {STRINGS.app.name}
      </div>

      {/* Desktop nav links — hidden for guests */}
      {!isGuest && <div className="nav-links">{renderNavLinks()}</div>}

      {/* Mobile hamburger — only for provisioned users */}
      {!isGuest && (
        <button
          className="hamburger"
          aria-label="Toggle navigation"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <span className={`ham-line ${isMobileMenuOpen ? 'open' : ''}`} />
          <span className={`ham-line ${isMobileMenuOpen ? 'open' : ''}`} />
          <span className={`ham-line ${isMobileMenuOpen ? 'open' : ''}`} />
        </button>
      )}

      {/* Guest label */}
      {isGuest && (
        <span className="guest-badge">Pending Access</span>
      )}

      {/* Explains the collapsed menu — otherwise the missing entries just look
          like a bug. */}
      {!isGuest && setupPending && (
        <span className="setup-badge">Setup Required</span>
      )}

      <div className="profile-zone">
        <div className="avatar" onClick={() => setIsProfileOpen(!isProfileOpen)}>
          {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
        </div>

        {isProfileOpen && (
          <div className="dropdown">
            <div className="dropdown-header">
              <p><strong>{user.name}</strong></p>
              <p className="user-email">{user.email}</p>
              {!isGuest && (
                <p className="tid-label">
                  {STRINGS.labels.activeId}{' '}
                  {user.tid?.substring(0, APP_CONFIG.UI.TRUNCATE_ID_LENGTH)}...
                </p>
              )}
              {isGuest && (
                <p className="guest-status-label">Status: Pending Approval</p>
              )}
            </div>

            {!isGuest && setupPending && (
              <p className="guest-status-label">Status: Setup incomplete</p>
            )}

            {/* Tenant switcher — approved users with multiple tenants only.
                Hidden mid-setup: switching away from a half-configured tenant is
                confusing, and the target may itself be unconfigured. */}
            {!isGuest && !setupPending && user.associatedTenants && user.associatedTenants.length > 1 && (
              <>
                <hr />
                <p className="switcher-label">{STRINGS.labels.switchTenant}</p>
                <div className="switcher-scroll-container">
                  {user.associatedTenants.map((t) => (
                    <div
                      key={t.tenantId}
                      className={`tenant-item ${user.tid === t.tenantId ? 'active' : ''}`}
                      onClick={() => handleSwitch(t.tenantId)}
                    >
                      <div className="tenant-info">
                        <span className="status-dot" />
                        <span>{t.tenantId.substring(0, APP_CONFIG.UI.TRUNCATE_ID_LENGTH)}...</span>
                      </div>
                      {t.isAdmin && <span className="admin-badge">{STRINGS.roles.admin}</span>}
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

      {isProfileOpen && (
        <div className="dropdown-overlay" onClick={() => setIsProfileOpen(false)} />
      )}

      {/* Mobile slide-down menu */}
      {isMobileMenuOpen && !isGuest && (
        <div className="mobile-menu">{renderNavLinks(closeMobileMenu)}</div>
      )}
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={closeMobileMenu} />
      )}
    </nav>
  );
};

export default Navbar;
