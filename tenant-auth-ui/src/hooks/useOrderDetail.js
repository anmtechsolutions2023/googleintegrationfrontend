import { useCallback, useEffect, useState } from 'react'
import posService from '../services/posService'

/**
 * Loads one round's full detail — the order, its token, its kitchen tickets and
 * the invoice it was billed on.
 *
 * Data only: no markup, no modal, no toast. Separated from the modal so the
 * fetch can be reused by anything that needs an order (a print view, a future
 * route) without dragging a dialog along with it.
 *
 * @param {string|null} orderId - Null closes/idles the hook without fetching.
 * @returns {{ detail: Object|null, loading: boolean, error: string|null, reload: Function }}
 */
export const useOrderDetail = (orderId) => {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!orderId) { setDetail(null); setError(null); return }
    setLoading(true)
    setError(null)
    try {
      setDetail(await posService.getOrderDetail(orderId))
    } catch (e) {
      // Surfaced as state rather than a toast: the modal is the only thing that
      // can show it in context, and a toast would fire behind whatever else is
      // on screen.
      setError(e?.response?.data?.message || 'Could not load this order')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { load() }, [load])

  return { detail, loading, error, reload: load }
}

export default useOrderDetail
