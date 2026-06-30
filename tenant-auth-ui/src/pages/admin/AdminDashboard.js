import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import './Admin.css';

import AdminApprovals from './AdminApprovals';
import AdminUsers from './AdminUsers';
import AdminRoles from './AdminRoles';
import AdminFeatures from './AdminFeatures';

const NAV_ITEMS = [
  { to: 'approvals', label: 'Approvals', icon: '📋' },
  { to: 'users',     label: 'Users',     icon: '👥' },
  { to: 'roles',     label: 'Roles',     icon: '🎭' },
  { to: 'features',  label: 'Features',  icon: '⚙️' },
];

const AdminDashboard = () => (
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
        </Routes>
      </main>
    </div>
  </div>
);

export default AdminDashboard;
