import { memo } from 'react'
import type { CSSProperties } from 'react'
import multiplyIcon from '../../assets/keno/multiply.svg'
import gemIcon from '../../assets/keno/gem.svg'
import { MAX_PICKS } from '../../games/keno/engine'
import { formatMultiplier, formatMultiplierCompact } from './format'
import './KenoPayTable.css'

type KenoPayTableProps = {
  /** Multiplier for 0…picks hits */
  payouts: number[]
  /** Hits so far in the current round, highlighted in the table */
  hits: number | null
}

const Times = () => <img className="keno-pay__times" src={multiplyIcon} width={12} height={12} alt="" />

export default memo(function KenoPayTable({ payouts, hits }: KenoPayTableProps) {
  if (payouts.length === 0) {
    return (
      <div className="keno-pay keno-pay--empty">
        <p>Select 1 - {MAX_PICKS} numbers to play</p>
      </div>
    )
  }

  const columns = { '--columns': payouts.length } as CSSProperties

  return (
    <div className="keno-pay" style={columns}>
      <ol className="keno-pay__multipliers" aria-label="Payout multiplier per number of hits">
        {payouts.map((multiplier, i) => (
          <li key={i} className={hits === i ? 'keno-pay__cell keno-pay__cell--active' : 'keno-pay__cell'}>
            <span className="visually-hidden">{i} hits: </span>
            <span className="keno-pay__full">{formatMultiplier(multiplier)}</span>
            <span className="keno-pay__compact">{formatMultiplierCompact(multiplier)}</span>
            <Times />
          </li>
        ))}
      </ol>
      <div className="keno-pay__hits" aria-hidden>
        {payouts.map((_, i) => (
          <span key={i} className={hits === i ? 'keno-pay__hit keno-pay__hit--active' : 'keno-pay__hit'}>
            {i}
            <Times />
            <img className="keno-pay__gem" src={gemIcon} width={13} height={13} alt="" />
          </span>
        ))}
      </div>
    </div>
  )
})
