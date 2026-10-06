import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getExports } from '../services/exportService'

/**
 * The exports the signed-in person may take, from the server.
 *
 * Every Export button reads this, and they all share one request. The cache
 * key is the tenancy plus the scopes, so a tenant switch or a role change —
 * which re-signs the token with new scopes — fetches a fresh list.
 *
 * @returns {{exports: Array, canUnmask: boolean, loaded: boolean, find: (key: string) => Object|null}}
 */
export const useExports = () => {
  const { user } = useAuth() || {}
  const key = `${user?.tid || ''}|${[...(user?.scopes || [])].sort().join(',')}`
  const [state, setState] = useState({ exports: [], canUnmask: false, loaded: false })

  const signedIn = !!user
  useEffect(() => {
    if (!signedIn) return undefined
    let live = true
    getExports(key)
      .then((data) => { if (live) setState({ exports: data.exports || [], canUnmask: !!data.canUnmask, loaded: true }) })
      // No list, no buttons: an export the server would refuse is not offered.
      .catch(() => { if (live) setState({ exports: [], canUnmask: false, loaded: true }) })
    return () => { live = false }
  }, [key, signedIn])

  return {
    ...state,
    find: (exportKey) => state.exports.find((e) => e.key === exportKey) || null,
  }
}

export default useExports
