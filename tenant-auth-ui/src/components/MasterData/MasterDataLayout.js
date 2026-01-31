import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import './MasterData.css';

/**
 * MasterDataLayout Component
 * Main layout wrapper for all master data pages
 * Includes responsive sidebar navigation
 */
const MasterDataLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="master-layout">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <main className="master-content">
        <Outlet />
      </main>

      {/* Mobile sidebar toggle button */}
      <button
        className="mobile-sidebar-toggle"
        onClick={toggleSidebar}
        aria-label="Toggle navigation"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>
    </div>
  );
};

export default MasterDataLayout;
