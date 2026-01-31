// Module configuration - defines all CRUD modules in one place
// This enables scalable, consistent management of all data modules

export const MODULE_CATEGORIES = {
  MASTER_DATA: 'Master Data',
  INVENTORY: 'Inventory',
  TRANSACTIONS: 'Transactions',
  PAYMENTS: 'Payments',
  CONTACTS: 'Contacts & Addresses',
  ORGANIZATION: 'Organization',
};

// Module definitions with all metadata
export const MODULES = {
  // ============== MASTER DATA ==============
  taxTypes: {
    key: 'taxTypes',
    name: 'Tax Types',
    endpoint: '/api/taxtypes',
    icon: '💰',
    category: MODULE_CATEGORIES.MASTER_DATA,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      {
        name: 'Value',
        type: 'number',
        required: true,
        min: 0,
        max: 100,
        step: 0.01,
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Value', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name'],
  },

  uom: {
    key: 'uom',
    name: 'Units of Measure',
    endpoint: '/api/uom',
    icon: '📏',
    category: MODULE_CATEGORIES.MASTER_DATA,
    fields: [
      {
        name: 'UnitName',
        label: 'Unit Name',
        type: 'text',
        required: true,
        maxLength: 100,
      },
      {
        name: 'IsPrimary',
        label: 'Is Primary',
        type: 'boolean',
        default: false,
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['UnitName', 'IsPrimary', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['UnitName'],
  },

  uomFactors: {
    key: 'uomFactors',
    name: 'UOM Factors',
    endpoint: '/api/uomfactors',
    icon: '🔄',
    category: MODULE_CATEGORIES.MASTER_DATA,
    fields: [
      {
        name: 'PrimaryUOMId',
        label: 'Primary UOM',
        type: 'select',
        required: true,
        reference: 'uom',
      },
      {
        name: 'SecondaryUOMId',
        label: 'Secondary UOM',
        type: 'select',
        required: true,
        reference: 'uom',
      },
      {
        name: 'Factor',
        type: 'number',
        required: true,
        min: 0,
        step: 0.000001,
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'PrimaryUOMId',
      'SecondaryUOMId',
      'Factor',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: [],
  },

  categories: {
    key: 'categories',
    name: 'Categories',
    endpoint: '/api/categories',
    icon: '📁',
    category: MODULE_CATEGORIES.MASTER_DATA,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name'],
  },

  taxGroups: {
    key: 'taxGroups',
    name: 'Tax Groups',
    endpoint: '/api/taxgroups',
    icon: '📊',
    category: MODULE_CATEGORIES.MASTER_DATA,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name'],
  },

  taxGroupTaxTypeMappers: {
    key: 'taxGroupTaxTypeMappers',
    name: 'Tax Group Mappers',
    endpoint: '/api/taxgrouptaxtypemappers',
    icon: '🔗',
    category: MODULE_CATEGORIES.MASTER_DATA,
    fields: [
      {
        name: 'TaxGroupId',
        label: 'Tax Group',
        type: 'select',
        required: true,
        reference: 'taxGroups',
      },
      {
        name: 'TaxTypeId',
        label: 'Tax Type',
        type: 'select',
        required: true,
        reference: 'taxTypes',
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'TaxGroupId',
      'TaxTypeId',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: [],
  },

  // ============== ORGANIZATION ==============
  organizations: {
    key: 'organizations',
    name: 'Organizations',
    endpoint: '/api/organizations',
    icon: '🏛️',
    category: MODULE_CATEGORIES.ORGANIZATION,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 200 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name'],
  },

  branchDetails: {
    key: 'branchDetails',
    name: 'Branch Details',
    endpoint: '/api/branchdetails',
    icon: '🏢',
    category: MODULE_CATEGORIES.ORGANIZATION,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      {
        name: 'AddressDetailId',
        label: 'Address',
        type: 'select',
        reference: 'addressDetails',
      },
      {
        name: 'ContactDetailId',
        label: 'Contact',
        type: 'select',
        reference: 'contactDetails',
      },
      {
        name: 'OrganizationId',
        label: 'Organization',
        type: 'select',
        reference: 'organizations',
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'Name',
      'OrganizationId',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: ['Name'],
  },

  branchUserGroupMappers: {
    key: 'branchUserGroupMappers',
    name: 'Branch User Groups',
    endpoint: '/api/branchusergroupmappers',
    icon: '👥',
    category: MODULE_CATEGORIES.ORGANIZATION,
    fields: [
      {
        name: 'BranchId',
        label: 'Branch',
        type: 'select',
        required: true,
        reference: 'branchDetails',
      },
      {
        name: 'UserGroupId',
        label: 'User Group',
        type: 'text',
        required: true,
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'BranchId',
      'UserGroupId',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: [],
  },

  // ============== ACCOUNTING ==============
  accountTypes: {
    key: 'accountTypes',
    name: 'Account Types',
    endpoint: '/api/accounttypes',
    icon: '📒',
    category: MODULE_CATEGORIES.MASTER_DATA,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name'],
  },

  accountTypeBases: {
    key: 'accountTypeBases',
    name: 'Account Type Bases',
    endpoint: '/api/accounttypebases',
    icon: '📚',
    category: MODULE_CATEGORIES.MASTER_DATA,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name'],
  },

  // ============== TRANSACTIONS ==============
  transactionTypes: {
    key: 'transactionTypes',
    name: 'Transaction Types',
    endpoint: '/api/transactiontypes',
    icon: '📋',
    category: MODULE_CATEGORIES.TRANSACTIONS,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Description', type: 'textarea', maxLength: 255 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Description', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name', 'Description'],
  },

  transactionTypeConfigs: {
    key: 'transactionTypeConfigs',
    name: 'Transaction Configs',
    endpoint: '/api/transactiontypeconfigs',
    icon: '⚙️',
    category: MODULE_CATEGORIES.TRANSACTIONS,
    fields: [
      {
        name: 'StartCounterNo',
        label: 'Start Counter',
        type: 'number',
        required: true,
        min: 0,
      },
      { name: 'Prefix', type: 'text', maxLength: 50 },
      { name: 'Format', type: 'text', required: true, maxLength: 100 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'Prefix',
      'Format',
      'StartCounterNo',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: ['Prefix', 'Format'],
  },

  transactionTypeStatuses: {
    key: 'transactionTypeStatuses',
    name: 'Transaction Statuses',
    endpoint: '/api/transactiontypestatuses',
    icon: '🚦',
    category: MODULE_CATEGORIES.TRANSACTIONS,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name'],
  },

  transactionTypeBaseConversions: {
    key: 'transactionTypeBaseConversions',
    name: 'Base Conversions',
    endpoint: '/api/transactiontypebaseconversions',
    icon: '🔀',
    category: MODULE_CATEGORIES.TRANSACTIONS,
    fields: [
      {
        name: 'TransactionTypeConfigId',
        label: 'Config',
        type: 'select',
        required: true,
        reference: 'transactionTypeConfigs',
      },
      {
        name: 'FromTransactionTypeStatusId',
        label: 'From Status',
        type: 'select',
        required: true,
        reference: 'transactionTypeStatuses',
      },
      {
        name: 'ToTransactionTypeStatusId',
        label: 'To Status',
        type: 'select',
        required: true,
        reference: 'transactionTypeStatuses',
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'TransactionTypeConfigId',
      'FromTransactionTypeStatusId',
      'ToTransactionTypeStatusId',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: [],
  },

  transactionTypeConversionMappers: {
    key: 'transactionTypeConversionMappers',
    name: 'Conversion Mappers',
    endpoint: '/api/transactiontypeconversionmappers',
    icon: '🗺️',
    category: MODULE_CATEGORIES.TRANSACTIONS,
    fields: [
      {
        name: 'TransactionTypeBaseConversionId',
        label: 'Base Conversion',
        type: 'select',
        required: true,
        reference: 'transactionTypeBaseConversions',
      },
      {
        name: 'FromTransactionDetailLogId',
        label: 'From Log',
        type: 'select',
        required: true,
        reference: 'transactionDetailLogs',
      },
      {
        name: 'ToTransactionDetailLogId',
        label: 'To Log',
        type: 'select',
        required: true,
        reference: 'transactionDetailLogs',
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'TransactionTypeBaseConversionId',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: [],
  },

  transactionDetailLogs: {
    key: 'transactionDetailLogs',
    name: 'Transaction Logs',
    endpoint: '/api/transactiondetaillogs',
    icon: '📝',
    category: MODULE_CATEGORIES.TRANSACTIONS,
    fields: [
      {
        name: 'TransactionNo',
        label: 'Transaction No',
        type: 'text',
        required: true,
        maxLength: 100,
      },
      {
        name: 'TransactionTypeConfigId',
        label: 'Config',
        type: 'select',
        required: true,
        reference: 'transactionTypeConfigs',
      },
      {
        name: 'TransactionTypeStatusId',
        label: 'Status',
        type: 'select',
        reference: 'transactionTypeStatuses',
      },
      {
        name: 'BranchId',
        label: 'Branch',
        type: 'select',
        reference: 'branchDetails',
      },
      { name: 'TransactionDate', label: 'Date', type: 'date' },
      { name: 'Remarks', type: 'textarea', maxLength: 1000 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'TransactionNo',
      'TransactionDate',
      'TransactionTypeStatusId',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: ['TransactionNo', 'Remarks'],
  },

  transactionItemDetails: {
    key: 'transactionItemDetails',
    name: 'Transaction Items',
    endpoint: '/api/transactionitemdetails',
    icon: '📦',
    category: MODULE_CATEGORIES.TRANSACTIONS,
    fields: [
      {
        name: 'TransactionDetailLogId',
        label: 'Transaction Log',
        type: 'select',
        required: true,
        reference: 'transactionDetailLogs',
      },
      {
        name: 'ItemDetailId',
        label: 'Item',
        type: 'select',
        required: true,
        reference: 'itemDetails',
      },
      {
        name: 'BatchDetailId',
        label: 'Batch',
        type: 'select',
        reference: 'batchDetails',
      },
      { name: 'Quantity', type: 'number', required: true, step: 0.0001 },
      { name: 'UOMId', label: 'UOM', type: 'select', reference: 'uom' },
      { name: 'Rate', type: 'number', step: 0.0001 },
      { name: 'Amount', type: 'number', step: 0.0001 },
      {
        name: 'TaxGroupId',
        label: 'Tax Group',
        type: 'select',
        reference: 'taxGroups',
      },
      { name: 'TaxAmount', label: 'Tax Amount', type: 'number', step: 0.0001 },
      {
        name: 'DiscountAmount',
        label: 'Discount',
        type: 'number',
        step: 0.0001,
      },
      { name: 'NetAmount', label: 'Net Amount', type: 'number', step: 0.0001 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'ItemDetailId',
      'Quantity',
      'Rate',
      'Amount',
      'NetAmount',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: [],
  },

  // ============== INVENTORY ==============
  batchDetails: {
    key: 'batchDetails',
    name: 'Batch Details',
    endpoint: '/api/batchdetails',
    icon: '📦',
    category: MODULE_CATEGORIES.INVENTORY,
    fields: [
      {
        name: 'BatchNumber',
        label: 'Batch Number',
        type: 'text',
        required: true,
        maxLength: 100,
      },
      { name: 'ManufacturedDate', label: 'Manufactured Date', type: 'date' },
      { name: 'ExpiryDate', label: 'Expiry Date', type: 'date' },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'BatchNumber',
      'ManufacturedDate',
      'ExpiryDate',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: ['BatchNumber'],
  },

  itemDetails: {
    key: 'itemDetails',
    name: 'Item Details',
    endpoint: '/api/itemdetails',
    icon: '🏷️',
    category: MODULE_CATEGORIES.INVENTORY,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 255 },
      { name: 'Code', type: 'text', maxLength: 50 },
      { name: 'Description', type: 'textarea', maxLength: 1000 },
      {
        name: 'CategoryId',
        label: 'Category',
        type: 'select',
        reference: 'categories',
      },
      { name: 'UOMId', label: 'UOM', type: 'select', reference: 'uom' },
      {
        name: 'CostInfoId',
        label: 'Cost Info',
        type: 'select',
        reference: 'costInfos',
      },
      { name: 'SKU', type: 'text', maxLength: 100 },
      { name: 'Barcode', type: 'text', maxLength: 100 },
      { name: 'HSNCode', label: 'HSN Code', type: 'text', maxLength: 50 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'Name',
      'Code',
      'SKU',
      'CategoryId',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: ['Name', 'Code', 'SKU', 'Barcode'],
  },

  costInfos: {
    key: 'costInfos',
    name: 'Cost Info',
    endpoint: '/api/costinfos',
    icon: '💵',
    category: MODULE_CATEGORIES.INVENTORY,
    fields: [
      { name: 'Amount', type: 'number', required: true, step: 0.0001 },
      {
        name: 'TaxGroupId',
        label: 'Tax Group',
        type: 'select',
        reference: 'taxGroups',
      },
      {
        name: 'IsTaxIncluded',
        label: 'Tax Included',
        type: 'boolean',
        default: false,
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'Amount',
      'TaxGroupId',
      'IsTaxIncluded',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: [],
  },

  // ============== CONTACTS & ADDRESSES ==============
  contactAddressTypes: {
    key: 'contactAddressTypes',
    name: 'Address Types',
    endpoint: '/api/contactaddresstypes',
    icon: '🏠',
    category: MODULE_CATEGORIES.CONTACTS,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name'],
  },

  contactDetails: {
    key: 'contactDetails',
    name: 'Contact Details',
    endpoint: '/api/contactdetails',
    icon: '📞',
    category: MODULE_CATEGORIES.CONTACTS,
    fields: [
      {
        name: 'FirstName',
        label: 'First Name',
        type: 'text',
        required: true,
        maxLength: 100,
      },
      { name: 'LastName', label: 'Last Name', type: 'text', maxLength: 100 },
      { name: 'MobileNo', label: 'Mobile No', type: 'text', maxLength: 20 },
      { name: 'AltMobileNo', label: 'Alt Mobile', type: 'text', maxLength: 20 },
      { name: 'Landline1', label: 'Landline 1', type: 'text', maxLength: 20 },
      { name: 'LandLine2', label: 'Landline 2', type: 'text', maxLength: 20 },
      { name: 'Ext1', label: 'Ext 1', type: 'text', maxLength: 10 },
      { name: 'Ext2', label: 'Ext 2', type: 'text', maxLength: 10 },
      {
        name: 'ContactAddressTypeId',
        label: 'Address Type',
        type: 'select',
        reference: 'contactAddressTypes',
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'FirstName',
      'LastName',
      'MobileNo',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: ['FirstName', 'LastName', 'MobileNo'],
  },

  addressDetails: {
    key: 'addressDetails',
    name: 'Address Details',
    endpoint: '/api/addressdetails',
    icon: '📍',
    category: MODULE_CATEGORIES.CONTACTS,
    fields: [
      {
        name: 'AddressLine1',
        label: 'Address Line 1',
        type: 'text',
        required: true,
        maxLength: 255,
      },
      {
        name: 'AddressLine2',
        label: 'Address Line 2',
        type: 'text',
        maxLength: 255,
      },
      { name: 'City', type: 'text', maxLength: 100 },
      { name: 'State', type: 'text', maxLength: 100 },
      { name: 'Pincode', type: 'text', maxLength: 20 },
      { name: 'Landmark', type: 'text', maxLength: 255 },
      {
        name: 'ContactAddressTypeId',
        label: 'Address Type',
        type: 'select',
        reference: 'contactAddressTypes',
      },
      {
        name: 'MapProviderLocationMapperId',
        label: 'Location',
        type: 'select',
        reference: 'mapProviderLocationMappers',
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'AddressLine1',
      'City',
      'State',
      'Pincode',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: ['AddressLine1', 'City', 'State', 'Pincode'],
  },

  locationDetails: {
    key: 'locationDetails',
    name: 'Location Details',
    endpoint: '/api/locationdetails',
    icon: '🗺️',
    category: MODULE_CATEGORIES.CONTACTS,
    fields: [
      {
        name: 'Lat',
        label: 'Latitude',
        type: 'number',
        required: true,
        step: 0.00000001,
      },
      {
        name: 'Lng',
        label: 'Longitude',
        type: 'number',
        required: true,
        step: 0.00000001,
      },
      { name: 'CF1', label: 'Custom Field 1', type: 'text', maxLength: 255 },
      { name: 'CF2', label: 'Custom Field 2', type: 'text', maxLength: 255 },
      { name: 'CF3', label: 'Custom Field 3', type: 'text', maxLength: 255 },
      { name: 'CF4', label: 'Custom Field 4', type: 'text', maxLength: 255 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Lat', 'Lng', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: [],
  },

  mapProviders: {
    key: 'mapProviders',
    name: 'Map Providers',
    endpoint: '/api/mapproviders',
    icon: '🌍',
    category: MODULE_CATEGORIES.CONTACTS,
    fields: [
      {
        name: 'ProviderName',
        label: 'Provider Name',
        type: 'text',
        required: true,
        maxLength: 100,
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['ProviderName', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['ProviderName'],
  },

  mapProviderLocationMappers: {
    key: 'mapProviderLocationMappers',
    name: 'Location Mappers',
    endpoint: '/api/mapproviderlocationmappers',
    icon: '📌',
    category: MODULE_CATEGORIES.CONTACTS,
    fields: [
      {
        name: 'MapProviderId',
        label: 'Map Provider',
        type: 'select',
        required: true,
        reference: 'mapProviders',
      },
      {
        name: 'LocationDetailId',
        label: 'Location',
        type: 'select',
        required: true,
        reference: 'locationDetails',
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'MapProviderId',
      'LocationDetailId',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: [],
  },

  // ============== PAYMENTS ==============
  paymentReceivedTypes: {
    key: 'paymentReceivedTypes',
    name: 'Payment Received Types',
    endpoint: '/api/paymentreceivedtypes',
    icon: '💳',
    category: MODULE_CATEGORIES.PAYMENTS,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name'],
  },

  paymentModes: {
    key: 'paymentModes',
    name: 'Payment Modes',
    endpoint: '/api/paymentmodes',
    icon: '💸',
    category: MODULE_CATEGORIES.PAYMENTS,
    fields: [
      { name: 'Name', type: 'text', required: true, maxLength: 100 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: ['Name', 'Active', 'CreatedBy', 'UpdatedBy'],
    searchFields: ['Name'],
  },

  paymentModeTransactionDetails: {
    key: 'paymentModeTransactionDetails',
    name: 'Payment Transactions',
    endpoint: '/api/paymentmodetransactiondetails',
    icon: '🧾',
    category: MODULE_CATEGORIES.PAYMENTS,
    fields: [
      {
        name: 'PaymentModeId',
        label: 'Payment Mode',
        type: 'select',
        required: true,
        reference: 'paymentModes',
      },
      {
        name: 'TransactionDetailLogId',
        label: 'Transaction',
        type: 'select',
        required: true,
        reference: 'transactionDetailLogs',
      },
      { name: 'Amount', type: 'number', required: true, step: 0.0001 },
      {
        name: 'ReferenceNo',
        label: 'Reference No',
        type: 'text',
        maxLength: 100,
      },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'PaymentModeId',
      'Amount',
      'ReferenceNo',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: ['ReferenceNo'],
  },

  paymentDetails: {
    key: 'paymentDetails',
    name: 'Payment Details',
    endpoint: '/api/paymentdetails',
    icon: '💰',
    category: MODULE_CATEGORIES.PAYMENTS,
    fields: [
      {
        name: 'PaymentReceivedTypeId',
        label: 'Received Type',
        type: 'select',
        required: true,
        reference: 'paymentReceivedTypes',
      },
      {
        name: 'TransactionDetailLogId',
        label: 'Transaction',
        type: 'select',
        required: true,
        reference: 'transactionDetailLogs',
      },
      { name: 'Amount', type: 'number', required: true, step: 0.0001 },
      { name: 'PaymentDate', label: 'Payment Date', type: 'date' },
      {
        name: 'ReferenceNo',
        label: 'Reference No',
        type: 'text',
        maxLength: 100,
      },
      { name: 'Remarks', type: 'textarea', maxLength: 500 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'PaymentReceivedTypeId',
      'Amount',
      'PaymentDate',
      'ReferenceNo',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: ['ReferenceNo', 'Remarks'],
  },

  paymentBreakups: {
    key: 'paymentBreakups',
    name: 'Payment Breakups',
    endpoint: '/api/paymentbreakups',
    icon: '📊',
    category: MODULE_CATEGORIES.PAYMENTS,
    fields: [
      {
        name: 'PaymentDetailId',
        label: 'Payment Detail',
        type: 'select',
        required: true,
        reference: 'paymentDetails',
      },
      {
        name: 'PaymentModeId',
        label: 'Payment Mode',
        type: 'select',
        required: true,
        reference: 'paymentModes',
      },
      { name: 'Amount', type: 'number', required: true, step: 0.0001 },
      {
        name: 'ReferenceNo',
        label: 'Reference No',
        type: 'text',
        maxLength: 100,
      },
      { name: 'Remarks', type: 'textarea', maxLength: 500 },
      { name: 'Active', type: 'boolean', default: true },
    ],
    tableColumns: [
      'PaymentDetailId',
      'PaymentModeId',
      'Amount',
      'ReferenceNo',
      'Active',
      'CreatedBy',
      'UpdatedBy',
    ],
    searchFields: ['ReferenceNo', 'Remarks'],
  },
};

// Get modules by category
export const getModulesByCategory = () => {
  const grouped = {};
  Object.values(MODULES).forEach((module) => {
    if (!grouped[module.category]) {
      grouped[module.category] = [];
    }
    grouped[module.category].push(module);
  });
  return grouped;
};

// Get module by key
export const getModule = (key) => MODULES[key];

// Get all module keys
export const getModuleKeys = () => Object.keys(MODULES);

export default MODULES;
