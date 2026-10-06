import { useEffect, useState } from 'react'
import coinIcon from '../assets/coin.svg'
import CoinflipControls from '../components/coinflip/CoinflipControls'
import CoinStage, { QUICK_TOSS_SECONDS, TOSS_SECONDS } from '../components/coinflip/CoinStage'
import type { Toss } from '../components/coinflip/CoinStage'
import GameTitleBar from '../components/GameTitleBar'
import WinCard from '../components/WinCard'
import GameToolbar, { EMPTY_STATS, recordBet } from '../components/GameToolbar'
import type { SessionStats } from '../components/GameToolbar'
import FairnessPanel from '../components/FairnessPanel'
import LiveBets from '../components/LiveBets'
import { formatPoints } from '../components/keno/format'
import { MAX_STREAK, formatMultiplier, randomSide } from '../games/coinflip/engine'
import type { Side } from '../games/coinflip/engine'
import { formatKingPoints, postOriginals, usePlayBalance } from '../games/originals'
import { coinflipMultiplier } from '../../shared/originals'
import type { GameRules } from '../../shared/originals'
import { useOriginalsRules } from '../hooks/useContent'
import { refreshLiveBets } from '../hooks/useLiveBets'
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
import { useStableCallback } from '../hooks/useStableCallback'
import './CoinflipPage.css'

const INSTANT_KEY = 'kk:coinflip-instant'

/** A game: started by Bet, grows with each correct call, ends on a miss or a cashout */
type Game = { bet: number; streak: number }
/** The flip in the air, with the server's verdict to apply when it lands */
type Flip = { id: number; call: Side; result: Side; outcome: FlipResponse }
type FlipResponse = { result: Side; won: boolean; streak: number; multiplier?: number; payout?: number; cashedOut?: boolean }
type HistoryEntry = { id: number; result: Side; correct: boolean }
type Win = { id: number; multiplier: number; payout: number }

// Bets are whole King Points
const parseBet = (input: string) => Number(input.replace(/,/g, ''))
const toBetInput = (value: number) => String(Math.max(0, Math.floor(value)))
const sideLabel = (side: Side) => (side === 'heads' ? 'Heads' : 'Tails')

function readInstant() {
  try {
    return localStorage.getItem(INSTANT_KEY) === '1'
  } catch {
    return false
  }
}

