import coinIcon from '../../assets/keno/coin.png'
import gemIcon from '../../assets/keno/gem.svg'
import { TILE_COUNT } from '../../games/keno/engine'
import { formatMultiplier, formatPoints } from './format'
import './KenoBoard.css'

type KenoBoardProps = {
  picks: number[]
  /** Tiles revealed so far in the current draw */
  drawn: number[]
  /** A bet has been placed: picks show as green, hits as gems, other tiles dim */
  inRound: boolean
  /** The maximum number of tiles is picked: the rest can't be chosen */
  full: boolean
  disabled: boolean
  onToggle: (tile: number) => void
  /** Shown over the board after a winning round */
  win: { multiplier: number; payout: number } | null
}

const tiles = Array.from({ length: TILE_COUNT }, (_, i) => i + 1)

export default function KenoBoard({ picks, drawn, inRound, full, disabled, onToggle, win }: KenoBoardProps) {
  const picked = new Set(picks)
  const revealed = new Set(drawn)

  return (
    <div className={`keno-board${inRound ? ' keno-board--round' : full ? ' keno-board--full' : ''}`}>
      <div className="keno-board__grid" role="group" aria-label="Keno tiles">
        {tiles.map((tile) => {
          const isPicked = picked.has(tile)
          const isDrawn = revealed.has(tile)
          const state = isPicked && isDrawn ? 'hit' : isDrawn ? 'drawn' : isPicked ? 'picked' : 'idle'
          return (
            <button
              key={tile}
              type="button"
              className={`keno-tile keno-tile--${state}`}
              aria-pressed={isPicked}
              aria-disabled={full && !inRound && !isPicked ? true : undefined}
              aria-label={`${tile}${state === 'hit' ? ', hit' : state === 'drawn' ? ', drawn' : ''}`}
              disabled={disabled}
              onClick={() => onToggle(tile)}
            >
              {state === 'hit' && <img className="keno-tile__gem" src={gemIcon} alt="" />}
              <span className="keno-tile__number">{tile}</span>
            </button>
          )
        })}
      </div>

      {win && (
        <div className="keno-board__win" role="status">
          <span className="keno-board__win-multiplier">{formatMultiplier(win.multiplier)}×</span>
          <span className="keno-board__win-divider" />
          <span className="keno-board__win-payout">
            <img src={coinIcon} width={14} height={14} alt="" />
            {formatPoints(win.payout)}
          </span>
        </div>
      )}
    </div>
  )
}
