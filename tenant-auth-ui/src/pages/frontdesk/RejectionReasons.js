import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

// Rejection reason master — wires to /api/pos/rejection-reasons.
// Why an order was refused, in a controlled vocabulary — free text cannot
// answer 'why did we reject 40 orders last week'. Distinct from return reasons,
// which cover goods coming back AFTER the food was made.

const RejectionReasons = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.posRejectionReasons}
    writeScopes={[SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default RejectionReasons
