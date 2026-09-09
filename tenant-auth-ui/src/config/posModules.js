// POS CRUD module registry — same shape as config/modules.js.
// Config-CRUD screens (floors, tables, customers, expenses, feedback) use
// PosCrudPage which wires FormModal + DataTable + crudService pointing at these entries.

export const POS_CATEGORIES = {
  CONFIG:     'POS Config',
  OPERATIONS: 'POS Operations',
  CRM:        'POS CRM',
}

// Branches, read through the POS-scoped endpoint rather than /api/branchdetails.
//
// Reference dropdowns resolve through crudService, which looks the key up in
// MODULES then POS_MODULES and calls that entry's endpoint. Pointed at
// branchDetails, every POS screen with a branch picker needed ORGANIZATION:READ
// — which is why POS roles used to be handed it wholesale, and why the pickers
// silently came up empty when they were not. /api/pos/branches returns the same
// list to any POS read scope, and the pages that fetch branches directly
// (Billing, Expenses, Assets, Finance, Cash Sessions, POS Settings) already use
// it.
//
// Not a screen: there is no route for it. It exists to be referenced.
export const POS_BRANCH_REFERENCE = {
  key: 'posBranches',
  name: 'Branches',
  endpoint: '/api/pos/branches',
  icon: '🏢',
  category: POS_CATEGORIES.CONFIG,
  displayField: 'BranchName',
  fields: [],
  tableColumns: ['BranchName'],
  searchFields: ['BranchName'],
}

// Portals, as a reference source for any select that points at one. Not a
// screen: /frontdesk/portals is hand-built because a portal owns a store-mapping
// table and a write-only credential set, which a field-driven form cannot express.
export const POS_PORTAL_REFERENCE = {
  key: 'posPortals',
  name: 'Portals',
  endpoint: '/api/pos/portals',
  icon: '🔀',
  category: POS_CATEGORIES.CONFIG,
  displayField: 'Name',
  fields: [],
  tableColumns: ['Name', 'Code'],
  searchFields: ['Name', 'Code'],
}

