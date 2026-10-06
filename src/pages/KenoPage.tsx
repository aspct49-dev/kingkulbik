import { useEffect, useRef, useState } from 'react'
import KenoControls from '../components/keno/KenoControls'
import KenoBoard from '../components/keno/KenoBoard'
import KenoPayTable from '../components/keno/KenoPayTable'
import Toast, { useToast } from '../components/Toast'
import gemIcon from '../assets/keno/gem.svg'
import GameTitleBar from '../components/GameTitleBar'
import GameToolbar, { EMPTY_STATS, recordBet } from '../components/GameToolbar'
import type { SessionStats } from '../components/GameToolbar'
import { formatMultiplier, formatPoints } from '../components/keno/format'
import FairnessPanel from '../components/FairnessPanel'
import LiveBets from '../components/LiveBets'
import { DRAW_COUNT, MAX_PICKS, RISKS, TILE_COUNT, drawTiles } from '../games/keno/engine'
import type { Risk } from '../games/keno/engine'
import { formatKingPoints, postOriginals, usePlayBalance } from '../games/originals'
import { kenoPayouts } from '../../shared/originals'
import type { GameRules } from '../../shared/originals'
import { useOriginalsRules } from '../hooks/useContent'
import { refreshLiveBets } from '../hooks/useLiveBets'
import {
  isSoundEnabled,
  playBet,
  playGemHit,
  playReveal,
  playSelect,
  playTick,
  playWin,
  preloadSounds,
  setSoundEnabled,
} from '../games/keno/sounds'
import { useStableCallback } from '../hooks/useStableCallback'
import './KenoPage.css'

const REVEAL_MS = 100
/** Pause after Bet so the gold → blue crossfade settles before the first reveal (counted from the click, so it overlaps the wait for the server) */
const REVEAL_LEAD_MS = 220
const AUTO_PICK_MS = 120
const INSTANT_KEY = 'kk:keno-instant'

type Round = {
  id: number
  bet: number
  picks: number[]
  risk: Risk
  drawn: number[]
  revealed: number
  /** Settled by the server; shown once the last tile is revealed */
  outcome: { hits: number; multiplier: number; payout: number }
  result: { hits: number; multiplier: number; payout: number } | null
}

type KenoResponse = { drawn: number[]; hits: number; multiplier: number; payout: number }

// Bets are whole King Points
const parseBet = (input: string) => Number(input.replace(/,/g, ''))
const toBetInput = (value: number) => String(Math.max(0, Math.floor(value)))

function readInstant() {
  try {
    return localStorage.getItem(INSTANT_KEY) === '1'
  } catch {
    return false
  }
}

