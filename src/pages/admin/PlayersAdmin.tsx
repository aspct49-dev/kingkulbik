import { useEffect, useState } from 'react'
import searchIcon from '../../assets/item-store/search.svg'
import { Avatar, BetHistory, MilestoneStatus, ProfileHeader, RedemptionList } from '../../components/profile/ProfileSections'
import { formatPoints } from '../../components/keno/format'
import type { PlayerProfile, ProfileView } from '../../../shared/profiles'
import RedemptionActions from './RedemptionActions'
import type { Redemption } from '../../../shared/profiles'

const ago = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60_000)
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** Every signed-in player: search, then open one to see their history */
export default function PlayersAdmin({
  playerId,
  onOpen,
  onPoints,
  notify,
}: {
  playerId: string | null
  onOpen: (id: string | null) => void
  /** Open the King Points panel for a Kick name */
  onPoints: (kick: string) => void
  notify: (message: string) => void
}) {
  return playerId ? (
    <PlayerDetail id={playerId} onBack={() => onOpen(null)} onPoints={onPoints} notify={notify} />
  ) : (
    <PlayerList onOpen={onOpen} />
  )
}

function PlayerList({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [players, setPlayers] = useState<PlayerProfile[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    const id = window.setTimeout(() => {
      fetch(`/api/admin/players?q=${encodeURIComponent(query.trim())}`, { credentials: 'same-origin', signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((body: { players: PlayerProfile[] }) => {
          setPlayers(body.players)
          setFailed(false)
        })
        .catch((err) => err.name !== 'AbortError' && setFailed(true))
    }, 200)
    return () => {
      window.clearTimeout(id)
      ctrl.abort()
    }
  }, [query])

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <div className="admin-card__head">
          <h2 className="admin-card__title">
            Players {players && <span className="admin-count">{players.length} shown</span>}
          </h2>
        </div>
        <label className="admin-input admin-input--icon">
          <img src={searchIcon} width={14} height={14} alt="" />
          <span className="visually-hidden">Search players</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Discord name, Kick, Stake or Discord ID"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {failed ? (
          <p className="admin-error">Couldn't load players.</p>
        ) : !players ? (
          <p className="admin-empty">Loading…</p>
        ) : players.length === 0 ? (
          <p className="admin-empty">{query.trim() ? `Nobody matches “${query.trim()}”.` : 'Nobody has signed in yet.'}</p>
        ) : (
          <ul className="admin-list">
            {players.map((p) => (
              <li key={p.id}>
                <button type="button" className="admin-row admin-row--button" onClick={() => onOpen(p.id)}>
                  <Avatar src={p.avatar} name={p.name} size={40} />
                  <span className="admin-row__main">
                    <span className="admin-row__name">{p.name}</span>
                    <span className="admin-row__meta">
                      @{p.username}
                      {p.kick && <> · Kick {p.kick.username}</>}
                      {p.stake && <> · Stake {p.stake.username}</>}
                    </span>
                  </span>
                  <span className="admin-row__figures">
                    <span>{p.bets.toLocaleString('en-US')} bets</span>
                    <span>{formatPoints(p.wagered)} wagered</span>
                  </span>
                  <span className="admin-chip">{ago(p.lastSeen)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function PlayerDetail({
  id,
  onBack,
  onPoints,
  notify,
}: {
  id: string
  onBack: () => void
  onPoints: (kick: string) => void
  notify: (message: string) => void
}) {
  const [view, setView] = useState<ProfileView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setView(null)
    setError(null)
    fetch(`/api/admin/players/${id}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { view?: ProfileView; error?: string }
        if (!r.ok || !body.view) throw new Error(body.error ?? "Couldn't load this player.")
        setView(body.view)
      })
      .catch((err: Error) => setError(err.message))
  }, [id])

  const replace = (next: Redemption[]) =>
    setView((v) => (v ? { ...v, redemptions: next.filter((r) => r.userId === id) } : v))

  return (
    <div className="admin-stack">
      <div>
        <button type="button" className="admin-button admin-button--quiet admin-back" onClick={onBack}>
          ← All players
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {!view && !error && <div className="admin-loading" aria-label="Loading" />}
      {view && (
        <>
          <ProfileHeader profile={view.profile} admin />
          <section className="admin-card">
            <div className="admin-card__head">
              <h2 className="admin-card__title">Linked accounts</h2>
              {view.profile.kick && (
                <button type="button" className="admin-button" onClick={() => onPoints(view.profile.kick!.username)}>
                  King Points
                </button>
              )}
            </div>
            <p className="admin-note">
              Discord <strong className="admin-strong">@{view.profile.username}</strong> · Kick{' '}
              <strong className="admin-strong">{view.profile.kick?.username ?? 'not linked'}</strong> · Stake{' '}
              <strong className="admin-strong">{view.profile.stake?.username ?? 'not linked'}</strong>
            </p>
          </section>
          <section className="admin-card">
            <h2 className="admin-card__title">Rank Up Milestones</h2>
            <MilestoneStatus stake={view.profile.stake?.username ?? null} wagered={view.wagered} />
          </section>
          <section className="admin-card">
            <h2 className="admin-card__title">
              Redemptions <span className="admin-count">{view.redemptions.length}</span>
            </h2>
            <RedemptionList
              redemptions={view.redemptions}
              actions={(r) => <RedemptionActions redemption={r} onChange={replace} notify={notify} />}
            />
          </section>
          <section className="admin-card">
            <h2 className="admin-card__title">
              Originals bets <span className="admin-count">latest {view.bets.length}</span>
            </h2>
            <BetHistory bets={view.bets} />
          </section>
        </>
      )}
    </div>
  )
}