export default function CoinflipPage() {
  const { balance, setBalance, gate, ready } = usePlayBalance('/coinflip')
  const rules = useOriginalsRules().coinflip
  const { minBet, maxBet } = rules
  const [betInput, setBetInput] = useState(toBetInput(minBet))
  // Waiting on the server (start, flip or cashout)
  const [pending, setPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [flip, setFlip] = useState<Flip | null>(null)
  const [toss, setToss] = useState<Toss | null>(null)
  const [win, setWin] = useState<Win | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS)
  const [sound, setSound] = useState(isSoundEnabled)
  const [instant, setInstant] = useState(readInstant)
  const [theater, setTheater] = useState(false)

  const flipping = !!flip || pending
  const bet = parseBet(betInput)
  const error = gate
    ? gate.reason
    : !rules.enabled
      ? 'Coinflip is closed right now.'
      : !Number.isInteger(bet) || bet < minBet
        ? `Bets are whole King Points, at least ${formatKingPoints(minBet)}.`
        : bet > maxBet
          ? `Maximum bet is ${formatKingPoints(maxBet)} King Points.`
          : ready && bet > balance
            ? 'Not enough King Points for this bet.'
            : null
  const canBet = ready && !game && !pending && !error

  // A game left running (reload, another tab) carries on: its bet was already taken
  useEffect(() => {
    void postOriginals<{ game: Game | null }>('coinflip', { action: 'state' }).then((res) => {
      if (res.ok && res.data.game) setGame(res.data.game)
    })
  }, [])

  // Start the audio engine on the first tap, so the first sound never hitches
  useEffect(() => {
    document.addEventListener('pointerdown', preloadSounds, { once: true })
    return () => document.removeEventListener('pointerdown', preloadSounds)
  }, [])

  /** A game is over: record it (payout 0 for a miss) */
  const settle = (g: Game, payout: number) => {
    setStats((s) => recordBet(s, g.bet, payout))
    refreshLiveBets()
  }

  const startGame = useStableCallback(async () => {
    if (!canBet) return
    preloadSounds()
    playBet()
    setServerError(null)
    setPending(true)
    const res = await postOriginals<{ game: Game }>('coinflip', { action: 'start', bet })
    setPending(false)
    if (!res.ok) {
      setServerError(res.error)
      return
    }
    setBalance((b) => b - res.data.game.bet)
    setWin(null)
    setHistory([])
    setGame(res.data.game)
  })

  const call = useStableCallback(async (side: Side) => {
    if (!game || flipping) return
    playChoose(side)
    setServerError(null)
    setPending(true)
    const res = await postOriginals<FlipResponse>('coinflip', { action: 'flip', side })
    setPending(false)
    if (!res.ok) {
      setServerError(res.error)
      // The server has no game (e.g. it was settled in another tab)
      if (res.status === 409) setGame(null)
      return
    }
    const id = Date.now()
    setWin(null)
    setFlip({ id, call: side, result: res.data.result, outcome: res.data })
    setToss({ id, result: res.data.result })
    playToss(instant ? QUICK_TOSS_SECONDS : TOSS_SECONDS)
  })

  const cashout = useStableCallback(async () => {
    if (!game || game.streak === 0 || flipping) return
    setServerError(null)
    setPending(true)
    const res = await postOriginals<{ payout: number; multiplier: number }>('coinflip', { action: 'cashout' })
    setPending(false)
    if (!res.ok) {
      setServerError(res.error)
      if (res.status === 409) setGame(null)
      return
    }
    const { payout, multiplier } = res.data
    setBalance((b) => b + payout)
    playCashout()
    setWin({ id: Date.now(), multiplier, payout })
    settle(game, payout)
    setGame(null)
  })

  const onLanded = useStableCallback((id: number) => {
    if (!flip || flip.id !== id || !game) return
    const { outcome } = flip
    playLand()
    setHistory((h) => [...h, { id, result: flip.result, correct: outcome.won }])
    setFlip(null)

    if (!outcome.won) {
      playLose()
      settle(game, 0)
      setGame(null)
      return
    }
    if (outcome.cashedOut) {
      // Top of the ladder or the max win: the server paid out
      const payout = outcome.payout ?? 0
      setBalance((b) => b + payout)
      playCashout()
      setWin({ id, multiplier: outcome.multiplier ?? 0, payout })
      settle(game, payout)
      setGame(null)
      return
    }
    playCorrect(outcome.streak)
    setGame({ ...game, streak: outcome.streak })
  })

  const safeBet = Number.isFinite(bet) ? bet : minBet
  const clampBet = (value: number) => Math.min(maxBet, Math.max(minBet, value))

  return (
    <div className="coinflip-page">
      <h1 className="visually-hidden">Coinflip</h1>
      <section className={`coinflip${theater ? ' coinflip--theater' : ''}`} aria-label="Coinflip">
        <div className="coinflip__controls">
          <CoinflipControls
            betInput={betInput}
            onBetInputChange={(value) => {
              setServerError(null)
              setBetInput(value.replace(/[^\d,]/g, ''))
            }}
            onBetBlur={() => setBetInput(toBetInput(clampBet(safeBet)))}
            onHalve={() => {
              playTick()
              setBetInput(toBetInput(clampBet(safeBet / 2)))
            }}
            onDouble={() => {
              playTick()
              setBetInput(toBetInput(clampBet(Math.min(balance, safeBet * 2))))
            }}
            game={game}
            flipping={flipping}
            calling={flip?.call ?? null}
            rules={rules}
            onCall={call}
            onRandomPick={() => call(randomSide())}
            onBet={startGame}
            onCashout={cashout}
            canBet={canBet}
            error={serverError ?? (game ? null : error)}
            balance={balance}
            gate={gate}
          />
        </div>

        <div className="coinflip__stage">
          <div className="coinflip__coin">
            <CoinStage face="heads" toss={toss} onLanded={onLanded} quick={instant} />

            {win && (
              <WinCard
                key={win.id}
                className="coinflip__win"
                multiplier={formatMultiplier(win.multiplier)}
                payout={win.payout}
              />
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
            fairness={<CoinflipFairness rules={rules} />}
          />
        </div>
      </section>

      <GameTitleBar name="Coinflip" icon={coinIcon} rtp={1 - rules.houseEdge} wide={theater} />

      <LiveBets wide={theater} />
    </div>
  )
}

/** Body of the Fairness dialog: seeds, verification, the rules and the multiplier for every streak */
function CoinflipFairness({ rules }: { rules: GameRules }) {
  const rtp = 1 - rules.houseEdge
  return (
    <FairnessPanel game="coinflip" rules={rules}>
      <p>
        Press <strong>Bet</strong> to start, then call <strong>Heads</strong> (the King Kulbik emblem) or{' '}
        <strong>Tails</strong> (the crown). Each correct call doubles your multiplier; <strong>cash out</strong> any time
        after a correct call. A wrong call loses the stake, and a streak of {MAX_STREAK} cashes out automatically.
      </p>
      <p>
        Every call is 50/50 and the multiplier after n correct calls is {rtp.toFixed(2)} × 2ⁿ, so the game returns{' '}
        {(rtp * 100).toFixed(0)}% of what's wagered on average. A game pays at most {formatPoints(rules.maxWin)} points,
        and it cashes out by itself once it gets there.
      </p>
      <p>
        <strong>King Points:</strong> your bet comes off your BotRix balance when the game starts and your cashout
        is paid back to it. Bets are whole points and wins are rounded down.
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
                <td>{formatMultiplier(coinflipMultiplier(n, rules.houseEdge))}×</td>
                <td>1 in {(2 ** n).toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FairnessPanel>
  )
}
