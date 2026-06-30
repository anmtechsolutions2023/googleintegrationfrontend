export * from './authService';
export * from './dataService';
export * from './onboardingService';
export * from './adminService';
export { default as crudService } from './crudService';

import * as auth from './authService';
import * as data from './dataService';
import * as onboarding from './onboardingService';
import * as admin from './adminService';
import crudService from './crudService';

export default {
  ...auth,
  ...data,
  ...onboarding,
  ...admin,
  crudService,
};
