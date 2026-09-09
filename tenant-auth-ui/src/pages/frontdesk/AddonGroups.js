import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

// Add-on group master — wires to /api/pos/addon-groups.
// A group is NOT a variant: a variant REPLACES the item's price (Half/Full),
// a group AUGMENTS it (extra cheese) and carries selection rules a portal
// validates each order line against. The server refuses Min > Max with a 400.

const AddonGroups = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.posAddonGroups}
    writeScopes={[SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default AddonGroups
