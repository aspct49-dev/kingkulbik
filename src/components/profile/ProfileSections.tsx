import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import coinIcon from '../../assets/coin.svg'
import gemIcon from '../../assets/keno/gem.svg'
import { MILESTONES } from '../../data/milestones'
import { formatMultiplier } from '../../games/coinflip/engine'
import { formatPoints } from '../keno/format'
import type { PlayerBet, PlayerProfile, Redemption } from '../../../shared/profiles'
import './ProfileSections.css'

/*
 * The parts of a player's profile, shared by their account page and the
 * admin's view of them, so both always show the same thing.
 */

const usd = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const dateTime = (at: number) =>
  new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  return src ? (
    <img className="profile-avatar" src={src} width={size} height={size} alt="" />
  ) : (
    <span className="profile-avatar profile-avatar--blank" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

/** The linked Discord's id (older profiles: the account id is the Discord id) */
const profileDiscord = (p: PlayerProfile) =>
  p.discordId !== undefined ? p.discordId : /^\d{5,25}$/.test(p.id) ? p.id : null

/** Avatar, names and originals totals */
export function ProfileHeader({ profile, admin }: { profile: PlayerProfile; admin?: boolean }) {
  const net = profile.paid - profile.wagered
  return (
    <section className="profile-head">
      <Avatar src={profile.avatar} name={profile.name} size={64} />
      <div className="profile-head__text">
        <h2 className="profile-head__name">{profile.name}</h2>
        <p className="profile-head__meta">
          @{profile.username} · Member since {date(profile.firstSeen)}
          {admin && <> · {profileDiscord(profile) ? `Discord ID ${profileDiscord(profile)}` : `Account ${profile.id}`}</>}
        </p>
      </div>
      <dl className="profile-head__stats">
        <div>
          <dt>Originals bets</dt>
          <dd>{profile.bets.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>Wagered</dt>
          <dd>
            <img src={coinIcon} width={13} height={13} alt="" />
            {formatPoints(profile.wagered)}
          </dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd className={net >= 0 ? 'profile-up' : 'profile-down'}>
            {net >= 0 ? '+' : '−'}
            {formatPoints(Math.abs(net))}
          </dd>
        </div>
      </dl>
    </section>
  )
}

/** Rank Up Milestones: the highest rank reached and the way to the next */
export function MilestoneStatus({
  wagered,
  stake,
  loading,
  own,
}: {
  wagered: number | null
  stake: string | null
  loading?: boolean
  /** Viewing your own profile (shows the link prompt) */
  own?: boolean
}) {
  if (!stake) {
    return (
      <section className="profile-card profile-milestone">
        <p className="profile-empty">
          {own ? 'Link your Stake username above to track your Rank Up Milestones.' : 'No Stake account linked.'}
        </p>
      </section>
    )
  }
  if (wagered === null) {
    return (
      <section className="profile-card profile-milestone">
        <p className="profile-empty">{loading ? 'Checking the wager with Stake…' : "Couldn't reach Stake just now."}</p>
      </section>
    )
  }
  const reached = [...MILESTONES].reverse().find((m) => wagered >= m.wager) ?? null
  const next = MILESTONES.find((m) => wagered < m.wager) ?? null
  const from = reached?.wager ?? 0
  const progress = next ? Math.min(1, (wagered - from) / (next.wager - from)) : 1

  return (
    <section className={`profile-card profile-milestone profile-milestone--${(reached ?? next ?? MILESTONES[0]).tone}`}>
      <div className="profile-milestone__rank">
        {reached ? (
          <img src={reached.icon} width={34} height={34} alt="" />
        ) : (
          <span className="profile-milestone__unranked" aria-hidden />
        )}
        <span className="profile-milestone__text">
          <span className="profile-milestone__label">Current rank</span>
          <span className="profile-milestone__name">{reached ? reached.rank : 'Unranked'}</span>
        </span>
        <span className="profile-milestone__wager">
          <span className="profile-milestone__label">Wagered under KINGKULBIK</span>
          <strong>{usd(wagered)}</strong>
        </span>
      </div>
      <div
        className="profile-milestone__bar"
        role="progressbar"
        aria-label={next ? `Progress to ${next.rank}` : 'Every rank reached'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span className="profile-milestone__fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="profile-milestone__next">
        {next ? (
          <>
            {usd(next.wager - wagered)} to <strong>{next.rank}</strong> ({usd(next.prize)} prize)
          </>
        ) : (
          'Every rank reached.'
        )}{' '}
        {own && (
          <Link className="profile-link" to="/milestones">
            See all milestones
          </Link>
        )}
      </p>
    </section>
  )
}

const STATUS_LABEL: Record<Redemption['status'], string> = {
  pending: 'Pending',
  fulfilled: 'Delivered',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export function RedemptionList({
  redemptions,
  own,
  actions,
}: {
  redemptions: Redemption[]
  own?: boolean
  /** Admin controls per row */
  actions?: (r: Redemption) => ReactNode
}) {
  if (!redemptions.length) {
    return (
      <p className="profile-card profile-empty">
        {own ? (
          <>
            No redemptions yet. Spend your King Points in the{' '}
            <Link className="profile-link" to="/item-store">
              Item Store
            </Link>
            .
          </>
        ) : (
          'No redemptions yet.'
        )}
      </p>
    )
  }
  return (
    <ul className="profile-list">
      {redemptions.map((r) => (
        <li key={r.id} className="profile-row">
          <span className={`profile-row__thumb profile-row__thumb--${r.tier}`}>
            {r.itemImage && <img src={r.itemImage} width={34} height={34} alt="" loading="lazy" />}
          </span>
          <span className="profile-row__main">
            <span className="profile-row__name">{r.itemName}</span>
            <span className="profile-row__meta">
              <img src={coinIcon} width={11} height={11} alt="" /> {r.price.toLocaleString('en-US')} · {dateTime(r.at)}
              {!own && <> · {r.player} (kick: {r.kick})</>}
            </span>
            {r.note && <span className="profile-row__note">“{r.note}”</span>}
            {r.refunded && <span className="profile-row__note">{r.price.toLocaleString('en-US')} King Points refunded</span>}
            {!own && r.handledBy && (
              <span className="profile-row__note">
                {r.status === 'fulfilled' ? 'Approved' : 'Rejected'} by {r.handledBy}
              </span>
            )}
          </span>
          <span className={`profile-chip profile-chip--${r.status}`}>{STATUS_LABEL[r.status]}</span>
          {actions?.(r)}
        </li>
      ))}
    </ul>
  )
}

const PAGE = 10

/** Originals history, newest first; each row opens to what's needed to verify it */
export function BetHistory({ bets, own }: { bets: PlayerBet[]; own?: boolean }) {
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)

  if (!bets.length) {
    return (
      <p className="profile-card profile-empty">
        {own ? (
          <>
            No bets yet. Try{' '}
            <Link className="profile-link" to="/keno">
              Keno
            </Link>{' '}
            or{' '}
            <Link className="profile-link" to="/coinflip">
              Coinflip
            </Link>
            .
          </>
        ) : (
          'No originals bets yet.'
        )}
      </p>
    )
  }

  return (
    <div className="profile-bets">
      <div className="profile-bets__row profile-bets__row--head" aria-hidden>
        <span>Game</span>
        <span className="profile-bets__time">Time</span>
        <span>Bet</span>
        <span>Multiplier</span>
        <span>Payout</span>
      </div>
      <ul className="profile-bets__list">
        {bets.slice(0, shown).map((b) => {
          const expanded = open === b.id
          return (
            <li key={b.id}>
              <button
                type="button"
                className={`profile-bets__row${expanded ? ' profile-bets__row--open' : ''}`}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : b.id)}
              >
                <span className="profile-bets__game">
                  <img src={b.game === 'keno' ? gemIcon : coinIcon} width={14} height={14} alt="" />
                  {b.game === 'keno' ? 'Keno' : 'Coinflip'}
                </span>
                <span className="profile-bets__time">{dateTime(b.at)}</span>
                <span>{formatPoints(b.bet)}</span>
                <span className="profile-bets__muted">{formatMultiplier(b.multiplier)}×</span>
                <span className={b.payout > 0 ? 'profile-up' : 'profile-bets__muted'}>
                  {b.payout > 0 ? formatPoints(b.payout) : `-${formatPoints(b.bet)}`}
                </span>
              </button>
              {expanded && (
                <dl className="profile-bets__detail">
                  {b.detail.picks && (
                    <div>
                      <dt>Picks · drawn</dt>
                      <dd>
                        {b.detail.picks.join(', ')} · {b.detail.drawn?.join(', ')} ({b.detail.risk})
                      </dd>
                    </div>
                  )}
                  {b.detail.calls && (
                    <div>
                      <dt>Calls · results</dt>
                      <dd>
                        {b.detail.calls.map((c, i) => `${c} → ${b.detail.results?.[i] ?? '?'}`).join(', ') || '—'}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Server seed hash</dt>
                    <dd className="profile-bets__mono">{b.serverSeedHash}</dd>
                  </div>
                  <div>
                    <dt>Client seed · nonce</dt>
                    <dd className="profile-bets__mono">
                      {b.clientSeed} · {b.nonces.join(', ') || '—'}
                    </dd>
                  </div>
                  {own && (
                    <p className="profile-bets__hint">
                      Rotate your seeds in the game's Fairness dialog to reveal the server seed, then check this bet under
                      Verify.
                    </p>
                  )}
                </dl>
              )}
            </li>
          )
        })}
      </ul>
      {bets.length > shown && (
        <button type="button" className="profile-more" onClick={() => setShown((n) => n + PAGE * 2)}>
          Show more ({bets.length - shown} older)
        </button>
      )}
    </div>
  )
}
