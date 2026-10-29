import { useEffect, useState } from 'react'
import type { ArchivedRace, ArchivedRaceSummary } from '../../shared/leaderboard'

/*
 * Previous leaderboards (server/leaderboardArchive.ts). Finished races never
 * change, so each answer is kept for the visit: going back and forth between
 * months doesn't refetch.
 */

let list: ArchivedRaceSummary[] | null = null
const races = new Map<string, ArchivedRace>()

export type ArchiveState<T> = { status: 'loading' | 'ready' | 'error'; data: T | null }

/** Every finished race, newest first */
export function useArchivedRaces(enabled: boolean): ArchiveState<ArchivedRaceSummary[]> {
  const [state, setState] = useState<ArchiveState<ArchivedRaceSummary[]>>({ status: list ? 'ready' : 'loading', data: list })
  useEffect(() => {
    if (!enabled || list) return
    let cancelled = false
    fetch('/api/leaderboard/archive')
      .then((r) => (r.ok ? (r.json() as Promise<{ races: ArchivedRaceSummary[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((body) => {
        list = body.races
        if (!cancelled) setState({ status: 'ready', data: list })
      })
      .catch(() => !cancelled && setState({ status: 'error', data: null }))
    return () => {
      cancelled = true
    }
  }, [enabled])
  return state
}

/** One finished race's standings (null id: none chosen) */
export function useArchivedRace(id: string | null): ArchiveState<ArchivedRace> {
  const [state, setState] = useState<ArchiveState<ArchivedRace>>({ status: 'loading', data: null })
  useEffect(() => {
    if (!id) return setState({ status: 'ready', data: null })
    const hit = races.get(id)
    if (hit) return setState({ status: 'ready', data: hit })
    setState({ status: 'loading', data: null })
    let cancelled = false
    fetch(`/api/leaderboard/archive/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ race: ArchivedRace }>) : Promise.reject(new Error(String(r.status)))))
      .then((body) => {
        races.set(id, body.race)
        if (!cancelled) setState({ status: 'ready', data: body.race })
      })
      .catch(() => !cancelled && setState({ status: 'error', data: null }))
    return () => {
      cancelled = true
    }
  }, [id])
  return state
}
