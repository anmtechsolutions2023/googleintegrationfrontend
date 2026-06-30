import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MODULES, MODULE_CATEGORIES } from '../../config/modules'
import { STRINGS } from '../../constants'
import { useAuth } from '../../context/AuthContext'
import { hasCategoryAccess } from '../../utils/permissions'
import './MasterData.css'

/**
 * Sidebar Component
 * Renders categorized navigation for all master data modules
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether sidebar is open (mobile)
 * @param {Function} props.onClose - Function to close sidebar (mobile)
 */
const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation()
  const { user } = useAuth()

  // Group modules by category
  const groupedModules = Object.entries(MODULES).reduce(
    (acc, [key, module]) => {
      const category = module.category
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push({ key, ...module })
      return acc
    },
    {},
  )

  // Get category display info
  const getCategoryInfo = (categoryKey) => {
    const categoryMap = {
      [MODULE_CATEGORIES.MASTER_DATA]: {
        title: 'Master Data',
        icon: '📋',
      },
      [MODULE_CATEGORIES.INVENTORY]: {
        title: 'Inventory',
        icon: '📦',
      },
      [MODULE_CATEGORIES.TRANSACTIONS]: {
        title: 'Transactions',
        icon: '💰',
      },
      [MODULE_CATEGORIES.PAYMENTS]: {
        title: 'Payments',
        icon: '💳',
      },
      [MODULE_CATEGORIES.CONTACTS]: {
        title: 'Contacts & Addresses',
        icon: '👥',
      },
      [MODULE_CATEGORIES.ORGANIZATION]: {
        title: 'Organization',
        icon: '🏢',
      },
    }
    return categoryMap[categoryKey] || { title: categoryKey, icon: '📁' }
  }

  // Check if module route is active
  const isActive = (moduleKey) => {
    return location.pathname === `/master/${moduleKey}`
  }

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          style={{ display: isOpen ? 'block' : 'none' }}
        />
      )}

      <aside className={`master-sidebar ${isOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <h2>📊 {STRINGS.pages.masterData.title}</h2>
        </div>

        {Object.entries(MODULE_CATEGORIES).map(([, categoryValue]) => {
          const modules = groupedModules[categoryValue]
          if (!modules || modules.length === 0) return null
          if (!hasCategoryAccess(user, categoryValue)) return null

          const categoryInfo = getCategoryInfo(categoryValue)

          return (
            <div key={categoryValue} className="sidebar-category">
              <div className="category-title">
                {categoryInfo.icon} {categoryInfo.title}
              </div>
              {modules.map((module) => (
                <Link
                  key={module.key}
                  to={`/master/${module.key}`}
                  className={`sidebar-item ${
                    isActive(module.key) ? 'active' : ''
                  }`}
                  onClick={() => {
                    if (onClose) onClose()
                    const container = document.querySelector('.master-content')
                    if (container) {
                      try {
                        container.scrollTo({ top: 0, behavior: 'auto' })
                      } catch (e) {
                        container.scrollTop = 0
                      }
                    } else {
                      try {
                        window.scrollTo({ top: 0, behavior: 'auto' })
                      } catch (e) {
                        window.scrollTop = 0
                      }
                    }
                  }}
                >
                  <span className="sidebar-item-icon">{module.icon}</span>
                  <span className="sidebar-item-text">
                    {module.label || module.name}
                  </span>
                </Link>
              ))}
            </div>
          )
        })}
      </aside>
    </>
  )
}

export default Sidebar
