import React from 'react';
import { Link } from 'react-router-dom';
import { MODULES, MODULE_CATEGORIES } from '../../config/modules';
import { STRINGS } from '../../constants';
import './MasterData.css';

/**
 * MasterDataIndex Component
 * Landing page for master data section showing all available modules
 */
const MasterDataIndex = () => {
  // Group modules by category
  const groupedModules = Object.entries(MODULES).reduce(
    (acc, [key, module]) => {
      const category = module.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push({ key, ...module });
      return acc;
    },
    {}
  );

  // Get category display info
  const getCategoryInfo = (categoryKey) => {
    const categoryMap = {
      [MODULE_CATEGORIES.MASTER_DATA]: {
        title: 'Master Data',
        description:
          'Core configuration data like tax types, units, and categories',
        icon: '📋',
        color: '#3498db',
      },
      [MODULE_CATEGORIES.INVENTORY]: {
        title: 'Inventory',
        description: 'Manage items, batches, and stock information',
        icon: '📦',
        color: '#27ae60',
      },
      [MODULE_CATEGORIES.TRANSACTIONS]: {
        title: 'Transactions',
        description: 'Transaction types, configurations, and logs',
        icon: '💰',
        color: '#f39c12',
      },
      [MODULE_CATEGORIES.PAYMENTS]: {
        title: 'Payments',
        description: 'Payment modes, transactions, and breakups',
        icon: '💳',
        color: '#9b59b6',
      },
      [MODULE_CATEGORIES.CONTACTS]: {
        title: 'Contacts & Addresses',
        description: 'Contact details, addresses, and location information',
        icon: '👥',
        color: '#e74c3c',
      },
      [MODULE_CATEGORIES.ORGANIZATION]: {
        title: 'Organization',
        description: 'Organizations, branches, and user groups',
        icon: '🏢',
        color: '#1abc9c',
      },
    };
    return (
      categoryMap[categoryKey] || {
        title: categoryKey,
        description: '',
        icon: '📁',
        color: '#95a5a6',
      }
    );
  };

  return (
    <div className="master-data-index">
      <div className="content-header">
        <h1>📊 {STRINGS.pages.masterData.title}</h1>
      </div>
      <p className="page-description">{STRINGS.pages.masterData.description}</p>

      <div className="module-categories">
        {Object.entries(MODULE_CATEGORIES).map(([, categoryValue]) => {
          const modules = groupedModules[categoryValue];
          if (!modules || modules.length === 0) return null;

          const categoryInfo = getCategoryInfo(categoryValue);

          return (
            <div key={categoryValue} className="category-section">
              <div className="category-header">
                <span
                  className="category-icon"
                  style={{ backgroundColor: `${categoryInfo.color}15` }}
                >
                  {categoryInfo.icon}
                </span>
                <div>
                  <h2>{categoryInfo.title}</h2>
                  <p>{categoryInfo.description}</p>
                </div>
              </div>

              <div className="module-grid">
                {modules.map((module) => (
                  <Link
                    key={module.key}
                    to={`/master/${module.key}`}
                    className="module-card"
                  >
                    <span className="module-icon">{module.icon}</span>
                    <div className="module-info">
                      <h3>{module.label || module.name}</h3>
                      <p>
                        Manage{' '}
                        {(module.label || module.name || '').toLowerCase()}
                      </p>
                    </div>
                    <span className="module-arrow">→</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .master-data-index {
          max-width: 1200px;
        }

        .page-description {
          color: #7f8c8d;
          font-size: 16px;
          margin-bottom: 32px;
        }

        .module-categories {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .category-section {
          background: #fff;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        }

        .category-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e1e5eb;
        }

        .category-icon {
          font-size: 28px;
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
        }

        .category-header h2 {
          margin: 0 0 4px;
          font-size: 18px;
          color: #2c3e50;
        }

        .category-header p {
          margin: 0;
          font-size: 14px;
          color: #7f8c8d;
        }

        .module-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .module-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s ease;
          border: 1px solid transparent;
        }

        .module-card:hover {
          background: #fff;
          border-color: #3498db;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(52, 152, 219, 0.15);
        }

        .module-icon {
          font-size: 24px;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .module-info {
          flex: 1;
        }

        .module-info h3 {
          margin: 0 0 2px;
          font-size: 15px;
          color: #2c3e50;
        }

        .module-info p {
          margin: 0;
          font-size: 12px;
          color: #95a5a6;
        }

        .module-arrow {
          color: #bdc3c7;
          font-size: 18px;
          transition: transform 0.2s ease;
        }

        .module-card:hover .module-arrow {
          transform: translateX(4px);
          color: #3498db;
        }

        @media (max-width: 768px) {
          .category-section {
            padding: 16px;
          }

          .category-header {
            flex-direction: column;
            text-align: center;
          }

          .module-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default MasterDataIndex;
