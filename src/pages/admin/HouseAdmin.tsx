import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { formatPoints } from '../../components/keno/format'
import type { HouseBucket, HouseGame, HouseRange, HouseReport } from '../../../shared/house'
import { Stat } from './BetsAdmin'
import './HouseAdmin.css'

const RANGES: { id: HouseRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'all', label: 'All time' },
]

const GAMES: { id: HouseGame; label: string }[] = [
  { id: 'all', label: 'All games' },
  { id: 'keno', label: 'Keno' },
  { id: 'coinflip', label: 'Coinflip' },
]

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatPoints(Math.abs(v))}`

/** 1,250 → 1.3k; 2,400,000 → 2.4M (axis labels) */
function compact(v: number) {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1e6) return `${sign}${Number((a / 1e6).toFixed(1))}M`
  if (a >= 1e3) return `${sign}${Number((a / 1e3).toFixed(1))}k`
  return `${sign}${Number(a.toFixed(0))}`
}

const utc = (at: number, opts: Intl.DateTimeFormatOptions) => new Date(at).toLocaleString('en-US', { ...opts, timeZone: 'UTC' })

function bucketLabel(b: HouseBucket, step: HouseReport['step'], long = false) {
  if (step === 'hour') return long ? `${utc(b.start, { month: 'short', day: 'numeric' })}, ${utc(b.start, { hour: '2-digit', minute: '2-digit', hour12: false })} UTC` : utc(b.start, { hour: '2-digit', minute: '2-digit', hour12: false })
  const day = utc(b.start, { month: 'short', day: 'numeric', ...(long ? { year: 'numeric' } : {}) })
  return step === 'week' && long ? `Week of ${day}` : day
}

/** Round tick values covering [min, max], about four steps */
function ticks(min: number, max: number) {
  if (min === max) max = min + 1
  const raw = (max - min) / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

/** The chart's drawable width, kept in step with its card */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Originals house results over a timeframe: totals, profit per hour/day/week, and the running total */
export default function HouseAdmin() {
  const [range, setRange] = useState<HouseRange>('7d')
  const [game, setGame] = useState<HouseGame>('all')
  const [report, setReport] = useState<HouseReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<number | null>(null)

  const load = useCallback(async (r: HouseRange, g: HouseGame) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/house?range=${r}&game=${g}`, { credentials: 'same-origin' })
      const body = (await res.json().catch(() => ({}))) as { report?: HouseReport; error?: string }
      if (!res.ok || !body.report) throw new Error(body.error ?? 'Couldn’t load the house results.')
      setReport(body.report)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load the house results.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setActive(null)
    void load(range, game)
  }, [range, game, load])

  const t = report?.totals
  const per = report ? { hour: 'hour', day: 'day', week: 'week' }[report.step] : 'day'

  return (
    <div className="admin-stack">
      <div className="house-filters">
        <Tabs label="Timeframe" options={RANGES} value={range} onChange={setRange} />
        <Tabs label="Game" options={GAMES} value={game} onChange={setGame} />
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!report && !error && <div className="admin-loading" aria-label="Loading" />}

      {report && t && (
        // While a new timeframe loads, the last one stays, dimmed: no jump, no flash
        <div className={`admin-stack house${loading ? ' house--loading' : ''}`} aria-busy={loading}>
          <ul className="admin-stats">
            <Stat label="House profit" value={signed(t.wagered - t.paid)} coin tone={t.wagered - t.paid >= 0 ? 'up' : 'down'} />
            <Stat label="Wagered" value={formatPoints(t.wagered)} coin />
            <Stat label="Paid out" value={formatPoints(t.paid)} coin />
            <Stat label="Bets" value={t.bets.toLocaleString('en-US')} />
            <Stat label="Kept" value={t.wagered ? `${(((t.wagered - t.paid) / t.wagered) * 100).toFixed(1)}%` : '—'} />
          </ul>
          <p className="admin-note">
            King Points from the originals (Keno and Coinflip), in UTC. Profit is what players wagered minus what they
            were paid.
            {report.earliest !== null && <> Counted from {utc(report.earliest, { month: 'short', day: 'numeric', year: 'numeric' })}.</>}
          </p>

          <section className="admin-card house-card">
            <div className="house-card__head">
              <h2 className="admin-card__title">Profit per {per}</h2>
              <ul className="house-legend">
                <li>
                  <span className="house-legend__key house-legend__key--up" /> House up
                </li>
                <li>
                  <span className="house-legend__key house-legend__key--down" /> House down
                </li>
              </ul>
            </div>
            <ProfitBars report={report} active={active} onActive={setActive} />
          </section>

          <section className="admin-card house-card">
            <div className="house-card__head">
              <h2 className="admin-card__title">Running total</h2>
            </div>
            <RunningTotal report={report} active={active} onActive={setActive} />
          </section>

          <details className="admin-card house-table">
            <summary>Show as a table</summary>
            <div className="house-table__scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{per[0].toUpperCase() + per.slice(1)}</th>
                    <th scope="col">Profit</th>
                    <th scope="col">Wagered</th>
                    <th scope="col">Paid out</th>
                    <th scope="col">Bets</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.buckets].reverse().map((b) => (
                    <tr key={b.start}>
                      <th scope="row">{bucketLabel(b, report.step, true)}</th>
                      <td>{signed(b.profit)}</td>
                      <td>{formatPoints(b.wagered)}</td>
                      <td>{formatPoints(b.paid)}</td>
                      <td>{b.bets.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

function Tabs<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="kk-tabs admin-picker" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className={`kk-tab${o.id === value ? ' kk-tab--selected' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- charts

const HEIGHT = 200
const PAD = { top: 12, right: 12, bottom: 26, left: 52 }
const plotHeight = HEIGHT - PAD.top - PAD.bottom

type ChartProps = { report: HouseReport; active: number | null; onActive: (i: number | null) => void }

/** Pointer and arrow keys pick a bucket; both charts share it, so their readouts line up */
function useHover(count: number, width: number, onActive: (i: number | null) => void, active: number | null) {
  const band = (width - PAD.left - PAD.right) / count
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left
    onActive(x < 0 || x > band * count ? null : Math.min(count - 1, Math.floor(x / band)))
  }
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const from = active ?? (e.key === 'ArrowLeft' ? count : -1)
    onActive(Math.max(0, Math.min(count - 1, from + (e.key === 'ArrowLeft' ? -1 : 1))))
  }
  return { band, onPointerMove, onKeyDown, onPointerLeave: () => onActive(null), onBlur: () => onActive(null) }
}

function Axes({ width, scale, values, report }: { width: number; scale: (v: number) => number; values: number[]; report: HouseReport }) {
  const n = report.buckets.length
  const band = (width - PAD.left - PAD.right) / n
  // Every date on a short range; otherwise about five, always the first and last
  const labelled = new Set(n <= 10 ? report.buckets.map((_, i) => i) : [0, ...[1, 2, 3].map((k) => Math.round((k * (n - 1)) / 4)), n - 1])
  return (
    <g className="house-axes" aria-hidden>
      {values.map((v) => (
        <g key={v}>
          <line className={v === 0 ? 'house-axes__zero' : 'house-axes__grid'} x1={PAD.left} x2={width - PAD.right} y1={scale(v)} y2={scale(v)} />
          <text className="house-axes__y" x={PAD.left - 8} y={scale(v)} dy="0.32em">
            {compact(v)}
          </text>
        </g>
      ))}
      {report.buckets.map((b, i) =>
        labelled.has(i) ? (
          <text
            key={b.start}
            className="house-axes__x"
            x={PAD.left + band * (i + 0.5)}
            y={HEIGHT - 6}
            textAnchor={i === 0 && n > 10 ? 'start' : i === n - 1 && n > 10 ? 'end' : 'middle'}
          >
            {bucketLabel(b, report.step)}
          </text>
        ) : null,
      )}
    </g>
  )
}

/** A bar from the zero line, its far end rounded (4 px) */
function barPath(x: number, w: number, y0: number, y1: number) {
  const up = y1 < y0
  const h = Math.abs(y1 - y0)
  const r = Math.min(4, w / 2, h)
  if (up) return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`
}

const TIP_WIDTH = 180

/** Beside the hovered bar (right, or left when there's no room), never over it */
function Tooltip({ report, index, x, band, width, value, valueLabel }: { report: HouseReport; index: number; x: number; band: number; width: number; value: string; valueLabel: string }) {
  const b = report.buckets[index]
  const right = x + band / 2 + 10
  const left = right + TIP_WIDTH <= width ? right : Math.max(0, x - band / 2 - 10 - TIP_WIDTH)
  return (
    <div className="house-tip" style={{ left }} role="status">
      <strong className="house-tip__value">{value}</strong>
      <span className="house-tip__label">
        {valueLabel} · {bucketLabel(b, report.step, true)}
      </span>
      <span className="house-tip__row">
        Wagered <b>{formatPoints(b.wagered)}</b>
      </span>
      <span className="house-tip__row">
        Paid out <b>{formatPoints(b.paid)}</b>
      </span>
      <span className="house-tip__row">
        Bets <b>{b.bets.toLocaleString('en-US')}</b>
      </span>
    </div>
  )
}

function ProfitBars({ report, active, onActive }: ChartProps) {
  const [ref, width] = useWidth()
  const n = report.buckets.length
  const hover = useHover(n, width, onActive, active)
  const values = ticks(Math.min(0, ...report.buckets.map((b) => b.profit)), Math.max(0, ...report.buckets.map((b) => b.profit)))
  const lo = values[0]
  const hi = values[values.length - 1]
  const scale = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * plotHeight
  // Thin bars with a 2 px gap between them
  const barW = Math.max(1, Math.min(18, hover.band - 2))
  const profit = report.totals.wagered - report.totals.paid

  return (
    <div ref={ref} className="house-chart">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          tabIndex={0}
          role="img"
          aria-label={`House profit per ${report.step}: ${signed(profit)} King Points over the range. Use the arrow keys for each ${report.step}, or open the table below.`}
          onPointerMove={hover.onPointerMove}
          onPointerLeave={hover.onPointerLeave}
          onKeyDown={hover.onKeyDown}
          onBlur={hover.onBlur}
        >
          {active !== null && <rect className="house-chart__wash" x={PAD.left + hover.band * active} y={PAD.top} width={hover.band} height={plotHeight} />}
          <Axes width={width} scale={scale} values={values} report={report} />
          {report.buckets.map((b, i) =>
            b.profit === 0 ? null : (
              <path
                key={b.start}
                className={`house-bar house-bar--${b.profit > 0 ? 'up' : 'down'}${active === i ? ' house-bar--active' : ''}`}
                d={barPath(PAD.left + hover.band * i + (hover.band - barW) / 2, barW, scale(0), scale(b.profit))}
              />
            ),
          )}
        </svg>
      )}
      {active !== null && width > 0 && (
        <Tooltip
          report={report}
          index={active}
          x={PAD.left + hover.band * (active + 0.5)}
          band={hover.band}
          width={width}
          value={signed(report.buckets[active].profit)}
          valueLabel="House profit"
        />
      )}
    </div>
  )
}

function RunningTotal({ report, active, onActive }: ChartProps) {
  const [ref, width] = useWidth()
  const n = report.buckets.length
  const hover = useHover(n, width, onActive, active)
  const running: number[] = []
  report.buckets.forEach((b, i) => running.push(Math.round(((running[i - 1] ?? 0) + b.profit) * 100) / 100))
  const values = ticks(Math.min(0, ...running), Math.max(0, ...running))
  const lo = values[0]
  const hi = values[values.length - 1]
  const scale = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * plotHeight
  const x = (i: number) => PAD.left + hover.band * (i + 0.5)
  const line = running.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${scale(v)}`).join(' ')

  return (
    <div ref={ref} className="house-chart">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          tabIndex={0}
          role="img"
          aria-label={`Running total of house profit: ${signed(running[n - 1] ?? 0)} King Points by the end of the range.`}
          onPointerMove={hover.onPointerMove}
          onPointerLeave={hover.onPointerLeave}
          onKeyDown={hover.onKeyDown}
          onBlur={hover.onBlur}
        >
          <Axes width={width} scale={scale} values={values} report={report} />
          <path className="house-line" d={line} />
          {active !== null && (
            <>
              <line className="house-crosshair" x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotHeight} />
              <circle className="house-dot" cx={x(active)} cy={scale(running[active])} r={4} />
            </>
          )}
        </svg>
      )}
      {active !== null && width > 0 && (
        <Tooltip report={report} index={active} x={x(active)} band={hover.band} width={width} value={signed(running[active])} valueLabel="Running total" />
      )}
    </div>
  )
}
