import { useEffect, useSyncExternalStore } from 'react'
import type { FairnessState } from '../../shared/originals'
import { linkKickUrl, setPointsBalance, signInUrl, useAuth, usePoints } from '../hooks/useAuth'

/*
 * Talking to the originals on the server: every bet is settled there from the
 * provably fair seeds and paid in King Points (BotRix). The seed state is the
 * player's own, kept on the server and shared by Keno and Coinflip (one seed
 * pair and nonce, like on Stake).
 */

let fairness: FairnessState | null = null
let fairnessStarted = false
const listeners = new Set<() => void>()

export function setFairness(next: FairnessState | undefined) {
  if (!next) return
  fairness = next
  listeners.forEach((l) => l())
}

function loadFairness() {
  fairnessStarted = true
  fetch('/api/originals/fairness', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((body: { fairness?: FairnessState } | null) => setFairness(body?.fairness))
    .catch(() => undefined)
}

/** The active seed pair (hash only), its nonce and the last revealed pair */
export function useFairness() {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => fairness,
  )
  useEffect(() => {
    if (!fairnessStarted) loadFairness()
  }, [])
  return value
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

/** POST a JSON body to an originals route */
export async function postOriginals<T>(route: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/originals/${route}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; fairness?: FairnessState }
    setFairness(data.fairness)
    if (!res.ok) return { ok: false, status: res.status, error: data.error ?? 'Something went wrong. Please try again.' }
    return { ok: true, data }
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the server. Check your connection and try again.' }
  }
}

/** New server seed (revealing the current one) and, optionally, a client seed of your own */
export async function rotateSeed(clientSeed: string) {
  const result = await postOriginals<{ fairness: FairnessState }>('fairness/rotate', { clientSeed })
  return result.ok ? null : result.error
}

/** Whole King Points, as BotRix keeps them: 29440 → "29,440" */
export const formatKingPoints = (value: number) => Math.floor(value).toLocaleString('en-US')

export type PlayGate = { label: string; href: string; reason: string } | null

/**
 * The player's King Points for the originals (from BotRix), and what stands
 * in the way of playing: signing in, linking Kick, or the balance loading.
 */
export function usePlayBalance(returnTo: string) {
  const { status, user } = useAuth()
  const points = usePoints()
  let gate: PlayGate = null
  if (status === 'ready' && !user) gate = { label: 'Sign in to play', href: signInUrl(returnTo), reason: 'Sign in with Discord to play with your King Points.' }
  else if (user && !user.kick) gate = { label: 'Link Kick to play', href: linkKickUrl(returnTo), reason: 'King Points live on Kick: link your Kick account to play.' }
  const ready = status === 'ready' && Boolean(user?.kick) && points.status === 'ready' && points.data !== null
  return {
    balance: points.data?.points ?? 0,
    /** Adjust the shown balance as bets are taken and wins paid */
    setBalance: setPointsBalance,
    gate,
    ready,
  }
}
