const MESSAGES = {
  success: {
    save: 'Saved successfully.',
    welcome: 'Welcome back!',
    loggedOut: 'Logged out successfully.',
    delete: 'Deleted successfully.',
    update: 'Updated successfully.',
  },
  error: {
    network: 'Network error. Please check your connection.',
    authExpired: 'Session expired. Please login again.',
    permissionDenied: 'You do not have permission to perform this action.',
    userNotExist: 'Auth Error: User does not exist.',
    googleSignInFailed: 'Google Sign-In Failed',
    userNotFoundTenant: 'User not found in any tenant system.',
    switchTenant: 'Failed to switch tenant.',
    generic: 'Something went wrong. Please try again later.',
  },
  warning: {
    unsavedChanges: 'You have unsaved changes. Continue without saving?',
    deprecated: 'This feature is deprecated and may be removed in the future.',
  },
  info: {
    loading: 'Loading...',
    noData: 'No data available.',
  },
}

export default MESSAGES
