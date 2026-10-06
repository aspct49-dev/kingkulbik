import { useEffect, useSyncExternalStore } from 'react'
import type { FairnessState } from '../../shared/originals'

/*
 * Talking to the originals on the server: every bet is settled there from the
 * provably fair seeds. The seed state is one shared copy for Keno and
 * Coinflip (they use the same seed pair and nonce, like on Stake).
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
