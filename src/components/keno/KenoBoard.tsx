import { memo, useEffect } from 'react'
import coinIcon from '../../assets/keno/coin.png'
import gemIcon from '../../assets/keno/gem.svg'
import { TILE_COUNT } from '../../games/keno/engine'
import AnimatedNumber from '../AnimatedNumber'
import { formatMultiplier, formatPoints } from './format'
import './KenoBoard.css'

type TileState = 'idle' | 'picked' | 'drawn' | 'hit'

type KenoBoardProps = {
  picks: number[]
  /** Tiles revealed so far in the current draw */
  drawn: number[]
  /** A bet has been placed: picks show as green, hits as gems, other tiles dim */
  inRound: boolean
  /** The maximum number of tiles is picked: the rest can't be chosen */
  full: boolean
  disabled: boolean
  /** Must be stable (see useStableCallback) so unchanged tiles skip re-rendering */
  onToggle: (tile: number) => void
  /** Shown over the board after a winning round */
  win: { multiplier: number; payout: number } | null
}

const tiles = Array.from({ length: TILE_COUNT }, (_, i) => i + 1)

type TileProps = {
  tile: number
  state: TileState
  unavailable: boolean
  disabled: boolean
  onToggle: (tile: number) => void
}

/** One tile; memoized so a pick only re-renders the tile that changed. */
const Tile = memo(function Tile({ tile, state, unavailable, disabled, onToggle }: TileProps) {
  return (
    <button
      type="button"
      className={`keno-tile keno-tile--${state}`}
      aria-pressed={state === 'picked' || state === 'hit'}
      aria-disabled={unavailable || undefined}
      aria-label={`${tile}${state === 'hit' ? ', hit' : state === 'drawn' ? ', drawn' : ''}`}
      disabled={disabled}
      onClick={() => onToggle(tile)}
    >
      {/* Each visual is its own layer so it can fade/scale independently (GPU-friendly) */}
      <span className="keno-tile__fill keno-tile__fill--gold" aria-hidden />
      <span className="keno-tile__fill keno-tile__fill--green" aria-hidden />
      <span className="keno-tile__flash" aria-hidden />
      {/* Only hits carry the ring and gem: 40 hidden copies would be repainted on every change */}
      {state === 'hit' && (
        <>
          <span className="keno-tile__ring" aria-hidden />
          <img className="keno-tile__gem" src={gemIcon} alt="" aria-hidden />
        </>
      )}
      <span className="keno-tile__number">{tile}</span>
      <span className="keno-tile__dim" aria-hidden />
    </button>
  )
})

export default function KenoBoard({ picks, drawn, inRound, full, disabled, onToggle, win }: KenoBoardProps) {
  // Decode the gem up front so the first hit doesn't stall on image decoding
  useEffect(() => {
    const img = new Image()
    img.src = gemIcon
    img.decode?.().catch(() => {})
  }, [])

  const picked = new Set(picks)
  const revealed = new Set(drawn)

  return (
    <div className={`keno-board${inRound ? ' keno-board--round' : full ? ' keno-board--full' : ''}`}>
      <div className="keno-board__grid" role="group" aria-label="Keno tiles">
        {tiles.map((tile) => {
          const isPicked = picked.has(tile)
          const isDrawn = revealed.has(tile)
          const state: TileState = isPicked && isDrawn ? 'hit' : isDrawn ? 'drawn' : isPicked ? 'picked' : 'idle'
          return (
            <Tile
              key={tile}
              tile={tile}
              state={state}
              unavailable={full && !inRound && !isPicked}
              disabled={disabled}
              onToggle={onToggle}
            />
          )
        })}
      </div>

      {win && <WinCard multiplier={win.multiplier} payout={win.payout} />}
    </div>
  )
}

/** Win card: springs in while the payout counts up from 0 */
function WinCard({ multiplier, payout }: { multiplier: number; payout: number }) {
  return (
    <div className="keno-board__win" role="status" aria-label={`Won ${formatPoints(payout)} points`}>
      <span className="keno-board__win-multiplier">{formatMultiplier(multiplier)}×</span>
      <span className="keno-board__win-divider" />
      <span className="keno-board__win-payout">
        <img src={coinIcon} width={14} height={14} alt="" />
        <AnimatedNumber value={payout} format={formatPoints} duration={550} from={0} />
      </span>
    </div>
  )
}
