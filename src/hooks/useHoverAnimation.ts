import { useCallback, useRef, useState } from 'react'
import type { AnimationEvent } from 'react'

/**
 * idle → in → held → out → idle
 *
 * Each "in" / "out" run always plays to completion: leaving mid-way lets the
 * "in" animation finish before "out" starts, and re-entering mid-way lets
 * "out" finish before "in" plays again.
 */
export type HoverPhase = 'idle' | 'in' | 'held' | 'out'

export function useHoverAnimation() {
  const [phase, setPhase] = useState<HoverPhase>('idle')
  const hovered = useRef(false)
  const focused = useRef(false)

  const isActive = () => hovered.current || focused.current

  const activate = useCallback(() => {
    setPhase((p) => (p === 'idle' ? 'in' : p))
  }, [])

  const deactivate = useCallback(() => {
    if (isActive()) return
    setPhase((p) => (p === 'held' ? 'out' : p))
  }, [])

  // Only the root element's own animation drives the phase; child animations
  // bubble up here too and are ignored.
  const onAnimationEnd = useCallback((e: AnimationEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return
    setPhase((p) => {
      if (p === 'in') return isActive() ? 'held' : 'out'
      if (p === 'out') return isActive() ? 'in' : 'idle'
      return p
    })
  }, [])

  const handlers = {
    onMouseEnter: () => {
      hovered.current = true
      activate()
    },
    onMouseLeave: () => {
      hovered.current = false
      deactivate()
    },
    onFocus: () => {
      focused.current = true
      activate()
    },
    onBlur: () => {
      focused.current = false
      deactivate()
    },
    onAnimationEnd,
  }

  return { phase, handlers }
}
