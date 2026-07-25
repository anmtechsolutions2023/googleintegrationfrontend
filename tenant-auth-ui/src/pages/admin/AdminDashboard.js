import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import './Admin.css';

import AdminApprovals from './AdminApprovals';
import AdminUsers from './AdminUsers';
import AdminAllUsers from './AdminAllUsers';
import AdminRoles from './AdminRoles';
import AdminFeatures from './AdminFeatures';
import AdminAppConfig from './AdminAppConfig';
import { useAuth } from '../../context/AuthContext';
import { hasScope } from '../../utils/permissions';
import { SCOPES } from '../../constants';

const BASE_NAV_ITEMS = [
  { to: 'approvals', label: 'Approvals', icon: '📋' },
  { to: 'users',     label: 'Users',     icon: '👥' },
  { to: 'roles',     label: 'Roles',     icon: '🎭' },
  { to: 'features',  label: 'Features',  icon: '⚙️' },
];

// Cross-tenant "All Users" and system-wide App Config are super-admin only.
const ALL_USERS_NAV = { to: 'all-users', label: 'All Users', icon: '🌐' };
const APP_CONFIG_NAV = { to: 'app-config', label: 'App Config', icon: '🛠️' };

const AdminDashboard = () => {
  const { user } = useAuth();
  const isSuperAdmin = hasScope(user, [SCOPES.TENANT_SUPER_ADMIN]);
  const NAV_ITEMS = isSuperAdmin
    ? [...BASE_NAV_ITEMS, ALL_USERS_NAV, APP_CONFIG_NAV]
    : BASE_NAV_ITEMS;

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
          <Route index element={<Navigate to="approvals" replace />} />
          <Route path="approvals" element={<AdminApprovals />} />
          <Route path="users"     element={<AdminUsers />} />
          <Route path="roles"     element={<AdminRoles />} />
          <Route path="features"  element={<AdminFeatures />} />
          {isSuperAdmin && (
            <Route path="all-users" element={<AdminAllUsers />} />
          )}
          {isSuperAdmin && (
            <Route path="app-config" element={<AdminAppConfig />} />
          )}
        </Routes>
      </main>
    </div>
  </div>
  );
};

export default AdminDashboard;
