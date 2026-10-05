// Which permissions are pointless without others.
//
// The same rules as the backend's src/config/permissionRules.js — change both
// together. The role editor uses them to tick a requirement for the admin (and
// say why), and the server adds it anyway on save, so no role is ever stored in
// a shape whose screens never appear.

/**
 * Extra requirements beyond the general "Manage needs View" rule. Approving
 * something you cannot see is not a job anybody can do.
 */
export const REQUIRES = {
  // Expense claims are listed on Money › Expenses, which opens on POS_OPS:READ.
  'EXPENSE:APPROVE': ['POS_OPS:READ'],
  // Refunds are made from the Ledger and Returns screens (TRANSACTIONS:READ).
  'REFUND:APPROVE': ['TRANSACTIONS:READ'],
}

/** The permissions a key needs, one level deep. */
export const requirementsOf = (key) => {
  const [subject, level] = String(key).split(':')
  const needs = level === 'WRITE' ? [`${subject}:READ`] : []
  return needs.concat(REQUIRES[key] || [])
}

/**
 * A set of keys plus everything it needs, transitively. Keys missing from
 * `available` are never added.
 * @param {string[]} keys
 * @param {Iterable<string>} available
 * @returns {string[]}
 */
export const withRequirements = (keys, available) => {
  const can = available instanceof Set ? available : new Set(available)
  const out = new Set(keys)
  const queue = [...keys]
  while (queue.length) {
    for (const need of requirementsOf(queue.shift())) {
      if (can.has(need) && !out.has(need)) {
        out.add(need)
        queue.push(need)
      }
    }
  }
  return [...out].sort()
}

/**
 * Which chosen keys require `key` — the reason shown beside a box the editor
 * ticked on the admin's behalf ("needed by Orders & KOTs — Manage").
 */
export const requiredBy = (key, chosen) =>
  chosen.filter((k) => k !== key && requirementsOf(k).includes(key))

/**
 * The scopes a holder can USE: Manage implies View. A role holding only
 * POS_ORDER:WRITE can call every endpoint behind the View screens (the server
 * accepts WRITE on those reads), so the screens are offered too.
 */
export const effectiveScopes = (scopes = []) => {
  const out = new Set(scopes)
  for (const s of scopes) {
    if (String(s).endsWith(':WRITE')) out.add(String(s).replace(/:WRITE$/, ':READ'))
  }
  return out
}
