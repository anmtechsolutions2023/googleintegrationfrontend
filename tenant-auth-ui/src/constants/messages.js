import { ERROR_CODES } from './httpCodes';

// Centralized messages for toasts, alerts, and notifications
// Organized by type: success, error, warning, info
// Error messages are keyed by ERROR_CODES for consistency

const MESSAGES = {
  success: {
    save: 'Saved successfully.',
    welcome: 'Welcome back!',
    loggedOut: 'Logged out successfully.',
    delete: 'Deleted successfully.',
    update: 'Updated successfully.',
    created: 'Created successfully.',
    tenantSwitch: 'Tenant switched successfully.',
    // Add more success messages as needed
  },

  error: {
    // Error messages keyed by ERROR_CODES - single source of truth
    [ERROR_CODES.NETWORK_ERROR]: 'Network error. Please check your connection.',
    [ERROR_CODES.AUTH_EXPIRED]: 'Session expired. Please login again.',
    [ERROR_CODES.PERMISSION_DENIED]:
      'You do not have permission to perform this action.',
    [ERROR_CODES.USER_NOT_EXIST]: 'Auth Error: User does not exist.',
    [ERROR_CODES.GOOGLE_SIGNIN_FAILED]: 'Google Sign-In Failed',
    [ERROR_CODES.USER_NOT_FOUND_TENANT]: 'User not found in any tenant system.',
    [ERROR_CODES.SWITCH_TENANT_FAILED]: 'Failed to switch tenant.',
    [ERROR_CODES.GENERIC_ERROR]:
      'Something went wrong. Please try again later.',

    // API-specific error messages
    fetchFailed: 'Failed to fetch data. Please try again.',
    saveFailed: 'Failed to save. Please try again.',
    deleteFailed: 'Failed to delete. Please try again.',
    uploadFailed: 'Failed to upload file. Please try again.',

    // Validation errors
    invalidEmail: 'Please enter a valid email address.',
    requiredField: 'This field is required.',

    // Add more error messages as needed
  },

  warning: {
    unsavedChanges: 'You have unsaved changes. Continue without saving?',
    deprecated: 'This feature is deprecated and may be removed in the future.',
    sessionExpiring: 'Your session will expire soon. Please save your work.',
    // Add more warning messages as needed
  },

  info: {
    loading: 'Loading...',
    noData: 'No data available.',
    noChanges: 'No changes detected.',
    processing: 'Processing your request...',
    // Add more info messages as needed
  },

  // Confirmation dialogs
  confirm: {
    delete: 'Are you sure you want to delete this item?',
    logout: 'Are you sure you want to logout?',
    discard: 'Are you sure you want to discard your changes?',
    // Add more confirmation messages as needed
  },
};

// Helper function to get error message by code
export const getErrorMessage = (code) => {
  return MESSAGES.error[code] || MESSAGES.error[ERROR_CODES.GENERIC_ERROR];
};

export default MESSAGES;
