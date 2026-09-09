import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

// Add-on master — wires to /api/pos/addons.
// One selectable option inside a group. FoodTypeId is the dietary tag on the
// add-on itself: a veg pizza with a chicken topping is not a veg order.

const Addons = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.posAddons}
    writeScopes={[SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default Addons