export default function KenoPage() {
  const { balance, setBalance, gate, ready } = usePlayBalance('/keno')
  const rules = useOriginalsRules().keno
  const { minBet, maxBet } = rules
  const [picks, setPicks] = useState<number[]>([])
  const [risk, setRisk] = useState<Risk>('medium')
  const [betInput, setBetInput] = useState(toBetInput(minBet))
  // Waiting for the server to settle the bet
  const [placing, setPlacing] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [round, setRound] = useState<Round | null>(null)
  const [instant, setInstant] = useState(readInstant)
  const [sound, setSound] = useState(isSoundEnabled)
  const [theater, setTheater] = useState(false)
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS)
  const settledRef = useRef(0)
  const betAtRef = useRef(0)
  // Random Pick places its tiles one at a time
  const [autoPicking, setAutoPicking] = useState(false)
  const autoPickTimers = useRef<number[]>([])
  useEffect(() => () => autoPickTimers.current.forEach(window.clearTimeout), [])

  // Start the audio engine on the first tap, so the first sound never hitches
  useEffect(() => {
    document.addEventListener('pointerdown', preloadSounds, { once: true })
    return () => document.removeEventListener('pointerdown', preloadSounds)
  }, [])

  const drawing = placing || (!!round && round.revealed < DRAW_COUNT)
  const busy = drawing || autoPicking
  const bet = parseBet(betInput)

  // Over the maximum the Bet button still works, and says so in a toast (as Stake does)
  const overMax = bet > maxBet
  const { toast, show: showToast } = useToast(3200)
  const error = gate
    ? gate.reason
    : !rules.enabled
      ? 'Keno is closed right now.'
      : !Number.isInteger(bet) || bet < minBet
        ? `Bets are whole King Points, at least ${formatKingPoints(minBet)}.`
        : ready && !overMax && bet > balance
          ? 'Not enough King Points for this bet.'
          : null
  const canBet = ready && !busy && picks.length > 0 && !error

  // Reveal the draw one tile at a time, then settle the round once
  useEffect(() => {
    if (!round) return
    if (round.revealed < DRAW_COUNT) {
      const id = window.setTimeout(
        () => setRound((r) => (r && r.id === round.id ? { ...r, revealed: instant ? DRAW_COUNT : r.revealed + 1 } : r)),
        instant ? 0 : round.revealed === 0 ? Math.max(0, REVEAL_LEAD_MS - (Date.now() - betAtRef.current)) : REVEAL_MS,
      )
      return () => window.clearTimeout(id)
    }
    if (round.result || settledRef.current === round.id) return
    settledRef.current = round.id

    const { hits, multiplier, payout } = round.outcome
    refreshLiveBets()

    if (payout > 0) {
      setBalance((b) => b + payout)
      playWin()
    }
    setStats((s) => recordBet(s, round.bet, payout))
    setRound({ ...round, result: { hits, multiplier, payout } })
  }, [round, instant, setBalance])

  // One sound per revealed tile: a pop for a miss, the gem chime for a hit
  const lastSoundRef = useRef({ id: 0, revealed: 0 })
  useEffect(() => {
    if (!round || round.revealed === 0) return
    const last = lastSoundRef.current
    const from = last.id === round.id ? last.revealed : 0
    if (round.revealed <= from) return
    lastSoundRef.current = { id: round.id, revealed: round.revealed }

    const picked = new Set(round.picks)
    const newTiles = round.drawn.slice(from, round.revealed)
    const hitsBefore = round.drawn.slice(0, from).filter((t) => picked.has(t)).length
    const newHits = newTiles.filter((t) => picked.has(t)).length
    // Instant draws reveal everything at once: one sound, not ten stacked
    if (newHits > 0) playGemHit(hitsBefore + newHits)
    else playReveal(round.revealed - 1)
  }, [round])

  const handleBet = useStableCallback(async () => {
    if (!canBet) return
    if (overMax) return showToast(`The bet amount must not be greater than ${formatKingPoints(maxBet)} King Points.`)
    preloadSounds()
    playBet()
    betAtRef.current = Date.now()
    setServerError(null)
    setPlacing(true)
    setRound(null)
    setBalance((b) => b - bet)
    const roundPicks = [...picks]
    const res = await postOriginals<KenoResponse>('keno', { picks: roundPicks, risk, bet })
    setPlacing(false)
    if (!res.ok) {
      setBalance((b) => b + bet) // nothing was played
      setServerError(res.error)
      return
    }
    const { drawn, hits, multiplier, payout } = res.data
    setRound({
      id: Date.now(),
      bet,
      picks: roundPicks,
      risk,
      // Reveal in reading order (top-left, row by row). Same draw, only the order shown changes.
      drawn: [...drawn].sort((a, b) => a - b),
      revealed: 0,
      outcome: { hits, multiplier, payout },
      result: null,
    })
  })

  const togglePick = useStableCallback((tile: number) => {
    if (busy) return
    const picking = !picks.includes(tile)
    if (picking && picks.length >= MAX_PICKS) return
    playSelect(picking, picking ? picks.length + 1 : picks.length - 1)
    preloadSounds()
    setRound(null) // a new selection starts a new round
    setPicks((current) =>
      current.includes(tile)
        ? current.filter((t) => t !== tile)
        : current.length < MAX_PICKS
          ? [...current, tile]
          : current,
    )
  })

  const randomPick = useStableCallback(() => {
    if (busy) return
    preloadSounds()
    setRound(null)
    const chosen = drawTiles(MAX_PICKS)
    if (instant) {
      setPicks(chosen)
      playSelect(true, 1)
      return
    }
    setPicks([])
    setAutoPicking(true)
    autoPickTimers.current = chosen.map((tile, i) =>
      window.setTimeout(() => {
        setPicks((current) => [...current, tile])
        playSelect(true, i + 1)
        if (i === chosen.length - 1) setAutoPicking(false)
      }, i * AUTO_PICK_MS),
    )
  })

  const clampBet = (value: number) => Math.min(maxBet, Math.max(minBet, Number.isFinite(value) ? value : minBet))
  // Leaving the field rounds up to the minimum but keeps a bet over the maximum, so Bet can say why it won't go
  const raiseToMin = (value: number) => Math.max(minBet, Number.isFinite(value) ? value : minBet)
  const onBetInputChange = useStableCallback((value: string) => {
    setServerError(null)
    setBetInput(value.replace(/[^\d,]/g, ''))
  })
  const onBetBlur = useStableCallback(() => setBetInput(toBetInput(raiseToMin(bet))))
  const onHalve = useStableCallback(() => {
    playTick()
    setBetInput(toBetInput(clampBet((Number.isFinite(bet) ? bet : minBet) / 2)))
  })
  const onDouble = useStableCallback(() => {
    playTick()
    setBetInput(toBetInput(clampBet(Math.min(balance, (Number.isFinite(bet) ? bet : minBet) * 2))))
  })
  const onRiskChange = useStableCallback((next: Risk) => {
    playTick()
    setRisk(next)
    setRound(null)
  })
  const onClear = useStableCallback(() => {
    playTick()
    setRound(null)
    setPicks([])
  })
  const onInstantChange = useStableCallback((value: boolean) => {
    setInstant(value)
    try {
      localStorage.setItem(INSTANT_KEY, value ? '1' : '0')
    } catch {
      // Not persisted; still applies for this visit
    }
  })
  const onSoundChange = useStableCallback((value: boolean) => {
    setSound(value)
    setSoundEnabled(value)
  })
  const onResetStats = useStableCallback(() => setStats(EMPTY_STATS))

  const revealedTiles = round ? round.drawn.slice(0, round.revealed) : []
  const hitsSoFar = round ? round.picks.filter((tile) => revealedTiles.includes(tile)).length : null

  const result = round?.result
  const win = result && result.payout > 0 ? { multiplier: result.multiplier, payout: result.payout } : null

  return (
    <div className="keno-page">
      <h1 className="visually-hidden">Keno</h1>
      <section className={`keno${theater ? ' keno--theater' : ''}`} aria-label="Keno">
        <div className="keno__controls">
          <KenoControls
            betInput={betInput}
            onBetInputChange={onBetInputChange}
            onBetBlur={onBetBlur}
            onHalve={onHalve}
            onDouble={onDouble}
            risk={risk}
            onRiskChange={onRiskChange}
            onRandomPick={randomPick}
            onClear={onClear}
            onBet={handleBet}
            canBet={canBet}
            busy={busy}
            drawing={drawing}
            error={serverError ?? (picks.length > 0 ? error : null)}
            balance={balance}
            gate={gate}
            rules={rules}
          />
        </div>

        <div className="keno__game">
          <KenoBoard
            picks={round ? round.picks : picks}
            drawn={revealedTiles}
            inRound={!!round}
            full={!round && picks.length >= MAX_PICKS}
            disabled={busy}
            onToggle={togglePick}
            win={win}
          />
          <KenoPayTable
            payouts={kenoPayouts(round ? round.risk : risk, (round ? round.picks : picks).length, rules.houseEdge)}
            hits={hitsSoFar}
          />
        </div>

        <div className="keno__toolbar">
          <GameToolbar
            sound={sound}
            onSoundChange={onSoundChange}
            instant={instant}
            onInstantChange={onInstantChange}
            instantLabel="Instant draws"
            instantHint={`Show all ${DRAW_COUNT} drawn tiles at once instead of one by one.`}
            theater={theater}
            onTheaterChange={setTheater}
            stats={stats}
            onResetStats={onResetStats}
            fairness={<KenoFairness risk={risk} rules={rules} />}
          />
        </div>

        <p className="visually-hidden" aria-live="polite">
          {result &&
            (result.payout > 0
              ? `${result.hits} hits. Won ${formatPoints(result.payout)} points at ${formatMultiplier(result.multiplier)}×.`
              : `${result.hits} hits. No win this round.`)}
        </p>
      </section>

      <GameTitleBar name="Keno" icon={gemIcon} rtp={1 - rules.houseEdge} wide={theater} />

      <LiveBets wide={theater} />

      <Toast toast={toast} tone="error" />
    </div>
  )
}

/** Body of Keno's Fairness dialog: seeds, verification, and every payout under the current rules */
function KenoFairness({ risk, rules }: { risk: Risk; rules: GameRules }) {
  const riskLabel = RISKS.find((r) => r.id === risk)?.label
  return (
    <FairnessPanel game="keno" rules={rules}>
      <p>
        Pick 1–{MAX_PICKS} of the {TILE_COUNT} tiles, then {DRAW_COUNT} tiles are drawn. Your payout is your bet times
        the multiplier for how many of your picks were hit, up to the max win.
      </p>
      <p>
        <strong>King Points:</strong> your bet comes off your BotRix balance when you play and wins are paid back
        to it. Bets are whole points and wins are rounded down.
      </p>
      <h3>{riskLabel} payouts</h3>
      <div className="game-fairness__table-wrap">
        <table className="game-fairness__table">
          <thead>
            <tr>
              <th scope="col">Picks</th>
              <th scope="col">Multiplier by hits (0, 1, 2 …)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: MAX_PICKS }, (_, i) => i + 1).map((picks) => (
              <tr key={picks}>
                <th scope="row">{picks}</th>
                <td>{kenoPayouts(risk, picks, rules.houseEdge).map(formatMultiplier).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FairnessPanel>
  )
}
