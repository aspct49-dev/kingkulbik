import { useCountdown } from '../../hooks/useCountdown'
import './Countdown.css'

const pad = (n: number) => String(n).padStart(2, '0')

type CountdownProps = {
  /** Race end, epoch ms */
  end: number
}

export default function Countdown({ end }: CountdownProps) {
  const { days, hours, minutes, seconds } = useCountdown(end)

  const parts = [
    [days, 'DAYS'],
    [hours, 'HOURS'],
    [minutes, 'MINUTES'],
    [seconds, 'SECONDS'],
  ] as const

  return (
    <div className="countdown">
      <p className="countdown__label">LEADERBOARD ENDS IN</p>
      <p className="countdown__time" role="timer" aria-live="off">
        {parts.map(([value, unit]) => (
          <span key={unit}>
            <span className="countdown__value">{pad(value)}</span> {unit}
          </span>
        ))}
      </p>
    </div>
  )
}

/** A finished race, in the countdown's place: when it ended */
export function RaceEnded({ end }: { end: number }) {
  const day = new Date(end - 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return (
    <div className="countdown">
      <p className="countdown__label">LEADERBOARD ENDED</p>
      <p className="countdown__time">
        <span className="countdown__value">{day.toUpperCase()}</span>
      </p>
    </div>
  )
}
