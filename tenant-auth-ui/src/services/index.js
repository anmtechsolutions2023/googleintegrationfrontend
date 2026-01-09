export * from './authService'
export * from './dataService'

import * as auth from './authService'
import * as data from './dataService'

export default {
  ...auth,
  ...data,
}
