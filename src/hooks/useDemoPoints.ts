import { useCallback, useState } from 'react'

/*
 * Demo points balance for the games, kept in this browser only. There are no
 * accounts yet; when there are, replace this hook with the real points API
 * (and settle bets on the server, not here).
 */

const STORAGE_KEY = 'kk:demo-points'
export const DEMO_STARTING_POINTS = 1000

function readStored() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(value) && localStorage.getItem(STORAGE_KEY) !== null ? value : DEMO_STARTING_POINTS
  } catch {
    return DEMO_STARTING_POINTS
  }
}

export function useDemoPoints() {
  const [balance, setBalanceState] = useState(readStored)

  const setBalance = useCallback((update: (current: number) => number) => {
    setBalanceState((current) => {
      const next = Math.round(update(current) * 100) / 100
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // Storage unavailable (private mode etc.): the balance still works for this visit
      }
      return next
    })
  }, [])

  const reset = useCallback(() => setBalance(() => DEMO_STARTING_POINTS), [setBalance])

  return { balance, setBalance, reset }
}
