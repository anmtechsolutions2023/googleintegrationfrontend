import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

// Menu tag master — wires to /api/pos/menu-tags.
// One master for all three tag kinds, separated by TagType. A table per kind
// would be three sets of CRUD and three chances for the vocabularies to drift.

const MenuTags = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.posMenuTags}
    writeScopes={[SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default MenuTags
