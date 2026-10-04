import { useId } from 'react'
import './Wordmark.css'

/** Width of one colour cycle of the outline, in logo units */
const STRIP_PERIOD = 286
/** The last stop repeats the first so the cycle tiles seamlessly */
const STRIP_STOPS = [0, 0.2, 0.4, 0.6, 0.8, 1]
/** Must match the wordmark-strip animation duration in Wordmark.css */
const STRIP_SECONDS = 2.4

/**
 * "KING KULBIK" in Titan One (286 × 144 at 1×), with a thin yellow outline
 * whose shades flow across it like an LED strip (or stays one shade with
 * `animated={false}`), or no outline at all with `outline={false}`. Size it
 * with CSS width.
 */
type WordmarkProps = {
  className?: string
  /** Animate the outline's shades (off: one steady shade) */
  animated?: boolean
  /** Draw the yellow outline and glow at all */
  outline?: boolean
}

export default function Wordmark({ className = '', animated = true, outline = true }: WordmarkProps) {
  // Gradient ids must be unique per instance and safe inside url(#…)
  const id = `kk-wordmark-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <svg
      className={`wordmark${animated ? '' : ' wordmark--still'}${outline ? '' : ' wordmark--plain'} ${className}`}
      viewBox="0 0 286 144"
      width={286}
      height={144}
      role="img"
      aria-label="King Kulbik"
    >
      <defs>
        <linearGradient id={`${id}-king`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4e4e4" />
          <stop offset="1" stopColor="#c6c6c6" />
        </linearGradient>
        <linearGradient id={`${id}-kulbik`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ded12e" />
          <stop offset="1" stopColor="#aa8906" />
        </linearGradient>
        <linearGradient
          id={`${id}-strip`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={STRIP_PERIOD}
          y2="0"
          spreadMethod="repeat"
        >
          {/* Each stop cycles through the strip's shades a step behind the last, so the colours flow along */}
          {STRIP_STOPS.map((offset, i) => (
            <stop
              key={offset}
              className="wordmark__strip-stop"
              offset={offset}
              style={{ animationDelay: `${-((i % (STRIP_STOPS.length - 1)) / (STRIP_STOPS.length - 1)) * STRIP_SECONDS}s` }}
            />
          ))}
        </linearGradient>
      </defs>
      <g className="wordmark__text" stroke={outline ? `url(#${id}-strip)` : 'none'}>
        <text x="143" y="73" fontSize="84" fill={`url(#${id}-king)`}>
          KING
        </text>
        <text x="143" y="131" fontSize="73.7" fill={`url(#${id}-kulbik)`}>
          KULBIK
        </text>
      </g>
    </svg>
  )
}
