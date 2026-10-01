import React from 'react'
import GstSettingsCard from '../../components/frontdesk/GstSettingsCard'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'

/**
 * Outlet › Tax & GST › GST Switch.
 *
 * The tenant-wide GST on/off, moved here from POS Settings so it sits beside
 * the tax types and groups it governs. Same card, same rules; only its home
 * changed.
 */
const GstSettings = () => {
  const { user } = useAuth()
  const canWrite = hasScope(user, [SCOPES.POS_CONFIG_WRITE, SCOPES.TENANT_ADMIN])
  return (
    <div className="fd-crud-page">
      <h1>GST</h1>
      <p className="fd-page-sub">One switch for the whole business, obeyed by pricing and every receipt.</p>
      <GstSettingsCard canWrite={canWrite} />
    </div>
  )
}

export default GstSettings
