import { useEffect, useState } from 'react'
import coinIcon from '../assets/keno/coin.png'
import CoinflipControls, { MIN_BET } from '../components/coinflip/CoinflipControls'
import CoinStage, { QUICK_TOSS_SECONDS, TOSS_SECONDS } from '../components/coinflip/CoinStage'
import type { Toss } from '../components/coinflip/CoinStage'
import GameToolbar, { EMPTY_STATS, recordBet } from '../components/GameToolbar'
import type { SessionStats } from '../components/GameToolbar'
import AnimatedNumber from '../components/AnimatedNumber'
import { formatPoints } from '../components/keno/format'
import {
  MAX_STREAK,
  MULTIPLIER,
  RETURN_TO_PLAYER,
  flipCoin,
  formatMultiplier,
  multiplierFor,
  randomSide,
} from '../games/coinflip/engine'
import type { Side } from '../games/coinflip/engine'
import {
  isSoundEnabled,
  playBet,
  playCashout,
  playChoose,
  playCorrect,
  playLand,
  playLose,
  playTick,
  playToss,
  preloadSounds,
  setSoundEnabled,
} from '../games/coinflip/sounds'
import { useDemoPoints } from '../hooks/useDemoPoints'
import { useStableCallback } from '../hooks/useStableCallback'
import './CoinflipPage.css'

const INSTANT_KEY = 'kk:coinflip-instant'

/** A game: started by Bet, grows with each correct call, ends on a miss or a cashout */
type Game = { bet: number; streak: number }
/** The flip in the air */
type Flip = { id: number; call: Side; result: Side }
type HistoryEntry = { id: number; result: Side; correct: boolean }
type Win = { id: number; multiplier: number; payout: number }

const parseBet = (input: string) => Number(input.replace(/,/g, ''))
const toBetInput = (value: number) => (Math.floor(value * 100) / 100).toFixed(2)
const sideLabel = (side: Side) => (side === 'heads' ? 'Heads' : 'Tails')

function readInstant() {
  try {
    return localStorage.getItem(INSTANT_KEY) === '1'
  } catch {
    return false
  }
}

