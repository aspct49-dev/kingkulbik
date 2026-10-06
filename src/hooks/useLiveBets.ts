import { useEffect, useSyncExternalStore } from 'react'
import type { FeedBet } from '../../shared/originals'

/*
 * The live bet feed: every settled original from every player, newest first.
 * Polled while a feed is on screen and the tab is visible; a bet you place
 * refreshes it straight away.
 */

const POLL_MS = 2500

let bets: FeedBet[] | null = null
let mounted = 0
let timer = 0
let inFlight = false
const listeners = new Set<() => void>()

function set(next: FeedBet[]) {
  bets = next
  listeners.forEach((l) => l())
}

export function refreshLiveBets() {
  if (inFlight || document.visibilityState === 'hidden') return
  inFlight = true
  fetch('/api/originals/feed', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((body: { bets?: FeedBet[] } | null) => {
      if (body?.bets) set(body.bets)
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight = false
    })
}

function start() {
  refreshLiveBets()
  timer = window.setInterval(refreshLiveBets, POLL_MS)
  document.addEventListener('visibilitychange', refreshLiveBets)
}

function stop() {
  window.clearInterval(timer)
  document.removeEventListener('visibilitychange', refreshLiveBets)
}

/** Recent bets (null until the first answer) */
export function useLiveBets() {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => bets,
  )
  useEffect(() => {
    if (mounted++ === 0) start()
    return () => {
      if (--mounted === 0) stop()
    }
  }, [])
  return value
}
