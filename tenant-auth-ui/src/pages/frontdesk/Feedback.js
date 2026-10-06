import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'
import ExportButton from '../../components/export/ExportButton'

const Feedback = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.posFeedback}
    writeScopes={[SCOPES.POS_CRM_WRITE, SCOPES.TENANT_ADMIN]}
    headerActions={<ExportButton exportKey="feedback" context={{ preset: 'month' }} className="btn btn-secondary" />}
  />
)

export default Feedback
