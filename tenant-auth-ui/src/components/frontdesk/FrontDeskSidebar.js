import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { FRONT_DESK_NAV, visibleNavGroups } from '../../config/navigation'

/**
 * The Front Desk sidebar.
 *
 * Renders whatever config/navigation.js says this user may reach and decides
 * nothing itself — the same list, filtered by the same function, that produces
 * the top bar. A screen added there appears here with no change to this file.
 */
const FrontDeskSidebar = ({ isOpen, onClose }) => {
  const location = useLocation()
  const { user } = useAuth()

  const isActive = (path) => {
    if (path === '/frontdesk') return location.pathname === '/frontdesk'
    return location.pathname.startsWith(path)
  }

  const groups = visibleNavGroups(FRONT_DESK_NAV, user)

  return (
    <aside className={`frontdesk-sidebar ${isOpen ? 'mobile-open' : ''}`}>
      <div className="frontdesk-sidebar-header">
        <h2>🍴 Front Desk</h2>
      </div>

      {groups.map(({ group, items }) => (
        <div key={group}>
          <div className="fd-category-title">{group}</div>
          {items.map((item) => (
            <Link
              key={item.key || item.path}
              to={item.path}
              className={`fd-sidebar-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={onClose}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </aside>
  )
}

export default FrontDeskSidebar
