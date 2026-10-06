import { useEffect, useSyncExternalStore } from 'react'

export type AuthUser = {
  discord: { id: string; username: string; name: string; avatar: string | null }
  kick: { id: string; username: string } | null
  stake?: { username: string; linkedAt: number } | null
  signedInAt: number
}

type AuthState = { status: 'loading' | 'ready'; user: AuthUser | null; /** In ADMIN_DISCORD_IDS */ admin: boolean }

/* One shared copy for the whole app (header, account page, gates), fetched once */
let state: AuthState = { status: 'loading', user: null, admin: false }
const listeners = new Set<() => void>()
let started = false

function set(next: AuthState) {
  state = next
  listeners.forEach((l) => l())
}

export function refreshAuth() {
  return fetch('/api/auth/me', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : { user: null }))
    .then((body: { user: AuthUser | null; admin?: boolean }) =>
      set({ status: 'ready', user: body.user ?? null, admin: Boolean(body.user && body.admin) }),
    )
    .catch(() => set({ status: 'ready', user: null, admin: false }))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!started) {
    started = true
    void refreshAuth()
  }
  return () => listeners.delete(listener)
}

/** The signed-in user (Discord, plus a linked Kick account), or null */
export function useAuth() {
  return useSyncExternalStore(subscribe, () => state)
}

/** Full-page redirect into Discord sign-in, coming back to `returnTo` (defaults to here) */
export function signInUrl(returnTo = window.location.pathname) {
  return `/api/auth/discord/login?return=${encodeURIComponent(returnTo)}`
}

export function linkKickUrl(returnTo = window.location.pathname) {
  return `/api/auth/kick/login?return=${encodeURIComponent(returnTo)}`
}

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
  set({ status: 'ready', user: null, admin: false })
}

export type Points = { points: number; watchtime: number; level: number; known: boolean }

type PointsState = { status: 'idle' | 'loading' | 'ready' | 'error'; data: Points | null; forKick: string | null }

let pointsState: PointsState = { status: 'idle', data: null, forKick: null }
const pointsListeners = new Set<() => void>()

function setPoints(next: PointsState) {
  pointsState = next
  pointsListeners.forEach((l) => l())
}

/** Re-read the BotRix balance (also runs on first use and whenever the linked Kick account changes) */
export function refreshPoints() {
  const kick = state.user?.kick?.username ?? null
  if (!kick) return setPoints({ status: 'idle', data: null, forKick: null })
  setPoints({ ...pointsState, status: 'loading', forKick: kick })
  fetch('/api/auth/points', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((body: Points & { points: number | null }) =>
      setPoints(
        body.points === null
          ? { status: 'idle', data: null, forKick: null }
          : { status: 'ready', data: body, forKick: kick },
      ),
    )
    .catch(() => setPoints({ status: 'error', data: null, forKick: kick }))
}

function subscribePoints(listener: () => void) {
  pointsListeners.add(listener)
  return () => pointsListeners.delete(listener)
}

/** The signed-in viewer's BotRix points on the channel (needs a linked Kick account) */
export function usePoints() {
  const snapshot = useSyncExternalStore(subscribePoints, () => pointsState)
  const kick = useAuth().user?.kick?.username ?? null
  useEffect(() => {
    if (kick && pointsState.forKick !== kick) refreshPoints()
    if (!kick && pointsState.forKick) setPoints({ status: 'idle', data: null, forKick: null })
  }, [kick])
  return snapshot
}

/** Link a Stake username (checked server-side against the affiliate list). Resolves to an error message, or null */
export async function linkStake(username: string): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/stake', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    const body = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string }
    if (!res.ok || !body.user) return body.error ?? 'Could not link that account. Please try again.'
    set({ ...state, status: 'ready', user: body.user })
    stakeState = { status: 'idle', data: null, forStake: null }
    return null
  } catch {
    return 'Could not reach the server. Please try again.'
  }
}

export type StakeProgress = { username: string; wagered: number; underCode: boolean }

type StakeState = { status: 'idle' | 'loading' | 'ready' | 'error'; data: StakeProgress | null; forStake: string | null }

let stakeState: StakeState = { status: 'idle', data: null, forStake: null }
const stakeListeners = new Set<() => void>()

function setStake(next: StakeState) {
  stakeState = next
  stakeListeners.forEach((l) => l())
}

function refreshStake(name: string) {
  setStake({ ...stakeState, status: 'loading', forStake: name })
  fetch('/api/auth/stake/progress', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((body: StakeProgress & { wagered: number | null }) =>
      setStake(
        body.wagered === null
          ? { status: 'idle', data: null, forStake: null }
          : { status: 'ready', data: body, forStake: name },
      ),
    )
    .catch(() => setStake({ status: 'error', data: null, forStake: name }))
}

/** The linked Stake account's wager under the code (for milestone progress) */
export function useStakeProgress() {
  const snapshot = useSyncExternalStore(
    (l) => {
      stakeListeners.add(l)
      return () => stakeListeners.delete(l)
    },
    () => stakeState,
  )
  const name = useAuth().user?.stake?.username ?? null
  useEffect(() => {
    if (name && stakeState.forStake !== name) refreshStake(name)
    if (!name && stakeState.forStake) setStake({ status: 'idle', data: null, forStake: null })
  }, [name])
  return snapshot
}
