import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

const Expenses = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.posExpenses}
    writeScopes={[SCOPES.POS_OPS_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default Expenses
