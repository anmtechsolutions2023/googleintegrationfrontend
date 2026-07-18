import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

const Feedback = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.posFeedback}
    writeScopes={[SCOPES.POS_CRM_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default Feedback
