import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

/**
 * Expense category master.
 *
 * Write is gated on EXPENSE:APPROVE rather than POS_OPS:WRITE — renaming or
 * deleting a category rewrites how every past expense reports, so it belongs
 * with whoever is trusted to approve spending.
 */
const ExpenseCategories = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.expenseCategories}
    writeScopes={[SCOPES.EXPENSE_APPROVE, SCOPES.TENANT_ADMIN]}
  />
)

export default ExpenseCategories
