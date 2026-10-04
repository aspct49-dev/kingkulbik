import { useEffect, useRef } from 'react'

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

type AnimatedNumberProps = {
  value: number
  format: (value: number) => string
  /** Tween length in ms */
  duration?: number
  /** Start every change from this value (e.g. 0 for a count-up) instead of the last shown value */
  from?: number
  className?: string
}

/**
 * A number that rolls to its new value. It writes the text straight into the
 * DOM on each animation frame, so nothing re-renders while it counts.
 */
export default function AnimatedNumber({ value, format, duration = 450, from, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(from ?? value)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const start = from ?? shown.current
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || start === value) {
      shown.current = value
      el.textContent = format(value)
      return
    }
    const t0 = performance.now()
    let frame = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      shown.current = start + (value - start) * easeOutCubic(p)
      el.textContent = format(shown.current)
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, from, format])

  return (
    <span ref={ref} className={className}>
      {format(from ?? value)}
    </span>
  )
}
