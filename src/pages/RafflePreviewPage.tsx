import { useState } from 'react'
import RaffleMachine from '../components/raffle/RaffleMachine'
import type { RaffleDrawShow } from '../components/raffle/RaffleMachine'

const NAMES = [
  'KingKulbik', 'Aspect', 'LuckyLuke', 'MoonShot', 'HighRoller', 'SlotQueen', 'Bonzo', 'NeonNate',
  'GoldRush', 'Tumbler', 'Spinny', 'BigWin', 'Zed', 'Maverick', 'Jackpot', 'Ritz', 'Nova', 'Echo',
  'Blaze', 'Pixel', 'Viper', 'Orbit', 'Duke', 'Rogue',
]

/** Development only: the raffle machine with demo names, to tune the render without a live raffle */
export default function RafflePreviewPage() {
  const [draw, setDraw] = useState<RaffleDrawShow | null>(null)
  return (
    <div className="section-page" style={{ width: 'min(980px, 100%)', margin: '0 auto', display: 'grid', gap: 12 }}>
      <RaffleMachine names={NAMES} draw={draw} resting={null} />
      <button
        type="button"
        className="kk-button"
        style={{ justifySelf: 'start', height: 40, padding: '0 20px' }}
        onClick={() => setDraw({ key: String(Date.now()), name: NAMES[Math.floor(Math.random() * NAMES.length)] })}
      >
        Play a draw
      </button>
    </div>
  )
}
