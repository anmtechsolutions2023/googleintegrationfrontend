import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

const Customers = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.posCustomers}
    writeScopes={[SCOPES.POS_CRM_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default Customers
