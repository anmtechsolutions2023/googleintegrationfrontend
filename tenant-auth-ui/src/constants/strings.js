// Centralized UI strings - organized by page/component for scalability
// This file should contain ALL user-facing text in the application
// Organized hierarchically for easy maintenance as app grows

const STRINGS = {
  // Application-wide strings
  app: {
    name: 'TenantPortal',
    logo: '🏢',
    tagline: 'Manage your tenant resources',
  },

  // Navigation strings
  nav: {
    home: 'Home',
    dashboard: 'Dashboard',
    reports: 'Reports',
    auditLogs: 'Audit Logs',
    admin: 'Admin',
    settings: 'Settings',
    profile: 'Profile',
    masterData: 'Master Data',
    // Add more nav items as needed
  },

  // Common button labels
  buttons: {
    login: 'Login',
    logout: 'Logout',
    save: 'Save',
    cancel: 'Cancel',
    submit: 'Submit',
    delete: 'Delete',
    edit: 'Edit',
    refresh: 'Refresh',
    goToDashboard: 'Go to Dashboard',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    close: 'Close',
    confirm: 'Confirm',
    retry: 'Retry',
    search: 'Search',
    add: 'Add',
    create: 'Create',
    update: 'Update',
    view: 'View',
  },

  // Common labels
  labels: {
    email: 'Email:',
    name: 'Name:',
    status: 'Status:',
    date: 'Date:',
    action: 'Action:',
    activeTenantId: 'Active Tenant ID:',
    assignedScopes: 'Your Assigned Scopes:',
    activeId: 'Active ID:',
    switchTenant: 'Switch Tenant',
  },

  // Status labels
  status: {
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
    success: 'Success',
    denied: 'Denied',
    failed: 'Failed',
    loading: 'Loading...',
  },

  // Role labels
  roles: {
    admin: 'Admin',
    user: 'User',
    superAdmin: 'Super Admin',
  },

  // Placeholder texts
  placeholders: {
    search: 'Search...',
    searchByEmailOrAction: 'Search by email or action...',
    selectOption: 'Select an option',
    enterEmail: 'Enter email address',
    enterName: 'Enter name',
  },

  // Filter/Sort options
  filters: {
    allStatuses: 'All Statuses',
    success: 'Success',
    denied: 'Denied',
    newestFirst: 'Newest First',
    oldestFirst: 'Oldest First',
  },

  // Page-specific strings - organized by page
  pages: {
    login: {
      title: 'Corporate Login',
      subtitle: 'Sign in to manage your tenant resources.',
    },

    dashboard: {
      title: 'Dashboard',
      welcome: 'Welcome,',
      defaultUserName: 'User',
      noScopes: 'No scopes assigned to this user.',
    },

    admin: {
      title: 'Tenant Admin Settings',
      description: 'This data is only visible to users with',
      scopeLabel: 'scope.',
    },

    reports: {
      title: 'Analytics & Reports',
      description:
        'This section is restricted to users with Report access scopes.',
      noReports: 'No reports found for this tenant.',
    },

    auditLogs: {
      title: 'Security Audit Logs',
      noLogs: 'No audit logs available.',
    },

    forbidden: {
      errorCode: '403',
      title: 'Access Denied',
      message: 'You do not have the required permissions for this feature.',
    },

    notFound: {
      errorCode: '404',
      title: 'Page Not Found',
      message: 'The page you are looking for does not exist.',
      backButton: 'Go to Dashboard',
    },

    masterData: {
      title: 'Master Data',
      description:
        'Manage core configuration data, inventory, transactions, payments, and more.',
    },
  },

  // Component-specific strings
  components: {
    loadingSpinner: {
      message: 'Loading your session...',
    },
    navbar: {
      switchTenantLabel: 'Switch Tenant',
    },
  },

  // Table headers - useful for data tables across pages
  tableHeaders: {
    email: 'Email',
    action: 'Action',
    status: 'Status',
    timestamp: 'Timestamp',
    details: 'Details',
    ipAddress: 'IP Address',
    userAgent: 'User Agent',
    // Add more as needed for other tables
  },

  // Empty states
  emptyStates: {
    noData: 'No data available.',
    noResults: 'No results found.',
    noReports: 'No reports found for this tenant.',
    noLogs: 'No audit logs available.',
    noScopes: 'No scopes assigned to this user.',
  },

  // Accessibility labels (for screen readers)
  aria: {
    mainNavigation: 'Main navigation',
    userMenu: 'User menu',
    closeMenu: 'Close menu',
    loading: 'Loading content',
    searchInput: 'Search input',
  },

  // Future expansion - add new page/feature strings here
  // billing: {
  //   title: 'Billing & Invoices',
  //   ...
  // },
  // integrations: {
  //   title: 'Integrations',
  //   ...
  // },
};

export default STRINGS;
