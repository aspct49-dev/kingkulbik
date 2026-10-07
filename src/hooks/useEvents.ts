import { useCallback, useEffect, useState } from 'react'
import type { Hunt, PublicGiveaway, PublicGuessRound, RaffleWin, Tournament } from '../../shared/events'
import type { PublicRaffle } from '../../shared/raffles'
import type { KickSocials } from '../../shared/socials'

type Polled<T> = { status: 'loading' | 'ready' | 'error'; data: T | null; refresh: () => void }

/**
 * A public event endpoint, re-read every `every` ms while the tab is visible
 * (pages refresh gently; stream overlays faster).
 */
/** Last answer per endpoint: coming back to a page shows it at once while it refreshes */
const lastSeen = new Map<string, unknown>()

/** Fetch an endpoint ahead of time (e.g. while the visitor is on another page) */
export function prefetchPolled(url: string) {
  if (lastSeen.has(url)) return
  fetch(url, { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => data && !lastSeen.has(url) && lastSeen.set(url, data))
    .catch(() => undefined)
}

function usePolled<T>(url: string, every: number): Polled<T> {
  const [state, setState] = useState<{ status: Polled<T>['status']; data: T | null }>(() => {
    const seen = lastSeen.get(url) as T | undefined
    return seen ? { status: 'ready', data: seen } : { status: 'loading', data: null }
  })

  const refresh = useCallback(() => {
    fetch(url, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: T) => {
        lastSeen.set(url, data)
        setState({ status: 'ready', data })
      })
      .catch(() => setState((s) => ({ status: s.data ? 'ready' : 'error', data: s.data })))
  }, [url])

  useEffect(() => {
    refresh()
    const id = window.setInterval(() => document.visibilityState === 'visible' && refresh(), every)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refresh, every])

  return { ...state, refresh }
}

export const useHunt = (every = 10_000) => usePolled<{ hunt: Hunt | null }>('/api/events/hunt', every)
export const useGuessRound = (every = 10_000) => usePolled<{ round: PublicGuessRound | null }>('/api/events/guess', every)
export const useTournaments = (every = 10_000) => usePolled<{ tournaments: Tournament[] }>('/api/events/tournaments', every)
export const useGiveaway = (every = 5_000) =>
  usePolled<{ giveaway: PublicGiveaway; history: RaffleWin[] }>('/api/events/giveaway', every)
/** The Kick channel and its recent streams (the server reads Kick about once a minute) */
export const useKickSocials = (every = 60_000) => usePolled<KickSocials>('/api/socials/kick', every)
export const useRaffles = (every = 5_000) => usePolled<{ raffles: PublicRaffle[] }>('/api/raffles', every)
