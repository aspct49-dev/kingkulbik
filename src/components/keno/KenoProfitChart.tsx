import { useId, useState } from 'react'
import type { PointerEvent } from 'react'
import { formatPoints } from './format'
import './KenoProfitChart.css'

type KenoProfitChartProps = {
  /** Cumulative profit after each bet, starting with 0 before the first bet */
  history: number[]
}

const W = 272
const H = 120
const PAD_Y = 10

const signed = (value: number) => `${value >= 0 ? '+' : '−'}${formatPoints(Math.abs(value))}`

/**
 * Session profit over bets: one line, green above the zero baseline and red
 * below (via two clip regions), with a crosshair tooltip on hover.
 */
export default function KenoProfitChart({ history }: KenoProfitChartProps) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)

  if (history.length < 2) {
    return <p className="keno-chart__empty">Place a bet to start the graph.</p>
  }

  const n = history.length
  const min = Math.min(0, ...history)
  const max = Math.max(0, ...history)
  const span = max - min || 1
  const x = (i: number) => (i / (n - 1)) * W
  const y = (v: number) => PAD_Y + ((max - v) / span) * (H - PAD_Y * 2)
  const zero = y(0)

  const line = history.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join('')
  const area = `${line}L${W},${zero}L0,${zero}Z`
  const above = `${id}-above`
  const below = `${id}-below`

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    setHover(Math.round(ratio * (n - 1)))
  }

  const current = history[n - 1]
  const hv = hover !== null ? history[hover] : null

  return (
    <div className="keno-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Profit over ${n - 1} bets, now ${signed(current)} points`}
      >
        <defs>
          <clipPath id={above}>
            <rect x="0" y="0" width={W} height={zero} />
          </clipPath>
          <clipPath id={below}>
            <rect x="0" y={zero} width={W} height={H - zero} />
          </clipPath>
        </defs>

        <path d={area} className="keno-chart__area keno-chart__area--up" clipPath={`url(#${above})`} />
        <path d={area} className="keno-chart__area keno-chart__area--down" clipPath={`url(#${below})`} />
        <line x1="0" x2={W} y1={zero} y2={zero} className="keno-chart__zero" />
        <path d={line} className="keno-chart__line keno-chart__line--up" clipPath={`url(#${above})`} />
        <path d={line} className="keno-chart__line keno-chart__line--down" clipPath={`url(#${below})`} />

        {hover !== null && hv !== null && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} className="keno-chart__crosshair" />
        )}
        <rect
          x="0"
          y="0"
          width={W}
          height={H}
          className="keno-chart__hit"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hover !== null && hv !== null && (
        <>
          <span
            className={`keno-chart__dot ${hv >= 0 ? 'is-up' : 'is-down'}`}
            style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(hv) / H) * 100}%` }}
          />
          <div
            className="keno-chart__tooltip"
            style={{ left: `${Math.min(82, Math.max(18, (x(hover) / W) * 100))}%` }}
          >
            <span>{hover === 0 ? 'Start' : `Bet ${hover}`}</span>
            <strong>{signed(hv)}</strong>
          </div>
        </>
      )}
    </div>
  )
}
