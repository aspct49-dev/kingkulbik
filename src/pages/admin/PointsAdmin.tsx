import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import coinIcon from '../../assets/coin.svg'
import searchIcon from '../../assets/item-store/search.svg'
import { Avatar } from '../../components/profile/ProfileSections'
import type { PlayerProfile, PointsLogEntry } from '../../../shared/profiles'
import { adminPost } from './api'
import { Field, Input, num } from './ui'

type Viewer = { name: string; points: number; watchtime: number; level: number }
type Lookup = { viewer: Viewer | null; player: PlayerProfile | null; history: PointsLogEntry[] }

const points = (n: number) => n.toLocaleString('en-US')
const hours = (m: number) => `${Math.floor(m / 60).toLocaleString('en-US')}h ${m % 60}m`
const when = (at: number) => new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const KIND = { admin: 'Admin', redeem: 'Purchase', refund: 'Refund', originals: 'Originals' } as const

/** Look up a Kick viewer's King Points, add or take some (through BotRix), and see every change made from the site */
export default function PointsAdmin({
  initialName,
  onOpenPlayer,
  notify,
}: {
  initialName: string | null
  onOpenPlayer: (id: string) => void
  notify: (message: string) => void
}) {
  const [query, setQuery] = useState(initialName ?? '')
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<PointsLogEntry[] | null>(null)

  const loadLog = useCallback(() => {
    fetch('/api/admin/points/log', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { log: PointsLogEntry[] }) => setLog(body.log))
      .catch(() => setLog([]))
  }, [])

  const find = useCallback(async (name: string) => {
    const n = name.trim()
    if (!n) return
    setLooking(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/points?name=${encodeURIComponent(n)}`, { credentials: 'same-origin' })
      const body = (await res.json().catch(() => ({}))) as Lookup & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Lookup failed.')
      setLookup(body)
    } catch (err) {
      setLookup(null)
      setError(err instanceof Error ? err.message : 'Lookup failed.')
    } finally {
      setLooking(false)
    }
  }, [])

  useEffect(() => {
    loadLog()
    if (initialName) void find(initialName)
  }, [initialName, find, loadLog])

  return (
    <div className="admin-stack">
      <p className="admin-intro">
        King Points live in BotRix. Changes here go straight to BotRix with the channel’s bid token, and every change
        (yours, purchases and refunds) is logged below.
      </p>

      <form
        className="admin-card"
        onSubmit={(e) => {
          e.preventDefault()
          void find(query)
        }}
      >
        <h2 className="admin-card__title">Find a viewer</h2>
        <div className="admin-points-search">
          <label className="admin-input admin-input--icon">
            <img src={searchIcon} width={14} height={14} alt="" />
            <span className="visually-hidden">Kick username</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.replace(/[^\w]/g, ''))}
              placeholder="Kick username"
              autoComplete="off"
              spellCheck={false}
              maxLength={25}
            />
          </label>
          <button type="submit" className="kk-button admin-submit" disabled={looking || !query.trim()}>
            {looking ? 'Looking…' : 'Look up'}
          </button>
        </div>
        {error && <p className="admin-error">{error}</p>}
      </form>

      {lookup && (
        <ViewerCard
          key={lookup.viewer?.name ?? query}
          name={lookup.viewer?.name ?? query.trim()}
          lookup={lookup}
          onChanged={(next) => {
            setLookup((l) => (l ? { ...l, ...next } : l))
            loadLog()
          }}
          onOpenPlayer={onOpenPlayer}
          notify={notify}
        />
      )}

      <section className="admin-card">
        <h2 className="admin-card__title">
          Recent changes <span className="admin-count">from the site</span>
        </h2>
        <PointsLog entries={log} onPick={(name) => {
          setQuery(name)
          void find(name)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }} />
      </section>
    </div>
  )
}

function ViewerCard({
  name,
  lookup,
  onChanged,
  onOpenPlayer,
  notify,
}: {
  name: string
  lookup: Lookup
  onChanged: (next: Partial<Lookup>) => void
  onOpenPlayer: (id: string) => void
  notify: (message: string) => void
}) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState<'add' | 'take' | null>(null)
  const [busy, setBusy] = useState(false)
  const { viewer, player } = lookup
  const n = Math.round(num(amount))
  const valid = Number.isFinite(n) && n > 0

  const apply = async (direction: 'add' | 'take') => {
    setBusy(true)
    try {
      const delta = direction === 'add' ? n : -n
      const res = await adminPost<{ viewer: Viewer | null; history: PointsLogEntry[] }>('points', { name, delta, reason: reason.trim() })
      onChanged({ viewer: res.viewer ?? viewer, history: res.history })
      notify(`${direction === 'add' ? 'Added' : 'Took'} ${points(n)} King Points ${direction === 'add' ? 'to' : 'from'} ${name}`)
      setAmount('')
      setReason('')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'BotRix didn’t make the change.')
      onChanged({})
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <h2 className="admin-card__title">
          {viewer ? viewer.name : name}
          <span className="admin-count">{viewer ? `kick.com/${viewer.name}` : 'not on BotRix yet'}</span>
        </h2>
        {player && (
          <button type="button" className="admin-button admin-button--quiet admin-points-player" onClick={() => onOpenPlayer(player.id)}>
            <Avatar src={player.avatar} name={player.name} size={22} />
            {player.name} on the site
          </button>
        )}
      </div>

      {viewer ? (
        <ul className="admin-stats admin-stats--three">
          <li className="admin-stat">
            <span className="admin-stat__label">King Points</span>
            <span className="admin-stat__value">
              <img src={coinIcon} width={14} height={14} alt="" />
              {points(viewer.points)}
            </span>
          </li>
          <li className="admin-stat">
            <span className="admin-stat__label">Watch time</span>
            <span className="admin-stat__value">{hours(viewer.watchtime)}</span>
          </li>
          <li className="admin-stat">
            <span className="admin-stat__label">Level</span>
            <span className="admin-stat__value">{viewer.level}</span>
          </li>
        </ul>
      ) : (
        <p className="admin-note">
          BotRix hasn’t seen this name in chat, so points can’t be changed yet. They need to chat on stream first.
        </p>
      )}

      {viewer && (
        <form className="admin-points-form" onSubmit={(e: FormEvent) => e.preventDefault()}>
          <Field label="Amount">
            <Input
              value={amount}
              onChange={(v) => {
                setAmount(v.replace(/[^\d,]/g, ''))
                setConfirm(null)
              }}
              unit={<img src={coinIcon} width={14} height={14} alt="King Points" />}
              inputMode="numeric"
              placeholder="1,000"
            />
          </Field>
          <Field label="Reason (kept in the log)">
            <Input value={reason} onChange={setReason} placeholder="Giveaway win, correction…" maxLength={120} />
          </Field>
          <div className="admin-points-buttons">
            {confirm ? (
              <span className="admin-confirm" role="group">
                <span className="admin-confirm__text">
                  {confirm === 'add' ? 'Add' : 'Take'} {points(n)} {confirm === 'add' ? 'to' : 'from'} {viewer.name}?
                </span>
                <button
                  type="button"
                  className={`admin-button ${confirm === 'add' ? 'admin-button--gold' : 'admin-button--danger'}`}
                  disabled={busy}
                  autoFocus
                  onClick={() => void apply(confirm)}
                >
                  {busy ? 'Saving…' : 'Yes'}
                </button>
                <button type="button" className="admin-button admin-button--quiet" disabled={busy} onClick={() => setConfirm(null)}>
                  No
                </button>
              </span>
            ) : (
              <>
                <button type="button" className="admin-button admin-button--gold" disabled={!valid} onClick={() => setConfirm('add')}>
                  Add points
                </button>
                <button
                  type="button"
                  className="admin-button admin-button--danger"
                  disabled={!valid || n > viewer.points}
                  title={valid && n > viewer.points ? 'More than they have' : undefined}
                  onClick={() => setConfirm('take')}
                >
                  Take points
                </button>
              </>
            )}
          </div>
        </form>
      )}

      {lookup.history.length > 0 && (
        <>
          <h3 className="admin-subtitle">Changes for {viewer?.name ?? name}</h3>
          <PointsLog entries={lookup.history} />
        </>
      )}
    </section>
  )
}

function PointsLog({ entries, onPick }: { entries: PointsLogEntry[] | null; onPick?: (name: string) => void }) {
  if (!entries) return <p className="admin-empty">Loading…</p>
  if (!entries.length) return <p className="admin-empty">No changes yet.</p>
  return (
    <ul className="admin-list">
      {entries.slice(0, 100).map((e) => (
        <li key={e.id} className={`admin-row admin-points-row${e.ok ? '' : ' admin-points-row--failed'}`}>
          <span className={`admin-points-delta${e.delta > 0 ? ' admin-points-delta--up' : ''}`}>
            {e.delta > 0 ? '+' : '−'}
            {points(Math.abs(e.delta))}
          </span>
          <span className="admin-row__main">
            <span className="admin-row__name">
              {onPick ? (
                <button type="button" className="admin-link" onClick={() => onPick(e.kick)}>
                  {e.kick}
                </button>
              ) : (
                e.kick
              )}
            </span>
            <span className="admin-row__meta">
              {KIND[e.kind]}
              {e.reason && <> · {e.reason}</>} · by {e.by} · {when(e.at)}
            </span>
            {!e.ok && <span className="admin-error admin-points-error">Failed: {e.error}</span>}
          </span>
          <span className={`admin-chip${e.ok ? ' admin-chip--on' : ''}`}>{e.ok ? 'Done' : 'Failed'}</span>
        </li>
      ))}
    </ul>
  )
}
