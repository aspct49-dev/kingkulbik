import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import accountIcon from '../assets/account/account-icon.svg'
import coinIcon from '../assets/coin.svg'
import discordIcon from '../assets/sidebar/discord.svg'
import kickIcon from '../assets/sidebar/kick.svg'
import stakeLogo from '../assets/leaderboard/stake-logo.svg'
import PageHeading from '../components/PageHeading'
import Toast, { useToast } from '../components/Toast'
import { BetHistory, MilestoneStatus, ProfileHeader, RedemptionList } from '../components/profile/ProfileSections'
import { linkKickUrl, linkStake, setPointsBalance, signInUrl, signOut, useAuth, usePoints, useStakeProgress } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import './ChallengesPage.css'
import './AccountPage.css'

/** A grey sidebar-style glyph (mask), coloured by CSS */
function Glyph({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    <span
      className="account-glyph"
      style={{ width, height, maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` }}
      aria-hidden
    />
  )
}

const usd = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Stake row: a username form until linked, then the name and wager */
function StakeLink() {
  const { user } = useAuth()
  const progress = useStakeProgress()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const stake = user?.stake

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(await linkStake(name.trim()))
    setBusy(false)
  }

  return (
    <li className="account-link account-link--stake">
      <span className="account-link__icon account-link__icon--stake">
        <img src={stakeLogo} width={35} height={17} alt="" />
      </span>
      <span className="account-link__text">
        <span className="account-link__name">Stake</span>
        <span className="account-link__detail">
          {stake
            ? `${stake.username}${progress.data ? ` · ${usd(progress.data.wagered)} wagered` : ''}`
            : 'Track your Rank Up Milestones progress'}
        </span>
      </span>
      {stake ? (
        <span className="account-link__status account-link__status--on">Connected</span>
      ) : !open ? (
        <button type="button" className="kk-button account-link__action" onClick={() => setOpen(true)}>
          Link Stake
        </button>
      ) : null}

      {!stake && open && (
        <form className="stake-form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="stake-username">
            Stake username
          </label>
          <input
            id="stake-username"
            className="stake-form__input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            placeholder="Your Stake username"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            autoFocus
          />
          <button type="submit" className="kk-button stake-form__submit" disabled={busy || !/^[A-Za-z0-9_]{3,20}$/.test(name.trim())}>
            {busy ? 'Checking…' : 'Link'}
          </button>
          <button type="button" className="stake-form__cancel" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <p className={`stake-form__hint${error ? ' stake-form__hint--error' : ''}`} role={error ? 'alert' : undefined}>
            {error ?? 'Must be registered under code KINGKULBIK. We check it with Stake.'}
          </p>
        </form>
      )}
    </li>
  )
}

/** Cancel a pending Item Store request: the King Points come back */
function CancelRedemption({ id, onDone }: { id: string; onDone: (message: string, points: number | null) => void }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const cancel = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/shop/redemptions/${id}/cancel`, { method: 'POST', credentials: 'same-origin' })
      const body = (await res.json().catch(() => ({}))) as { error?: string; points?: number | null }
      if (!res.ok) onDone(body.error ?? 'Could not cancel it. Please try again.', null)
      else onDone('Cancelled. Your King Points are back.', typeof body.points === 'number' ? body.points : null)
    } catch {
      onDone('Could not reach the server. Please try again.', null)
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }

  if (!asking) {
    return (
      <button type="button" className="profile-action" onClick={() => setAsking(true)}>
        Cancel
      </button>
    )
  }
  return (
    <span className="profile-confirm" role="group" aria-label="Cancel and get your points back?">
      <span className="profile-confirm__text">Get your points back?</span>
      <button type="button" className="profile-action profile-action--danger" disabled={busy} onClick={() => void cancel()}>
        {busy ? 'Cancelling…' : 'Yes, cancel'}
      </button>
      <button type="button" className="profile-action profile-action--quiet" disabled={busy} onClick={() => setAsking(false)}>
        Keep it
      </button>
    </span>
  )
}

const hours = (minutes: number) => `${Math.floor(minutes / 60).toLocaleString('en-US')}h ${minutes % 60}m`

/** Sign in with Discord, link Kick, see your King Points */
export default function AccountPage() {
  const { status, user } = useAuth()
  const points = usePoints()
  const profile = useProfile(Boolean(user))
  const stakeProgress = useStakeProgress()
  const { toast, show } = useToast(3200)
  const [params] = useSearchParams()
  const navigate = useNavigate()

  // Errors come back from the sign-in routes as ?auth_error=…
  const authError = params.get('auth_error')
  useEffect(() => {
    if (!authError) return
    show(authError)
    navigate('/account', { replace: true })
  }, [authError, show, navigate])

  if (status === 'loading') return <div className="section-page" aria-busy />

  return (
    <div className="section-page">
      <div className="account">
        <PageHeading icon={accountIcon} gold="YOUR" rest="ACCOUNT">
          {user ? (
            <>
              Signed in with Discord as <span className="page-heading__accent">{user.discord.name}</span>
            </>
          ) : (
            'Sign in to link your Kick and use your King Points'
          )}
        </PageHeading>

        {!user ? (
          <section className="account-signin">
            <h2 className="account-signin__title">Sign in with Discord</h2>
            <p className="account-signin__text">
              One click with your Discord account. Then link your Kick to see your King Points and use the Item Store.
            </p>
            <a className="account-button account-button--discord" href={signInUrl('/account')}>
              <img src={discordIcon} width={20} height={16} alt="" />
              Continue with Discord
            </a>
          </section>
        ) : (
          <>
            {profile.view && <ProfileHeader profile={profile.view.profile} />}

            {/* King Points from BotRix, once Kick is linked */}
            <ul className="account-stats">
              <li className="account-stat">
                <span className="account-stat__label">King Points</span>
                <span className="account-stat__value">
                  <img src={coinIcon} width={16} height={16} alt="" />
                  {user.kick
                    ? points.data
                      ? points.data.points.toLocaleString('en-US')
                      : points.status === 'error'
                        ? '—'
                        : '…'
                    : '—'}
                </span>
              </li>
              <li className="account-stat">
                <span className="account-stat__label">Watch time</span>
                <span className="account-stat__value">
                  {user.kick && points.data ? hours(points.data.watchtime) : '—'}
                </span>
              </li>
              <li className="account-stat">
                <span className="account-stat__label">Level</span>
                <span className="account-stat__value">{user.kick && points.data ? points.data.level : '—'}</span>
              </li>
            </ul>
            {user.kick && points.status === 'error' && (
              <p className="account-note">Couldn't reach BotRix just now. Your points will show again shortly.</p>
            )}
            {user.kick && points.data && !points.data.known && (
              <p className="account-note">
                BotRix hasn't seen <strong>{user.kick.username}</strong> in chat yet. Watch and chat on stream to start
                earning King Points.
              </p>
            )}

            <h2 className="account-section">Linked accounts</h2>
            <ul className="account-links">
              <li className="account-link">
                <span className="account-link__icon account-link__icon--discord">
                  <Glyph src={discordIcon} width={20} height={16} />
                </span>
                <span className="account-link__text">
                  <span className="account-link__name">Discord</span>
                  <span className="account-link__detail">@{user.discord.username}</span>
                </span>
                <span className="account-link__status account-link__status--on">Connected</span>
              </li>

              <li className="account-link">
                <span className="account-link__icon account-link__icon--kick">
                  <Glyph src={kickIcon} width={12} height={15} />
                </span>
                <span className="account-link__text">
                  <span className="account-link__name">Kick</span>
                  <span className="account-link__detail">
                    {user.kick ? `kick.com/${user.kick.username}` : 'Needed for King Points and the Item Store'}
                  </span>
                </span>
                {user.kick ? (
                  <span className="account-link__status account-link__status--on">Connected</span>
                ) : (
                  <a className="kk-button account-link__action" href={linkKickUrl('/account')}>
                    Link Kick
                  </a>
                )}
              </li>

              <StakeLink />
            </ul>
            {(user.kick || user.stake) && (
              <p className="account-note account-note--quiet">Need to change a linked account? Ask in the Discord.</p>
            )}

            <h2 className="account-section">Rank Up Milestones</h2>
            <MilestoneStatus
              stake={user.stake?.username ?? null}
              wagered={stakeProgress.data?.wagered ?? null}
              loading={stakeProgress.status === 'loading' || stakeProgress.status === 'idle'}
              own
            />

            <h2 className="account-section">Item Store redemptions</h2>
            {profile.view ? (
              <RedemptionList
                redemptions={profile.view.redemptions}
                own
                actions={(r) =>
                  r.status === 'pending' && r.charged ? (
                    <CancelRedemption
                      id={r.id}
                      onDone={(message, points) => {
                        show(message)
                        profile.refresh()
                        if (points !== null) setPointsBalance(points)
                      }}
                    />
                  ) : null
                }
              />
            ) : (
              <p className="account-note">{profile.status === 'error' ? "Couldn't load your redemptions." : 'Loading…'}</p>
            )}

            <h2 className="account-section">Originals bet history</h2>
            {profile.view ? (
              <BetHistory bets={profile.view.bets} own />
            ) : (
              <p className="account-note">{profile.status === 'error' ? "Couldn't load your bets." : 'Loading…'}</p>
            )}

            <button
              type="button"
              className="account-button account-button--dark account-signout"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  )
}
