import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { coinflipSide, kenoDraw, sha256Hex } from '../../shared/originals'
import type { GameId, GameRules } from '../../shared/originals'
import { rotateSeed, useFairness } from '../games/originals'
import { formatPoints } from './keno/format'
import './FairnessPanel.css'

type Tab = 'seeds' | 'verify' | 'rules'

const TABS: { id: Tab; label: string }[] = [
  { id: 'seeds', label: 'Seeds' },
  { id: 'verify', label: 'Verify' },
  { id: 'rules', label: 'Rules' },
]

const GAME_LABEL: Record<GameId, string> = { keno: 'Keno', coinflip: 'Coinflip' }

type VerifyInput = { game: GameId; serverSeed: string; clientSeed: string; nonce: string }

/**
 * The Fairness dialog's body for an original: the seed pair in use, a
 * calculator that recomputes any bet from revealed seeds, and the house rules
 * with the game's own pay table (`children`).
 */
export default function FairnessPanel({ game, rules, children }: { game: GameId; rules: GameRules; children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('seeds')
  const [verify, setVerify] = useState<VerifyInput>({ game, serverSeed: '', clientSeed: '', nonce: '0' })

  return (
    <div className="fair">
      <h2>Fairness</h2>
      <div className="kk-tabs fair__tabs" role="tablist" aria-label="Fairness">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`fair-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`fair-panel-${t.id}`}
            className={`kk-tab${tab === t.id ? ' kk-tab--selected' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`fair-panel-${tab}`} aria-labelledby={`fair-tab-${tab}`}>
        {tab === 'seeds' && (
          <Seeds
            onVerify={(input) => {
              setVerify({ ...input, game })
              setTab('verify')
            }}
          />
        )}
        {tab === 'verify' && <Verify input={verify} onChange={setVerify} />}
        {tab === 'rules' && <Rules game={game} rules={rules}>{children}</Rules>}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="fair-field">
      <span className="fair-field__label">{label}</span>
      <input className="fair-input" value={value} readOnly onFocus={(e) => e.currentTarget.select()} />
    </label>
  )
}

function Seeds({ onVerify }: { onVerify: (input: Omit<VerifyInput, 'game'>) => void }) {
  const fairness = useFairness()
  const [clientSeed, setClientSeed] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)

  useEffect(() => {
    if (fairness) setClientSeed((current) => current || fairness.clientSeed)
  }, [fairness])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const error = await rotateSeed(clientSeed.trim())
    setBusy(false)
    setMessage(error ? { error: true, text: error } : { error: false, text: 'New seed pair in use. The old server seed is revealed below.' })
    if (!error) setClientSeed('')
  }

  if (!fairness) return <p className="fair__loading">Loading seeds…</p>
  const previous = fairness.previous

  return (
    <>
      <p>
        Every result comes from your seed pair. The server seed is fixed and shown only as its SHA-256 hash before
        you bet, so it can't be changed afterwards; your client seed and the bet number (nonce) go into each result.
        Rotate the pair to reveal the server seed and check every bet you made with it.
      </p>

      <Field label="Active server seed (SHA-256 hash)" value={fairness.serverSeedHash} />
      <form className="fair-rotate" onSubmit={submit}>
        <label className="fair-field fair-rotate__field">
          <span className="fair-field__label">Client seed</span>
          <input
            className="fair-input"
            value={clientSeed}
            maxLength={32}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setClientSeed(e.target.value.replace(/[^\w-]/g, ''))}
          />
        </label>
        <label className="fair-field fair-rotate__nonce">
          <span className="fair-field__label">Bets made</span>
          <input className="fair-input" value={fairness.nonce} readOnly />
        </label>
        <button type="submit" className="kk-button fair-rotate__button" disabled={busy}>
          {busy ? 'Rotating…' : 'Rotate seeds'}
        </button>
      </form>
      {message && (
        <p className={`fair__message${message.error ? ' fair__message--error' : ''}`} role="status">
          {message.text}
        </p>
      )}

      <h3>Previous seed pair</h3>
      {previous ? (
        <>
          <Field label="Server seed (revealed)" value={previous.serverSeed} />
          <Field label="Its SHA-256 hash (the one shown while you played)" value={previous.serverSeedHash} />
          <div className="fair-pair">
            <Field label="Client seed" value={previous.clientSeed} />
            <Field label="Bets made" value={String(previous.nonce)} />
          </div>
          <button
            type="button"
            className="fair__link"
            onClick={() => onVerify({ serverSeed: previous.serverSeed, clientSeed: previous.clientSeed, nonce: '0' })}
          >
            Verify these bets →
          </button>
        </>
      ) : (
        <p>Nothing revealed yet. Rotate your seeds to reveal the current server seed.</p>
      )}
    </>
  )
}

