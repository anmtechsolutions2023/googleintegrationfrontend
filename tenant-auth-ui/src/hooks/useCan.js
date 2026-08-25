import { useAuth } from '../context/AuthContext'
import { hasScope } from '../utils/permissions'
import { SCOPES } from '../constants'

/**
 * Whether the signed-in user may perform an action.
 *
 * A screen and the actions on it are two different permissions. Front Desk
 * screens are offered on a READ scope — Billing on POS_ORDER:READ, the KDS on
 * POS_KITCHEN:READ — while settling a bill, marking a ticket ready or refunding
 * an invoice each need their own WRITE. Several pages showed those controls to
 * anybody who could open the screen, so a waiter was offered Settle and a
 * read-only user was offered Refund; the server refused, and the person was
 * left with a red toast and no way to tell what they were entitled to.
 *
 * Tenant admins pass everything by administration rather than by any role, so
 * that is folded in here once instead of being remembered at each call site —
 * forgetting it was how admins lost buttons they were entitled to.
 *
 * This hides a control; it never authorises one. checkScope on the server is
 * the authority, and every one of these actions is refused there too.
 *
 * @param {string|string[]} scopes - Scope(s) that permit the action; any one is enough.
 * @returns {boolean}
 *
 * @example
 *   const canSettle = useCan(SCOPES.POS_BILLING_WRITE)
 *   {canSettle && <button onClick={settle}>Settle</button>}
 */
export const useCan = (scopes) => {
  // Tolerates being called outside a provider, or before the session resolves.
  // No session is not an error here — it is simply no permission, and a control
  // that stays hidden for a moment is better than a screen that throws.
  const { user } = useAuth() || {}
  const required = (Array.isArray(scopes) ? scopes : [scopes]).filter(Boolean)
  return hasScope(user, [...required, SCOPES.TENANT_ADMIN])
}

export default useCan
