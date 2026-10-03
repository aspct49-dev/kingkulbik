import { useEffect, useState } from 'react'
import type { BoardId, LeaderboardResponse } from '../../shared/leaderboard'

const REFRESH_MS = 60_000

export type LeaderboardState =
  | { status: 'loading'; data?: undefined }
  | { status: 'ready'; data: LeaderboardResponse }
  | { status: 'error'; data?: LeaderboardResponse }

// Last good response per board, so switching boards doesn't flash empty rows
const lastGood = new Map<BoardId, LeaderboardResponse>()

export function useLeaderboard(board: BoardId): LeaderboardState {
  const [state, setState] = useState<LeaderboardState>(() => {
    const cached = lastGood.get(board)
    return cached ? { status: 'ready', data: cached } : { status: 'loading' }
  })

  useEffect(() => {
    const cached = lastGood.get(board)
    setState(cached ? { status: 'ready', data: cached } : { status: 'loading' })

    let abort = new AbortController()

    const load = async () => {
      abort.abort()
      abort = new AbortController()
      try {
        const res = await fetch(`/api/leaderboard?board=${board}`, { signal: abort.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as LeaderboardResponse
        lastGood.set(board, data)
        setState({ status: 'ready', data })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        // Keep showing the last good standings if we have them
        setState({ status: 'error', data: lastGood.get(board) })
      }
    }

    load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => {
      window.clearInterval(id)
      abort.abort()
    }
  }, [board])

  return state
}
