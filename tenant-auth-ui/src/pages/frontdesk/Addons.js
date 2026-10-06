import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'
import ExportButton from '../../components/export/ExportButton'

// Add-on master — wires to /api/pos/addons.
// One selectable option inside a group. FoodTypeId is the dietary tag on the
// add-on itself: a veg pizza with a chicken topping is not a veg order.

const Addons = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.posAddons}
    writeScopes={[SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN]}
    headerActions={<ExportButton exportKey="menu-options" className="btn btn-secondary" />}
  />
)

export default Addons
