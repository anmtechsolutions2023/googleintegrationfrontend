// POS CRUD module registry — same shape as config/modules.js.
// Config-CRUD screens (floors, tables, staff, customers, expenses, feedback) use
// PosCrudPage which wires FormModal + DataTable + crudService pointing at these entries.

export const POS_CATEGORIES = {
  CONFIG:     'POS Config',
  OPERATIONS: 'POS Operations',
  CRM:        'POS CRM',
}

export const POS_MODULES = {
  posFloors: {
    key: 'posFloors',
    name: 'Floors',
    endpoint: '/api/pos/floors',
    icon: '🏢',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'BranchDetailId', label: 'Branch', type: 'select', reference: 'branchDetails' },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'BranchDetailId', 'Active', 'CreatedBy', 'CreatedOn'],
    searchFields: ['Name'],
  },

  posTables: {
    key: 'posTables',
    name: 'Tables',
    endpoint: '/api/pos/tables',
    icon: '🪑',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 50 },
      { name: 'FloorId', label: 'Floor', type: 'select', reference: 'posFloors' },
      { name: 'Capacity', type: 'number', min: 1 },
      { name: 'Status', type: 'text', maxLength: 20 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'FloorId', 'Capacity', 'Status', 'Active', 'CreatedOn'],
    searchFields: ['Name', 'Status'],
  },

  posStaff: {
    key: 'posStaff',
    name: 'Staff',
    endpoint: '/api/pos/staff',
    icon: '👤',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Role', type: 'text', maxLength: 50 },
      { name: 'Phone', type: 'text', maxLength: 20 },
      { name: 'Email', type: 'email', maxLength: 100 },
      { name: 'BranchDetailId', label: 'Branch', type: 'select', reference: 'branchDetails' },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Role', 'Phone', 'Email', 'BranchDetailId', 'Active', 'CreatedOn'],
    searchFields: ['Name', 'Role', 'Email'],
  },

  posCustomers: {
    key: 'posCustomers',
    name: 'Customers',
    endpoint: '/api/pos/customers',
    icon: '👥',
    category: POS_CATEGORIES.CRM,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Phone', type: 'text', maxLength: 20 },
      { name: 'Email', type: 'email', maxLength: 100 },
      { name: 'Visits', type: 'number', min: 0 },
      { name: 'TotalSpent', label: 'Total Spent', type: 'number', min: 0, step: 0.01 },
      { name: 'LoyaltyPoints', label: 'Loyalty Points', type: 'number', min: 0 },
      { name: 'BranchDetailId', label: 'Branch', type: 'select', reference: 'branchDetails' },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Phone', 'Email', 'Visits', 'TotalSpent', 'LoyaltyPoints', 'BranchDetailId', 'Active'],
    searchFields: ['Name', 'Phone', 'Email'],
  },

  // NOTE: expenses no longer use the generic CRUD screen. They have an approval
  // lifecycle (draft → approved → settled) where Status moves through dedicated
  // endpoints, which a field-driven form cannot express — see pages/frontdesk/
  // Expenses.js. This entry remains only as the reference-data source for
  // category lookups elsewhere.

  expenseCategories: {
    key: 'expenseCategories',
    name: 'Expense Categories',
    endpoint: '/api/expense-categories',
    icon: '🏷️',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      // Which EXPENSE-kind account the spend books against.
      { name: 'AccountTypeBaseId', label: 'Account', type: 'select', reference: 'accountTypeBases' },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'AccountName', 'Active', 'CreatedOn'],
    searchFields: ['Name'],
  },

  assetCategories: {
    key: 'assetCategories',
    name: 'Asset Categories',
    endpoint: '/api/asset-categories',
    icon: '🏷️',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Active', 'CreatedOn'],
    searchFields: ['Name'],
  },

  posFeedback: {
    key: 'posFeedback',
    name: 'Feedback',
    endpoint: '/api/pos/feedback',
    icon: '⭐',
    category: POS_CATEGORIES.CRM,
    displayField: 'CustomerName',
    fields: [
      { name: 'CustomerId', label: 'Customer', type: 'select', reference: 'posCustomers' },
      { name: 'CustomerName', label: 'Customer Name', type: 'text', maxLength: 100 },
      { name: 'Rating', type: 'number', required: true, min: 1, max: 5 },
      { name: 'Comments', type: 'textarea', maxLength: 1000 },
      { name: 'BranchDetailId', label: 'Branch', type: 'select', reference: 'branchDetails' },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['CustomerId', 'CustomerName', 'Rating', 'Comments', 'BranchDetailId', 'Active', 'CreatedOn'],
    searchFields: ['CustomerName', 'Comments'],
  },

  posOnlineOrders: {
    key: 'posOnlineOrders',
    name: 'Online Orders',
    endpoint: '/api/pos/online-orders',
    icon: '🛒',
    category: POS_CATEGORIES.OPERATIONS,
    displayField: 'Platform',
    fields: [
      { name: 'Platform', type: 'text', required: true, maxLength: 50 },
      { name: 'ExternalRef', label: 'External Ref', type: 'text', maxLength: 100 },
      { name: 'Status', type: 'text', maxLength: 20 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Platform', 'ExternalRef', 'Status', 'Active', 'CreatedOn'],
    searchFields: ['Platform', 'ExternalRef', 'Status'],
  },

  posTokens: {
    key: 'posTokens',
    name: 'Tokens',
    endpoint: '/api/pos/tokens',
    icon: '🎫',
    category: POS_CATEGORIES.OPERATIONS,
    displayField: 'TokenNumber',
    fields: [
      { name: 'TokenNumber', label: 'Token Number', type: 'number', required: true },
      { name: 'Status', type: 'text', maxLength: 20 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['TokenNumber', 'OrderId', 'Status', 'Active', 'CreatedOn'],
    searchFields: ['Status'],
  },
}

export default POS_MODULES
