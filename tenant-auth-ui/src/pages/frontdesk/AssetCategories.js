import React from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

/** Asset category master — same ASSET scopes as the register itself. */
const AssetCategories = () => (
  <PosCrudPage
    moduleConfig={POS_MODULES.assetCategories}
    writeScopes={[SCOPES.ASSET_WRITE, SCOPES.TENANT_ADMIN]}
  />
)

export default AssetCategories