export const POS_MODULES = {
  posBranches: POS_BRANCH_REFERENCE,
  posPortals: POS_PORTAL_REFERENCE,

  posFloors: {
    key: 'posFloors',
    name: 'Floors',
    endpoint: '/api/pos/floors',
    icon: '🏢',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'BranchDetailId', label: 'Branch', type: 'select', reference: 'posBranches' },
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
      { name: 'BranchDetailId', label: 'Branch', type: 'select', reference: 'posBranches' },
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
      { name: 'BranchDetailId', label: 'Branch', type: 'select', reference: 'posBranches' },
      { name: 'Active', type: 'boolean', default: true },
    ],
    // OrderNo rather than OrderId: the list answers "which visit was this
    // about?", and a uuid answers nothing. It is joined server-side, and is
    // read-only here because feedback is attached to an order at the moment it
    // is given, not re-pointed at a different meal afterwards.
    tableColumns: ['CustomerName', 'Rating', 'Comments', 'OrderNo', 'TableName', 'TokenLabel', 'CreatedOn'],
    searchFields: ['CustomerName', 'Comments', 'OrderNo'],
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

  // ── Portal menu masters ────────────────────────────────────────────────────
  // What a dish IS beyond its price, and why an order was refused. All five are
  // both screens AND reference sources: posAddonGroups feeds the add-on form's
  // group select, and posMeatTypes will feed the Menu Master form.

  posMeatTypes: {
    key: 'posMeatTypes',
    name: 'Meat Types',
    endpoint: '/api/pos/meat-types',
    icon: '🍗',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Code', type: 'text', required: true, maxLength: 50 },
      { name: 'Description', type: 'textarea', maxLength: 255 },
      { name: 'SortOrder', label: 'Sort Order', type: 'number', default: 0 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Code', 'Description', 'SortOrder', 'Active', 'CreatedBy', 'CreatedOn'],
    searchFields: ['Name', 'Code'],
  },

  posMenuTags: {
    key: 'posMenuTags',
    name: 'Menu Tags',
    endpoint: '/api/pos/menu-tags',
    icon: '🏷️',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Code', type: 'text', required: true, maxLength: 50 },
      // Inline options rather than a reference: the three types are a closed
      // vocabulary the column is validated against, not tenant data.
      {
        name: 'TagType',
        label: 'Tag Type',
        type: 'select',
        required: true,
        default: 'CATEGORY',
        options: [
          { value: 'CATEGORY', label: 'Category' },
          { value: 'BEVERAGE', label: 'Beverage' },
          { value: 'CUISINE', label: 'Cuisine' },
        ],
      },
      { name: 'SortOrder', label: 'Sort Order', type: 'number', default: 0 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Code', 'TagType', 'SortOrder', 'Active', 'CreatedBy', 'CreatedOn'],
    searchFields: ['Name', 'Code', 'TagType'],
  },

  posAddonGroups: {
    key: 'posAddonGroups',
    name: 'Add-on Groups',
    endpoint: '/api/pos/addon-groups',
    icon: '🧩',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Code', type: 'text', required: true, maxLength: 50 },
      { name: 'Description', type: 'textarea', maxLength: 255 },
      // Min above 0 makes the group mandatory. The server refuses Min > Max
      // with a 400 — the pair is what a portal validates an order line against.
      { name: 'MinSelection', label: 'Min Selection', type: 'number', min: 0, default: 0 },
      { name: 'MaxSelection', label: 'Max Selection', type: 'number', min: 1, default: 1 },
      { name: 'SortOrder', label: 'Sort Order', type: 'number', default: 0 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Code', 'MinSelection', 'MaxSelection', 'AddonCount', 'SortOrder', 'Active', 'CreatedOn'],
    searchFields: ['Name', 'Code'],
  },

  posAddons: {
    key: 'posAddons',
    name: 'Add-ons',
    endpoint: '/api/pos/addons',
    icon: '➕',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'AddonGroupId', label: 'Add-on Group', type: 'select', required: true, reference: 'posAddonGroups' },
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Code', type: 'text', required: true, maxLength: 50 },
      // Zero is valid and common — "no onions" costs nothing but is still a
      // choice the kitchen has to be told about.
      { name: 'Price', type: 'number', min: 0, step: 0.01, default: 0 },
      // Dietary tag on the add-on ITSELF: a veg dish with a chicken topping is
      // not a veg order, and this is the only field that can say so.
      { name: 'FoodTypeId', label: 'Food Type', type: 'select', reference: 'posFoodType' },
      { name: 'SortOrder', label: 'Sort Order', type: 'number', default: 0 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    // Names, not ids: the server joins them, and a uuid answers nothing.
    tableColumns: ['Name', 'Code', 'AddonGroupName', 'Price', 'FoodTypeName', 'SortOrder', 'Active', 'CreatedOn'],
    searchFields: ['Name', 'Code'],
  },

  posRejectionReasons: {
    key: 'posRejectionReasons',
    name: 'Rejection Reasons',
    endpoint: '/api/pos/rejection-reasons',
    icon: '🚫',
    category: POS_CATEGORIES.CONFIG,
    displayField: 'Name',
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Code', type: 'text', required: true, maxLength: 50 },
      // Left blank until certification maps it. Inventing a value would push
      // something a live portal API rejects on the first refusal.
      { name: 'ExternalCode', label: 'Portal Code', type: 'text', maxLength: 50 },
      // Blank = a house reason, offered on every portal.
      { name: 'PortalId', label: 'Portal (blank = all)', type: 'select', reference: 'posPortals' },
      { name: 'RequiresItems', label: 'Must Name Items', type: 'boolean', default: false },
      { name: 'Description', type: 'textarea', maxLength: 255 },
      { name: 'SortOrder', label: 'Sort Order', type: 'number', default: 0 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Code', 'ExternalCode', 'PortalName', 'RequiresItems', 'SortOrder', 'Active', 'CreatedOn'],
    searchFields: ['Name', 'Code', 'ExternalCode'],
  },
}

export default POS_MODULES
