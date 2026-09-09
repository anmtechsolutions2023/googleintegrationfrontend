import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

// Meat type master — wires to /api/pos/meat-types.
// ORTHOGONAL to food type, not a refinement of it: a dish is Non-Veg (food
// type) AND Chicken (meat type). Aggregators filter on the second, and a diner
// avoiding pork is filtering on nothing else.

const MeatTypes = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.posMeatTypes}
    writeScopes={[SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default MeatTypes
