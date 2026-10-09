import { useEffect, useRef } from 'react'

/**
 * Calls `fn` now and then every `ms` while the browser tab is visible.
 *
 * A till or kitchen screen is left open all shift, often in a background tab.
 * Polling a hidden tab loads the database for a screen nobody is looking at,
 * so the timer stops while hidden and `fn` runs once the moment the tab is
 * shown again, so the screen is never stale when someone looks.
 *
 * @param {() => any} fn - Latest version is always used; no need to memoise.
 * @param {number} ms
 * @param {boolean} [enabled=true]
 */
const usePolling = (fn, ms, enabled = true) => {
  const latest = useRef(fn)
  latest.current = fn

  useEffect(() => {
    if (!enabled) return undefined
    let timer = null
    const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
    const start = () => {
      if (timer || hidden()) return
      timer = setInterval(() => latest.current(), ms)
    }
    const stop = () => { clearInterval(timer); timer = null }
    const onVisibility = () => {
      if (hidden()) stop()
      else { latest.current(); start() }
    }
    latest.current()
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [ms, enabled])
}

export default usePolling