type Outcome = { hash: string; game: GameId; tiles?: number[]; side?: 'heads' | 'tails' }

function Verify({ input, onChange }: { input: VerifyInput; onChange: (next: VerifyInput) => void }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const nonce = Number(input.nonce)
  const valid = input.serverSeed.trim() !== '' && input.clientSeed.trim() !== '' && Number.isInteger(nonce) && nonce >= 0

  // Recompute as the inputs change (WebCrypto is fast; nothing leaves the browser)
  useEffect(() => {
    if (!valid) {
      setOutcome(null)
      return
    }
    let cancelled = false
    const server = input.serverSeed.trim()
    const client = input.clientSeed.trim()
    void (async () => {
      const hash = await sha256Hex(server)
      const next: Outcome =
        input.game === 'keno'
          ? { hash, game: 'keno', tiles: await kenoDraw(server, client, nonce) }
          : { hash, game: 'coinflip', side: await coinflipSide(server, client, nonce) }
      if (!cancelled) setOutcome(next)
    })()
    return () => {
      cancelled = true
    }
  }, [input, nonce, valid])

  const set = (key: keyof VerifyInput) => (e: { target: { value: string } }) => onChange({ ...input, [key]: e.target.value })

  return (
    <>
      <p>
        Recompute any bet from a revealed server seed, your client seed and the bet's nonce (0 for the first bet with
        a pair, then 1, 2 …). This runs in your browser with the same code the server uses.
      </p>
      <div className="kk-tabs fair__games" role="radiogroup" aria-label="Game">
        {(['keno', 'coinflip'] as const).map((g) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={input.game === g}
            className={`kk-tab${input.game === g ? ' kk-tab--selected' : ''}`}
            onClick={() => onChange({ ...input, game: g })}
          >
            {GAME_LABEL[g]}
          </button>
        ))}
      </div>
      <label className="fair-field">
        <span className="fair-field__label">Server seed</span>
        <input className="fair-input" value={input.serverSeed} onChange={set('serverSeed')} spellCheck={false} autoComplete="off" />
      </label>
      <div className="fair-pair">
        <label className="fair-field">
          <span className="fair-field__label">Client seed</span>
          <input className="fair-input" value={input.clientSeed} onChange={set('clientSeed')} spellCheck={false} autoComplete="off" />
        </label>
        <label className="fair-field">
          <span className="fair-field__label">Nonce</span>
          <input className="fair-input" value={input.nonce} onChange={set('nonce')} inputMode="numeric" autoComplete="off" />
        </label>
      </div>

      {outcome ? (
        <div className="fair-result" aria-live="polite">
          <span className="fair-field__label">Server seed hash</span>
          <code className="fair-result__hash">{outcome.hash}</code>
          <span className="fair-field__label">Result</span>
          {outcome.tiles ? (
            <ol className="fair-result__tiles" aria-label="Drawn tiles, in draw order">
              {outcome.tiles.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          ) : (
            <p className="fair-result__side">
              <span className={`fair-result__coin fair-result__coin--${outcome.side}`} aria-hidden />
              {outcome.side === 'heads' ? 'Heads' : 'Tails'}
            </p>
          )}
        </div>
      ) : (
        <p className="fair__loading">Enter a server seed, client seed and nonce to see the result.</p>
      )}
    </>
  )
}

function Rules({ game, rules, children }: { game: GameId; rules: GameRules; children: ReactNode }) {
  return (
    <>
      <p>
        The originals are for fun with King Points: the house edge is high and every bet and win is capped, so playing
        them is never a shortcut to the Item Store.
      </p>
      <dl className="fair-rules">
        <div>
          <dt>Return to player</dt>
          <dd>{((1 - rules.houseEdge) * 100).toFixed(1).replace(/\.0$/, '')}%</dd>
        </div>
        <div>
          <dt>Bet</dt>
          <dd>
            {formatPoints(rules.minBet)} – {formatPoints(rules.maxBet)}
          </dd>
        </div>
        <div>
          <dt>Max win {game === 'coinflip' ? 'per game' : 'per bet'}</dt>
          <dd>{formatPoints(rules.maxWin)}</dd>
        </div>
      </dl>
      {children}
    </>
  )
}
