import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { championOf, matchReady, matchesInRound, roundLabel, roundsIn } from '../../../shared/events'
import type { Match, Player } from '../../../shared/events'
import './Bracket.css'

/*
 * The bracket, drawn once for every audience (ported from Fugroo's): the
 * public page and the stream overlay show it read-only, and the admin panel
 * renders the same component with inputs in the cards. One geometry means the
 * wires always meet the cards.
 *
 * Geometry is computed, not a CSS grid: each round's cards sit centred
 * between the two that feed them, which depends on 2^round. The SVG wires use
 * the same numbers.
 */

type Geometry = { rowH: number; footH: number; colW: number; colGap: number; baseGap: number; labelH: number; winH: number }

const VIEW: Geometry = { rowH: 50, footH: 26, colW: 230, colGap: 40, baseGap: 14, labelH: 30, winH: 72 }
const EDIT: Geometry = { rowH: 66, footH: 32, colW: 280, colGap: 40, baseGap: 16, labelH: 30, winH: 72 }

const cardH = (g: Geometry) => g.rowH * 2 + 2 + g.footH
const slotPx = (g: Geometry) => cardH(g) + g.baseGap
const padTop = (g: Geometry, r: number) => (slotPx(g) / 2) * (2 ** r - 1)
const gapBetween = (g: Geometry, r: number) => slotPx(g) * 2 ** r - cardH(g)
const cardTop = (g: Geometry, r: number, i: number) => g.labelH + padTop(g, r) + i * (cardH(g) + gapBetween(g, r))
const cardCentre = (g: Geometry, r: number, i: number) => cardTop(g, r, i) + cardH(g) / 2
const rowCentre = (g: Geometry, r: number, i: number, row: 0 | 1) =>
  cardTop(g, r, i) + (row === 0 ? 1 + g.rowH / 2 : 1 + g.rowH + 1 + g.rowH / 2)

function Wires({ rounds, g, matches }: { rounds: number; g: Geometry; matches: Match[] }) {
  const firstRound = 2 ** (rounds - 1)
  const width = (rounds + 1) * g.colW + rounds * g.colGap
  const height = g.labelH + firstRound * cardH(g) + (firstRound - 1) * g.baseGap
  const parts: ReactNode[] = []

  for (let r = 0; r < rounds; r++) {
    const xRight = r * (g.colW + g.colGap) + g.colW
    const xNext = (r + 1) * (g.colW + g.colGap)
    const xMid = xRight + g.colGap / 2
    if (r < rounds - 1) {
      for (let j = 0; j < 2 ** (rounds - 2 - r); j++) {
        const top = matchesInRound(matches, r)[j * 2]
        const bottom = matchesInRound(matches, r)[j * 2 + 1]
        const topY = cardCentre(g, r, j * 2)
        const botY = cardCentre(g, r, j * 2 + 1)
        // A wire lights up once its match is decided
        parts.push(
          <g key={`w-${r}-${j}`}>
            <polyline
              className={top?.winner ? 'bracket-wire--won' : undefined}
              points={`${xRight},${topY} ${xMid},${topY} ${xMid},${rowCentre(g, r + 1, j, 0)} ${xNext},${rowCentre(g, r + 1, j, 0)}`}
            />
            <polyline
              className={bottom?.winner ? 'bracket-wire--won' : undefined}
              points={`${xRight},${botY} ${xMid},${botY} ${xMid},${rowCentre(g, r + 1, j, 1)} ${xNext},${rowCentre(g, r + 1, j, 1)}`}
            />
          </g>,
        )
      }
    } else {
      const final = matchesInRound(matches, r)[0]
      const y = cardCentre(g, r, 0)
      parts.push(<line key="w-final" className={final?.winner ? 'bracket-wire--won' : undefined} x1={xRight} y1={y} x2={xNext} y2={y} />)
    }
  }

  return (
    <svg className="bracket__wires" width={width} height={height} aria-hidden>
      {parts}
    </svg>
  )
}

export type BracketHandlers = {
  onName: (matchId: string, which: 1 | 2, name: string) => void
  onMult: (matchId: string, which: 1 | 2, value: number | null) => void
  onDecide: (matchId: string) => void
  onReset: (matchId: string) => void
  /** The slot field for one player (the admin's catalog picker) */
  renderSlot: (match: Match, which: 1 | 2) => ReactNode
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 }))

/** Multiplier field that keeps what's typed ("1.") and follows outside changes (a reset) */
function MultInput({ value, disabled, label, onChange }: { value: number | null; disabled: boolean; label: string; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => {
    setText((t) => {
      const typed = Number(t.replace(/,/g, ''))
      if (value === null) return t.trim() !== '' && Number.isFinite(typed) ? '' : t
      return typed === value ? t : String(value)
    })
  }, [value])
  return (
    <span className="bracket-mult-in">
      <input
        value={text}
        disabled={disabled}
        inputMode="decimal"
        placeholder="0"
        aria-label={label}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, '')
          setText(t)
          const n = Number(t.replace(/,/g, ''))
          onChange(t.trim() === '' || !Number.isFinite(n) ? null : n)
        }}
      />
      <span aria-hidden>×</span>
    </span>
  )
}

