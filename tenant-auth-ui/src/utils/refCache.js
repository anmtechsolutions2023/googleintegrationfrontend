// src/utils/refCache.js
//
// One copy of the lists that rarely change — branches, payment modes, and the
// reference lists behind dropdowns — shared by every screen.
//
// More than twenty screens and dialogs each fetched the branch list for
// themselves; a dropdown on every form fetched its list again on every open.
// Now the first caller fetches, everyone else in the next few minutes gets the
// same answer (or the same in-flight request).
//
// STAYING CORRECT
//   • Any successful POST, PUT, PATCH or DELETE through the API clears the whole
//     cache (wired in api/api.js). Saving a branch, a payment mode or anything
//     else means the next reader asks the server again. Cruder than
//     invalidating per list, and impossible to forget.
//   • Entries also expire after TTL_MS, for changes made on another device.
//   • A failed request is not kept, so the next caller retries.
//   • Switching business reloads the page, which starts a fresh cache.

export const TTL_MS = 5 * 60 * 1000

const entries = new Map()

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} load
 * @returns {Promise<T>}
 */
export const cached = (key, load) => {
  const hit = entries.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise
  const promise = Promise.resolve().then(load)
  entries.set(key, { at: Date.now(), promise })
  promise.catch(() => { if (entries.get(key)?.promise === promise) entries.delete(key) })
  // Each caller gets its own copy, so one screen sorting or editing its list
  // cannot change what the next screen is given.
  return promise.then((v) => (Array.isArray(v) ? [...v] : v))
}

/** Forget everything (after any change to data). */
export const clearRefCache = () => entries.clear()

const refCache = { cached, clearRefCache, TTL_MS }
export default refCache
