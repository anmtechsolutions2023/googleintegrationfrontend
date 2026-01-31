export * from './authService';
export * from './dataService';
export { default as crudService } from './crudService';

import * as auth from './authService';
import * as data from './dataService';
import crudService from './crudService';

export default {
  ...auth,
  ...data,
  crudService,
};
