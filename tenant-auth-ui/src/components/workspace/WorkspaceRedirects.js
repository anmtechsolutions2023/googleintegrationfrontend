import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { legacyTargetFor, homePathFor } from '../../config/workspaces'
import { isSetupPending } from '../../utils/permissions'
import NotFound from '../../pages/NotFound'

/**
 * An old /frontdesk/*, /master/* or /reports URL — from a bookmark, a link in
 * a receipt, or a screen not yet updated — sent to where that screen lives now,
 * keeping any id after it and the query string (/frontdesk/finance?tab=gst
 * lands on /money/overview?tab=gst).
 */
export const LegacyRedirect = () => {
  const { pathname, search } = useLocation()
  const target = legacyTargetFor(pathname, search)
  return target ? <Navigate to={target} replace /> : <NotFound />
}

/**
 * Home. Mid-setup it is the home page (the only one reachable then); after
 * that it is the first workspace this person can open — Service › Floor › Billing &
 * KOT for floor staff, Money for an accountant who holds nothing else.
 */
export const HomeRedirect = ({ fallback }) => {
  const { user } = useAuth()
  if (isSetupPending(user)) return fallback
  const home = homePathFor(user)
  return home ? <Navigate to={home} replace /> : fallback
}
