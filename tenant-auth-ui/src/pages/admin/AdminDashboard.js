import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import './Admin.css';

import AdminApprovals from './AdminApprovals';
import AdminAllUsers from './AdminAllUsers';
import AdminFeatures from './AdminFeatures';
import AdminAppConfig from './AdminAppConfig';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import { visibleAdminTabs } from '../../config/navigation';

/**
 * The platform console.
 *
 * Everything here crosses tenancy boundaries or has none at all: the onboarding
 * queue carries no tenant_id until a request is approved, the feature catalogue
 * is global, All Users spans tenancies, App Config is system-wide. That is the
 * line — a tenancy's own people, invitations and roles live on Front Desk at
 * /frontdesk/access-control, and the old Users and Roles tabs redirect there.
 *
 * Which tabs render is decided by config/navigation.js.
 */
const AdminDashboard = () => {
  const { user } = useAuth();
  const NAV_ITEMS = visibleAdminTabs(user);

  return (
  <div className="admin-shell">
    {/* Sidebar — visible on desktop only */}
    <aside className="admin-sidebar">
      <p className="sidebar-title">Access Management</p>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-link${isActive ? ' active' : ''}`
            }
          >
            <span className="sidebar-icon">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>

    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar — visible on mobile/tablet only */}
      <div className="admin-tab-bar">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `tab-link${isActive ? ' active' : ''}`
            }
          >
            <span className="tab-icon">{icon}</span>
            {label}
          </NavLink>
        ))}
      </div>

      {/* Page content */}
      <main className="admin-content">
        <Routes>
          <Route index element={<Navigate to={NAV_ITEMS[0]?.to || 'approvals'} replace />} />
          <Route path="approvals"  element={<AdminApprovals />} />
          <Route path="features"   element={<AdminFeatures />} />
          <Route path="all-users"  element={<AdminAllUsers />} />
          <Route path="app-config" element={<AdminAppConfig />} />
          {/* Belt and braces for the redirects in App.js: reaching these
              through a nested link must never render an empty console. */}
          <Route path="users" element={<Navigate to={ROUTES.ACCESS_CONTROL} replace />} />
          <Route path="roles" element={<Navigate to={ROUTES.ACCESS_CONTROL} replace />} />
        </Routes>
      </main>
    </div>
  </div>
  );
};

export default AdminDashboard;