export default function CoinflipPage() {
  const { balance, setBalance, reset } = useDemoPoints()
  const [betInput, setBetInput] = useState(toBetInput(MIN_BET))
  const [game, setGame] = useState<Game | null>(null)
  const [flip, setFlip] = useState<Flip | null>(null)
  const [toss, setToss] = useState<Toss | null>(null)
  const [win, setWin] = useState<Win | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS)
  const [sound, setSound] = useState(isSoundEnabled)
  const [instant, setInstant] = useState(readInstant)
  const [theater, setTheater] = useState(false)

  const flipping = !!flip
  const bet = parseBet(betInput)
  const error =
    !Number.isFinite(bet) || bet < MIN_BET
      ? `Minimum bet is ${MIN_BET} point.`
      : bet > balance
        ? 'Not enough points for this bet.'
        : null
  const canBet = !game && !error

  // Start the audio engine on the first tap, so the first sound never hitches
  useEffect(() => {
    document.addEventListener('pointerdown', preloadSounds, { once: true })
    return () => document.removeEventListener('pointerdown', preloadSounds)
  }, [])

  /** A game is over: record it (payout 0 for a miss) */
  const settle = (g: Game, payout: number) => setStats((s) => recordBet(s, g.bet, payout))

  const startGame = useStableCallback(() => {
    if (!canBet) return
    preloadSounds()
    playBet()
    setBalance((b) => b - bet)
    setWin(null)
    setHistory([])
    setGame({ bet, streak: 0 })
  })

  const call = useStableCallback((side: Side) => {
    if (!game || flipping) return
    playChoose(side)
    const id = Date.now()
    const result = flipCoin()
    setWin(null)
    setFlip({ id, call: side, result })
    setToss({ id, result })
    playToss(instant ? QUICK_TOSS_SECONDS : TOSS_SECONDS)
  })

  const cashout = useStableCallback(() => {
    if (!game || game.streak === 0 || flipping) return
    const multiplier = multiplierFor(game.streak)
    const payout = Math.round(game.bet * multiplier * 100) / 100
    setBalance((b) => b + payout)
    playCashout()
    setWin({ id: Date.now(), multiplier, payout })
    settle(game, payout)
    setGame(null)
  })

  const onLanded = useStableCallback((id: number) => {
    if (!flip || flip.id !== id || !game) return
    const correct = flip.result === flip.call
    playLand()
    setHistory((h) => [...h, { id, result: flip.result, correct }])
    setFlip(null)

    if (!correct) {
      playLose()
      settle(game, 0)
      setGame(null)
      return
    }
    const streak = game.streak + 1
    if (streak >= MAX_STREAK) {
      // Top of the ladder: pay out automatically
      const multiplier = multiplierFor(streak)
      const payout = Math.round(game.bet * multiplier * 100) / 100
      setBalance((b) => b + payout)
      playCashout()
      setWin({ id, multiplier, payout })
      settle(game, payout)
      setGame(null)
      return
    }
    playCorrect(streak)
    setGame({ ...game, streak })
  })

  const safeBet = Number.isFinite(bet) ? bet : MIN_BET

  return (
    <div className="coinflip-page">
      <section className={`coinflip${theater ? ' coinflip--theater' : ''}`} aria-label="Coinflip">
        <div className="coinflip__controls">
          <CoinflipControls
            betInput={betInput}
            onBetInputChange={(value) => setBetInput(value.replace(/[^\d.,]/g, ''))}
            onBetBlur={() => setBetInput(toBetInput(Math.max(MIN_BET, safeBet)))}
            onHalve={() => {
              playTick()
              setBetInput(toBetInput(Math.max(MIN_BET, safeBet / 2)))
            }}
            onDouble={() => {
              playTick()
              setBetInput(toBetInput(Math.max(MIN_BET, Math.min(balance, safeBet * 2))))
            }}
            game={game}
            flipping={flipping}
            calling={flip?.call ?? null}
            onCall={call}
            onRandomPick={() => call(randomSide())}
            onBet={startGame}
            onCashout={cashout}
            canBet={canBet}
            error={game ? null : error}
            balance={balance}
            onResetBalance={reset}
          />
        </div>

        <div className="coinflip__stage">
          <div className="coinflip__coin">
            <CoinStage face="heads" toss={toss} onLanded={onLanded} quick={instant} />

            {win && (
              <div key={win.id} className="coinflip-win" role="status">
                <span className="coinflip-win__multiplier">{formatMultiplier(win.multiplier)}×</span>
                <span className="coinflip-win__divider" />
                <span className="coinflip-win__payout">
                  <img src={coinIcon} width={14} height={14} alt="" />
                  <AnimatedNumber value={win.payout} format={formatPoints} duration={650} from={0} />
                </span>
              </div>
            )}
          </div>

          <div className="coinflip-history">
            <span className="coinflip-history__title">History</span>
            <ol className="coinflip-history__slots" aria-label="This game's flips">
              {Array.from({ length: MAX_STREAK }, (_, i) => {
                const h = history[i]
                return (
                  <li
                    key={h ? h.id : `empty-${i}`}
                    className={`coinflip-history__slot${h && !h.correct ? ' coinflip-history__slot--miss' : ''}`}
                  >
                    {h && (
                      <>
                        <span className={`coinflip-history__icon coinflip-history__icon--${h.result}`} aria-hidden />
                        <span className="visually-hidden">
                          {sideLabel(h.result)}
                          {h.correct ? '' : ', missed'}
                        </span>
                      </>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        <div className="coinflip__toolbar">
          <GameToolbar
            sound={sound}
            onSoundChange={(value) => {
              setSound(value)
              setSoundEnabled(value)
            }}
            instant={instant}
            onInstantChange={(value) => {
              setInstant(value)
              try {
                localStorage.setItem(INSTANT_KEY, value ? '1' : '0')
              } catch {
                // Not persisted; still applies for this visit
              }
            }}
            instantLabel="Instant flips"
            instantHint="A quick single flip instead of the full toss."
            theater={theater}
            onTheaterChange={setTheater}
            stats={stats}
            onResetStats={() => setStats(EMPTY_STATS)}
            fairness={<CoinflipFairness />}
          />
        </div>
      </section>

      <div className="coinflip-titlebar">
        <span className="coinflip-titlebar__name">
          <img src={coinIcon} width={16} height={16} alt="" />
          Coinflip
        </span>
        <span className="coinflip-titlebar__tag">King Kulbik Originals</span>
        <span className="coinflip-titlebar__rtp">RTP {(RETURN_TO_PLAYER * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
}

/** Body of the Fairness dialog: the rules and the multiplier for every streak */
function CoinflipFairness() {
  return (
    <>
      <h2>Fairness</h2>
      <p>
        Press <strong>Bet</strong> to start, then call <strong>Heads</strong> (the King Kulbik emblem) or{' '}
        <strong>Tails</strong> (the crown). Each correct call doubles your multiplier; <strong>cash out</strong> any time
        after a correct call. A wrong call loses the stake, and a streak of {MAX_STREAK} cashes out automatically.
      </p>
      <p>
        Every call is 50/50 and the multiplier after n correct calls is {RETURN_TO_PLAYER} × 2ⁿ, so the game returns{' '}
        {(RETURN_TO_PLAYER * 100).toFixed(0)}% of what's wagered on average, however long you play a streak.
      </p>
      <p>
        <strong>Demo mode:</strong> each flip happens in your browser using its cryptographic random number generator,
        and the points are a demo balance stored only on this device.
      </p>
      <h3>Multiplier by correct calls</h3>
      <div className="game-fairness__table-wrap">
        <table className="game-fairness__table">
          <thead>
            <tr>
              <th scope="col">Correct calls</th>
              <th scope="col">Multiplier</th>
              <th scope="col">Chance</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: MAX_STREAK }, (_, i) => i + 1).map((n) => (
              <tr key={n}>
                <th scope="row">{n}</th>
                <td>{n === 1 ? MULTIPLIER : formatMultiplier(multiplierFor(n))}×</td>
                <td>1 in {(2 ** n).toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
