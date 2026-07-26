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
    access: 'Access',
    settings: 'Settings',
    profile: 'Profile',
    masterData: 'Master Data',
    masterSetup: 'Setup Wizard',
    frontDesk: 'Front Desk',
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
    allCategories: 'All Categories',
    allLevels: 'All Levels',
    success: 'Success',
    denied: 'Denied',
    newestFirst: 'Newest First',
    oldestFirst: 'Oldest First',
  },

  // Pagination
  pagination: {
    previous: 'Previous',
    next: 'Next',
    pageOf: (page, total) => `Page ${page} of ${total}`,
    showingOf: (from, to, total) => `Showing ${from}–${to} of ${total} logs`,
    rowsPerPage: 'Rows per page:',
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

    onboarding: {
      title: 'Access Pending',
      pendingTitle: 'Your request is under review',
      pendingDesc: 'An administrator will review your request and grant access to the system.',
      rejectedTitle: 'Access Request Rejected',
      rejectedDesc: 'Your access request was not approved.',
      cancelledTitle: 'Access Request Cancelled',
      noteLabel: 'Add a note for the administrator (optional)',
      notePlaceholder: 'Describe your role, team, or reason for access...',
      saveNote: 'Save Note',
      checkStatus: 'Check Status',
      contactAdmin: 'If you believe this is an error, please contact your administrator.',
    },

    adminApprovals: {
      title: 'Onboarding Requests',
      empty: 'No onboarding requests found.',
      approveTitle: 'Approve Request',
      rejectTitle: 'Reject Request',
      tenantLabel: 'Assign Tenant ID',
      tenantPlaceholder: 'Enter tenant UUID to provision user into',
      rejectReasonLabel: 'Rejection Reason',
      rejectReasonPlaceholder: 'Briefly explain why access is being denied...',
    },

    adminUsers: {
      title: 'Users',
      empty: 'No users found in this tenant.',
      rolesTitle: 'Edit Roles',
      confirmSuspend: 'Suspend this user? They will lose access on next login.',
      confirmActivate: 'Restore access for this user?',
      confirmDelete: 'Permanently remove this user from the tenant?',
      selfSuspendBlocked: 'You cannot suspend your own account.',
      selfRemoveBlocked: 'You cannot remove your own account.',
      selfActionsBlocked: 'You cannot suspend or remove your own account.',
      selfBadge: 'You',
    },

    adminRoles: {
      title: 'Roles',
      empty: 'No roles defined yet.',
      createTitle: 'Create Role',
      editTitle: 'Edit Role',
      permissionsTitle: 'Edit Permissions',
      systemRoleNote: 'System roles cannot be modified or deleted.',
      noFeatures: 'No features available to assign.',
    },

    adminFeatures: {
      title: 'Features',
      empty: 'No features defined yet.',
      createTitle: 'Create Feature',
      editTitle: 'Edit Feature',
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
