import { useEffect, useState } from 'react'

/**
 * Counts down to zero once, from a fresh start value.
 *
 * Shared by every one-time-code screen — staff sign-in and a guest verifying at
 * a QR table — so the resend and expiry timers behave the same in both.
 *
 * @param {number} seconds - Where to start.
 * @param {boolean} active - Counting only while true; restarts when it turns on.
 * @returns {number} Seconds left.
 */
export const useCountdown = (seconds, active) => {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    setLeft(seconds)
    if (!active) return undefined
    const id = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [seconds, active])
  return left
}

/** 125 → '2:05'. */
export const mmss = (total) =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`

export default useCountdown
