// Centralized UI strings - organized by page/component for scalability
// This file should contain ALL user-facing text in the application
// Organized hierarchically for easy maintenance as app grows

const STRINGS = {
  // Application-wide strings
  app: {
    name: 'Restro OS',
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
    platform: 'Platform',
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
    mobile: 'Mobile:',
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
      title: 'Sign in',
      subtitle: "We'll send a code to your WhatsApp.",
      phoneLabel: 'WhatsApp number',
      sendCode: 'Send code',
      sending: 'Sending…',
      // Step two.
      codeTitle: 'Enter the code',
      codeLabel: 'Six-digit code',
      sentTo: 'Sent on WhatsApp to',
      changeNumber: 'Use a different number',
      expiresIn: 'Expires in',
      expired: 'That code has expired.',
      resendIn: 'Resend in',
      resend: 'Send a new code',
      verify: 'Verify and sign in',
      verifying: 'Checking…',
      noCode: "Didn't get it? Check WhatsApp is connected on that number, or ask "
        + 'your manager to sign you in.',
      // The brand panel, shown beside the card from 900px up.
      headline: 'The floor, the kitchen, and the books.',
      blurb: 'One system from the moment an order is taken to the moment it '
        + 'reaches your ledger.',
      capabilities: ['Billing & KOT', 'Kitchen display', 'Tables & tokens', 'Ledger & reports'],
      access: 'Signed in on this device only. Ask your manager for access.',
      // Says out loud what a first-time sign-in actually does — new users hit
      // the Approvals queue today with no warning that they will.
      firstTime: 'Signing in for the first time? Your request goes to your '
        + 'manager for approval before you can take orders.',
    },

    dashboard: {
      title: 'Dashboard',
      capabilitiesTitle: 'What you can do',
      technicalDetail: 'Technical detail — permission codes and tenant id',
      technicalHint: 'Support may ask you for these.',
      capabilitiesUnavailable:
        'Could not load your permissions just now. The codes below still show what you hold.',
      welcome: 'Welcome,',
      defaultUserName: 'User',
      noScopes: 'No scopes assigned to this user.',
    },

    admin: {
      title: 'Restro OS Settings',
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

    // What is left of the old per-tenancy Users screen, still used by the
    // cross-tenant All Users view. Managing one tenancy's own people moved to
    // /frontdesk/access-control, which carries its own copy.
    adminUsers: {
      title: 'Users',
      empty: 'No users found in this tenant.',
      selfSuspendBlocked: 'You cannot suspend your own account.',
      selfBadge: 'You',
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
    actor: 'Who',
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
