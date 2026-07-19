import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'

const NAV_ITEMS = [
  // Operational tabs
  { group: 'Operations', items: [
    { path: '/frontdesk',          label: 'Dashboard',     icon: '📊', scopes: null },
    { path: '/frontdesk/billing',  label: 'Billing & KOT', icon: '🧾', scopes: [SCOPES.POS_ORDER_READ,   SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/tables',   label: 'Tables',        icon: '🪑', scopes: [SCOPES.POS_ORDER_READ,   SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/kitchen',  label: 'Kitchen (KDS)', icon: '👨‍🍳', scopes: [SCOPES.POS_KITCHEN_READ, SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/tokens',   label: 'Tokens',        icon: '🎫', scopes: [SCOPES.POS_OPS_READ,     SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/online',   label: 'Online Orders', icon: '🛒', scopes: [SCOPES.POS_OPS_READ,     SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/tracking', label: 'Live Tracking', icon: '📍', scopes: [SCOPES.POS_OPS_READ,     SCOPES.TENANT_ADMIN] },
  ]},
  // Config tabs
  { group: 'Setup', items: [
    { path: '/frontdesk/menu',       label: 'Menu Master',   icon: '🍽️', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/food-types', label: 'Food Types',    icon: '🥗', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/channels',   label: 'Channels',      icon: '📡', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/variants', label: 'Variants',      icon: '🧩', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/floors',   label: 'Floors',        icon: '🏢', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/staff',    label: 'Staff',         icon: '👤', scopes: [SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/expenses',  label: 'Expenses',       icon: '💸', scopes: [SCOPES.POS_OPS_READ,    SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/inventory', label: 'Inventory',      icon: '📦', scopes: [SCOPES.INVENTORY_READ,  SCOPES.TENANT_ADMIN] },
  ]},
  // CRM tabs
  { group: 'CRM', items: [
    { path: '/frontdesk/customers', label: 'Customers',   icon: '👥', scopes: [SCOPES.POS_CRM_READ, SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/feedback',  label: 'Feedback',    icon: '⭐', scopes: [SCOPES.POS_CRM_READ, SCOPES.TENANT_ADMIN] },
  ]},
  // Analytics & Admin
  { group: 'Analytics & Admin', items: [
    { path: '/frontdesk/reports',        label: 'Reports',        icon: '📈', scopes: [SCOPES.POS_REPORTS_READ, SCOPES.TENANT_ADMIN] },
    { path: '/frontdesk/access-control', label: 'Access Control', icon: '🔐', scopes: [SCOPES.TENANT_ADMIN] },
  ]},
]

const FrontDeskSidebar = ({ isOpen, onClose }) => {
  const location = useLocation()
  const { user } = useAuth()

  const isActive = (path) => {
    if (path === '/frontdesk') return location.pathname === '/frontdesk'
    return location.pathname.startsWith(path)
  }

  const canSee = (scopes) => {
    if (!scopes) return true
    return hasScope(user, scopes)
  }

  return (
    <aside className={`frontdesk-sidebar ${isOpen ? 'mobile-open' : ''}`}>
      <div className="frontdesk-sidebar-header">
        <h2>🍴 Front Desk</h2>
      </div>

      {NAV_ITEMS.map(({ group, items }) => {
        const visible = items.filter((item) => canSee(item.scopes))
        if (!visible.length) return null
        return (
          <div key={group}>
            <div className="fd-category-title">{group}</div>
            {visible.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`fd-sidebar-item ${isActive(item.path) ? 'active' : ''}`}
                onClick={onClose}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )
      })}
    </aside>
  )
}

export default FrontDeskSidebar
