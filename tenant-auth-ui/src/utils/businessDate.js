/**
 * The calendar date a business document belongs to — the client's half of the
 * rule the server applies in utils/dateRange.businessDate.
 *
 * LOCAL calendar, deliberately. `toISOString().slice(0, 10)` gives the date in
 * UTC, which in UTC+5:30 is still yesterday until 05:30 — so a queue screen
 * asking for "today" between midnight and half five requested a day the tokens
 * issued that morning were not filed under, and showed an empty counter.
 *
 * @param {Date} [when] - Defaults to now.
 * @returns {string} YYYY-MM-DD
 */
export const businessDate = (when = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
}

export default businessDate
