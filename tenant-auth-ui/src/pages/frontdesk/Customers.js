import React, { useState } from 'react'
import PosCrudPage from '../../components/frontdesk/PosCrudPage'
import CustomerProfile from '../../components/frontdesk/CustomerProfile'
import { POS_MODULES } from '../../config/posModules'
import { SCOPES } from '../../constants'

/**
 * The CRM list, plus a profile behind each row.
 *
 * PosCrudPage still owns the list, the form and the delete — this only adds a
 * READ view through its optional onView hook, so nothing about the existing
 * CRUD behaviour changes.
 */
const Customers = () => {
  const [profileId, setProfileId] = useState(null)

  return (
    <>
      <PosCrudPage
        moduleConfig={POS_MODULES.posCustomers}
        writeScopes={[SCOPES.POS_CRM_WRITE, SCOPES.TENANT_ADMIN]}
        onView={(row) => setProfileId(row.Id || row.id)}
      />
      <CustomerProfile customerId={profileId} onClose={() => setProfileId(null)} />
    </>
  )
}

export default Customers
