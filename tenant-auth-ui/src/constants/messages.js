import { ERROR_CODES } from './httpCodes';

const MESSAGES = {
  success: {
    save: 'Saved successfully.',
    welcome: 'Welcome back!',
    loggedOut: 'Logged out successfully.',
    delete: 'Deleted successfully.',
    update: 'Updated successfully.',
  },
  error: {
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

    // Legacy message keys (kept for backward compatibility)
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
};

export default MESSAGES;