function Row({
  match,
  which,
  g,
  handlers,
}: {
  match: Match
  which: 1 | 2
  g: Geometry
  handlers?: BracketHandlers
}) {
  const player: Player = which === 1 ? match.player1 : match.player2
  const mult = which === 1 ? match.mult1 : match.mult2
  const side = which === 1 ? 'p1' : 'p2'
  const state = !match.winner ? 'open' : match.winner === side ? 'won' : 'lost'
  const editable = Boolean(handlers)
  const empty = !player.name.trim()
  // Names are typed in the first round; later rounds are filled by winners
  const nameEditable = editable && match.round === 0 && !match.winner

  return (
    <div className={`bracket-player bracket-player--${state}${empty ? ' bracket-player--empty' : ''}`} style={{ height: g.rowH }}>
      {player.image ? (
        <img className="bracket-player__art" src={player.image.replace('w=300', 'w=80')} width={27} height={36} alt="" loading="lazy" />
      ) : (
        <span className="bracket-player__seed" aria-hidden>
          {empty ? '–' : player.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="bracket-player__text">
        {nameEditable ? (
          <input
            className="bracket-name-in"
            value={player.name}
            placeholder="Player"
            maxLength={40}
            aria-label={`Player ${which} name`}
            onChange={(e) => handlers!.onName(match.id, which, e.target.value)}
          />
        ) : (
          <span className="bracket-player__name">{empty ? 'TBD' : player.name}</span>
        )}
        {editable && !match.winner && !empty ? (
          handlers!.renderSlot(match, which)
        ) : (
          <span className="bracket-player__slot">{player.slot || (editable ? '' : '—')}</span>
        )}
      </span>
      {editable && !match.winner && !empty ? (
        <MultInput value={mult} disabled={false} label={`Multiplier for ${player.name}`} onChange={(v) => handlers!.onMult(match.id, which, v)} />
      ) : (
        <span className="bracket-player__mult">{mult === null ? '' : `${fmt(mult)}×`}</span>
      )}
    </div>
  )
}

function MatchCard({ match, g, handlers }: { match: Match; g: Geometry; handlers?: BracketHandlers }) {
  const ready = matchReady(match)
  const scored = match.mult1 !== null && match.mult2 !== null
  const winner = match.winner === 'p1' ? match.player1.name : match.winner === 'p2' ? match.player2.name : null

  return (
    <div className={`bracket-match${match.winner ? ' bracket-match--done' : ''}`} style={{ width: g.colW, height: cardH(g) }}>
      <Row match={match} which={1} g={g} handlers={handlers} />
      <span className="bracket-match__rule" aria-hidden />
      <Row match={match} which={2} g={g} handlers={handlers} />
      <div className="bracket-match__foot" style={{ height: g.footH }}>
        {winner ? (
          handlers ? (
            <button type="button" className="bracket-foot-btn bracket-foot-btn--undo" onClick={() => handlers.onReset(match.id)}>
              {winner} won · undo
            </button>
          ) : (
            <span className="bracket-foot-note bracket-foot-note--won">{winner} advances</span>
          )
        ) : handlers && ready && scored ? (
          <button type="button" className="bracket-foot-btn" onClick={() => handlers.onDecide(match.id)}>
            Decide winner
          </button>
        ) : (
          <span className="bracket-foot-note">{!ready ? 'Awaiting players' : handlers ? 'Enter both multipliers' : 'Not played yet'}</span>
        )}
      </div>
    </div>
  )
}

/** Single-elimination bracket with wires; pass `handlers` to edit it in place */
export default function Bracket({ matches, handlers }: { matches: Match[]; handlers?: BracketHandlers }) {
  const g = handlers ? EDIT : VIEW
  const rounds = roundsIn(matches)
  const champion = championOf(matches)
  if (!rounds) return null

  return (
    <div className={`bracket${handlers ? ' bracket--edit' : ''}`}>
      <div className="bracket__canvas">
        <Wires rounds={rounds} g={g} matches={matches} />
        {Array.from({ length: rounds }, (_, r) => (
          <div className="bracket__col" key={r} style={{ width: g.colW, marginRight: g.colGap }}>
            <p className="bracket__round" style={{ height: g.labelH }}>
              {roundLabel(r, rounds)}
            </p>
            <div className="bracket__stack" style={{ paddingTop: padTop(g, r), gap: gapBetween(g, r) }}>
              {matchesInRound(matches, r).map((m) => (
                <MatchCard key={m.id} match={m} g={g} handlers={handlers} />
              ))}
            </div>
          </div>
        ))}
        <div className="bracket__col" style={{ width: g.colW }}>
          <p className="bracket__round" style={{ height: g.labelH }}>
            Champion
          </p>
          <div style={{ paddingTop: padTop(g, rounds - 1) + cardH(g) / 2 - g.winH / 2 }}>
            <div className={`bracket-champion${champion ? ' bracket-champion--crowned' : ''}`} style={{ height: g.winH }}>
              {champion?.image && <img className="bracket-player__art" src={champion.image.replace('w=300', 'w=80')} width={27} height={36} alt="" />}
              <span className="bracket-champion__text">
                <span className="bracket-champion__label">{champion ? 'Champion' : 'To be decided'}</span>
                {champion && <span className="bracket-champion__name">{champion.name}</span>}
                {champion?.slot && <span className="bracket-player__slot">{champion.slot}</span>}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
