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
