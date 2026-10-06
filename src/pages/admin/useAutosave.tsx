import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error'

/**
 * Edit a copy locally and save it shortly after the last change. Used for
 * the hunt and the bracket, which get many quick edits during a stream.
 */
export function useAutosave<T>(initial: T, save: (value: T) => Promise<void>, delay = 700) {
  const [value, setValue] = useState(initial)
  const [state, setState] = useState<SaveState>('saved')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef(0)
  const latest = useRef(initial)
  const saveRef = useRef(save)
  saveRef.current = save

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    timer.current = 0
    setState('saving')
    try {
      await saveRef.current(latest.current)
      setState('saved')
      setError(null)
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }, [])

  const change = useCallback(
    (next: T | ((current: T) => T)) => {
      const resolved = typeof next === 'function' ? (next as (c: T) => T)(latest.current) : next
      latest.current = resolved
      setValue(resolved)
      setState('unsaved')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), delay)
    },
    [delay, flush],
  )

  /** Load a different record (no save) */
  const reset = useCallback((next: T) => {
    window.clearTimeout(timer.current)
    timer.current = 0
    latest.current = next
    setValue(next)
    setState('saved')
    setError(null)
  }, [])

  // Don't lose the last edit when leaving the tab
  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current)
        void saveRef.current(latest.current).catch(() => undefined)
      }
    },
    [],
  )

  return { value, change, reset, state, error, flush }
}

export function SaveBadge({ state, error }: { state: SaveState; error: string | null }) {
  const label = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes', error: error ?? 'Not saved' }[state]
  return (
    <span className={`admin-save admin-save--${state}`} role="status">
      {label}
    </span>
  )
}
