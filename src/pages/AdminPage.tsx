import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import adminIcon from '../assets/admin/admin-icon.svg'
import coinIcon from '../assets/coin.svg'
import gemIcon from '../assets/keno/gem.svg'
import PageHeading from '../components/PageHeading'
import Toast, { useToast } from '../components/Toast'
import { discordUrl } from '../hooks/useAuth'
import { setChallenges, setOriginalsRules, setStoreItems } from '../hooks/useContent'
import { useLiveBets } from '../hooks/useLiveBets'
import { formatPoints } from '../components/keno/format'
import { loadAdmin } from './admin/api'
import type { AdminData, AdminStatus } from './admin/api'
import BetsAdmin, { Stat } from './admin/BetsAdmin'
import ChallengesAdmin from './admin/ChallengesAdmin'
import GiveawayAdmin from './admin/GiveawayAdmin'
import GuessAdmin from './admin/GuessAdmin'
import HuntAdmin from './admin/HuntAdmin'
import OverlaysAdmin from './admin/OverlaysAdmin'
import PlayersAdmin from './admin/PlayersAdmin'
import PointsAdmin from './admin/PointsAdmin'
import RafflesAdmin from './admin/RafflesAdmin'
import RedemptionsAdmin from './admin/RedemptionsAdmin'
import RulesAdmin from './admin/RulesAdmin'
import ShopAdmin from './admin/ShopAdmin'
import TournamentsAdmin from './admin/TournamentsAdmin'
import './ChallengesPage.css'
import './AdminPage.css'
import './admin/AdminSections.css'

type Tab =
  | 'overview'
  | 'players'
  | 'redemptions'
  | 'points'
  | 'challenges'
  | 'store'
  | 'originals'
  | 'bets'
  | 'hunt'
  | 'guess'
  | 'tournaments'
  | 'raffles'
  | 'giveaway'
  | 'overlays'

const GROUPS: { title: string; tabs: { id: Tab; label: string }[] }[] = [
  {
    title: 'Site',
    tabs: [
      { id: 'overview', label: 'Overview' },
      { id: 'players', label: 'Players' },
      { id: 'redemptions', label: 'Redemptions' },
      { id: 'points', label: 'King Points' },
      { id: 'challenges', label: 'Challenges' },
      { id: 'store', label: 'Item Store' },
    ],
  },
  {
    title: 'Originals',
    tabs: [
      { id: 'originals', label: 'Rules' },
      { id: 'bets', label: 'Live Bets' },
    ],
  },
  {
    title: 'Stream',
    tabs: [
      { id: 'hunt', label: 'Bonus Hunt' },
      { id: 'guess', label: 'Guess the Balance' },
      { id: 'tournaments', label: 'Tournaments' },
      { id: 'raffles', label: 'Raffles' },
      { id: 'giveaway', label: 'Chat Giveaway' },
      { id: 'overlays', label: 'Overlays' },
    ],
  },
]

const TABS = GROUPS.flatMap((g) => g.tabs)
const isTab = (value: string | null): value is Tab => TABS.some((t) => t.id === value)

/** Run the site and the stream (admins from ADMIN_DISCORD_IDS only) */
export default function AdminPage() {
  const [status, setStatus] = useState<AdminStatus>({ kind: 'loading' })
  const [params, setParams] = useSearchParams()
  const tab: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'overview'
  const playerId = params.get('player')
  const { toast, show } = useToast(2200)

  useEffect(() => {
    void loadAdmin().then(setStatus)
  }, [])

  const update = useCallback((patch: Partial<AdminData>) => {
    setStatus((s) => (s.kind === 'ready' ? { kind: 'ready', data: { ...s.data, ...patch } } : s))
  }, [])
  const setPending = useCallback((pending: number) => update({ pending }), [update])
  const setGiveaway = useCallback((giveaway: AdminData['giveaway']) => update({ giveaway }), [update])

  const goTo = (next: Tab, extra: Record<string, string> = {}) => {
    setParams(next === 'overview' ? {} : { tab: next, ...extra }, { replace: !extra.player })
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="section-page">
      {/* The bracket gets the full width */}
      <div className={`admin${tab === 'tournaments' ? ' admin--wide' : ''}`}>
        <PageHeading icon={adminIcon} gold="ADMIN" rest="PANEL">
          The site, the <span className="page-heading__accent">ORIGINALS</span> and the stream, all in one place.
        </PageHeading>

        {status.kind === 'loading' && <div className="admin-loading" aria-label="Loading" />}

        {status.kind === 'signed-out' && (
          <Gate title="Sign in to continue" text="The admin panel is for the King Kulbik team. Sign in with Discord.">
            <a className="kk-button store-gate__button" href={discordUrl('/admin')}>
              Sign in with Discord
            </a>
          </Gate>
        )}

        {status.kind === 'forbidden' && (
          <Gate
            title="Admins only"
            text={
              status.discordId
                ? 'This account isn’t on the admin list, or it signed in with Kick: admins sign in with Discord.'
                : 'Admins sign in with Discord.'
            }
          >
            {!status.discordId && (
              <a className="kk-button store-gate__button" href={discordUrl('/admin')}>
                Sign in with Discord
              </a>
            )}
            {status.discordId && (
              <p className="admin-gate__id">
                Your Discord ID: <code>{status.discordId}</code>
                <span>
                  To make it an admin, add it to <code>ADMIN_DISCORD_IDS</code> (in <code>.env.local</code>, or the
                  Vercel environment variables) and restart the server.
                </span>
              </p>
            )}
          </Gate>
        )}

        {status.kind === 'error' && (
          <Gate title="Something went wrong" text={status.message}>
            <button type="button" className="kk-button store-gate__button" onClick={() => void loadAdmin().then(setStatus)}>
              Try again
            </button>
          </Gate>
        )}

        {status.kind === 'ready' && (
          <div className="admin-layout">
            <nav className="admin-nav" aria-label="Admin sections">
              {GROUPS.map((g) => (
                <div className="admin-nav__group" key={g.title}>
                  <p className="admin-nav__title">{g.title}</p>
                  {g.tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-current={tab === t.id ? 'page' : undefined}
                      className={`admin-nav__item${tab === t.id ? ' admin-nav__item--active' : ''}`}
                      onClick={() => goTo(t.id)}
                    >
                      {t.label}
                      {t.id === 'redemptions' && status.data.pending > 0 && (
                        <span className="admin-nav__badge">{status.data.pending}</span>
                      )}
                      {t.id === 'giveaway' && status.data.giveaway?.open && <span className="admin-nav__live" aria-label="running" />}
                    </button>
                  ))}
                </div>
              ))}
            </nav>

            <div className="admin-main" id="admin-panel">
              {tab === 'overview' && <Overview data={status.data} goTo={goTo} />}
              {tab === 'players' && (
                <PlayersAdmin
                  playerId={playerId}
                  onPoints={(kick) => goTo('points', { kick })}
                  onOpen={(id) => (id ? goTo('players', { player: id }) : goTo('players'))}
                  notify={show}
                />
              )}
              {tab === 'points' && (
                <PointsAdmin
                  key={params.get('kick') ?? ''}
                  initialName={params.get('kick')}
                  onOpenPlayer={(id) => goTo('players', { player: id })}
                  notify={show}
                />
              )}
              {tab === 'redemptions' && (
                <RedemptionsAdmin onOpenPlayer={(id) => goTo('players', { player: id })} onPending={setPending} notify={show} />
              )}
              {tab === 'challenges' && (
                <ChallengesAdmin
                  challenges={status.data.challenges}
                  onChange={(challenges) => {
                    update({ challenges })
                    setChallenges(challenges)
                  }}
                  notify={show}
                />
              )}
              {tab === 'store' && (
                <ShopAdmin
                  items={status.data.shop}
                  onChange={(shop) => {
                    update({ shop })
                    setStoreItems(shop)
                  }}
                  notify={show}
                />
              )}
              {tab === 'originals' && (
                <RulesAdmin
                  rules={status.data.rules}
                  onChange={(rules) => {
                    update({ rules })
                    setOriginalsRules(rules)
                  }}
                  notify={show}
                />
              )}
              {tab === 'bets' && <BetsAdmin notify={show} />}
              {tab === 'hunt' && <HuntAdmin hunts={status.data.hunts} onChange={(hunts) => update({ hunts })} notify={show} />}
              {tab === 'guess' && (
                <GuessAdmin
                  rounds={status.data.guesses}
                  hunts={status.data.hunts}
                  onChange={(guesses) => update({ guesses })}
                  notify={show}
                />
              )}
              {tab === 'tournaments' && (
                <TournamentsAdmin
                  tournaments={status.data.tournaments}
                  onChange={(tournaments) => update({ tournaments })}
                  notify={show}
                />
              )}
              {tab === 'raffles' && <RafflesAdmin notify={show} />}
              {tab === 'giveaway' && <GiveawayAdmin giveaway={status.data.giveaway} onChange={setGiveaway} notify={show} />}
              {tab === 'overlays' && <OverlaysAdmin notify={show} />}
            </div>
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  )
}

function Gate({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <section className="store-gate">
      <img src={adminIcon} width={42} height={42} alt="" />
      <h2 className="store-gate__title">{title}</h2>
      <p className="store-gate__text">{text}</p>
      {children}
    </section>
  )
}

/** Status cards for each area, like Fugroo's overview */
function Overview({ data, goTo }: { data: AdminData; goTo: (tab: Tab) => void }) {
  const bets = useLiveBets() ?? data.feed
  const wagered = bets.reduce((sum, b) => sum + b.bet, 0)
  const house = wagered - bets.reduce((sum, b) => sum + b.payout, 0)
  const active = data.challenges.filter((c) => c.status === 'active')
  const inStore = data.shop.filter((i) => !i.hidden)
  const soldOut = data.shop.filter((i) => i.stock === 0).length
  const prizePool = active.reduce((sum, c) => sum + c.reward, 0)

  return (
    <div className="admin-stack">
      <ul className="admin-stats">
        <Stat label="Players" value={data.players.toLocaleString('en-US')} />
        <Stat label="Redemptions waiting" value={String(data.pending)} tone={data.pending ? 'down' : undefined} />
        <Stat label="Active challenges" value={String(active.length)} />
        <Stat label="Open prize pool" value={`$${prizePool.toLocaleString('en-US')}`} />
        <Stat
          label="House result (recent)"
          value={`${house >= 0 ? '+' : '−'}${formatPoints(Math.abs(house))}`}
          coin
          tone={house >= 0 ? 'up' : 'down'}
        />
      </ul>

      <div className="admin-overview">
        <OverviewCard
          title="Challenges"
          lines={[
            `${active.length} active, ${data.challenges.length - active.length} completed`,
            active.length ? `Biggest prize: $${Math.max(...active.map((c) => c.reward)).toLocaleString('en-US')}` : 'None running',
          ]}
          action="Manage challenges"
          onAction={() => goTo('challenges')}
        />
        <OverviewCard
          title="Item Store"
          lines={[
            `${inStore.length} in the store, ${data.shop.length - inStore.length} hidden`,
            soldOut ? `${soldOut} sold out` : 'Nothing sold out',
          ]}
          action="Manage items"
          onAction={() => goTo('store')}
        />
        <OverviewCard
          title="Originals"
          lines={(['keno', 'coinflip'] as const).map((g) => {
            const r = data.rules[g]
            return (
              <span className="admin-overview__game" key={g}>
                <img src={g === 'keno' ? gemIcon : coinIcon} width={13} height={13} alt="" />
                {g === 'keno' ? 'Keno' : 'Coinflip'}: {r.enabled ? `${Math.round(r.houseEdge * 1000) / 10}% edge, max win ${r.maxWin.toLocaleString('en-US')}` : 'closed'}
              </span>
            )
          })}
          action="Edit rules"
          onAction={() => goTo('originals')}
        />
        <OverviewCard
          title="Live bets"
          lines={[`${bets.length} recent bets`, `${formatPoints(wagered)} wagered`]}
          action="Open the feed"
          onAction={() => goTo('bets')}
        />
      </div>

      <h2 className="admin-heading">Stream</h2>
      <div className="admin-overview">
        <OverviewCard
          title="Bonus hunt"
          lines={
            data.hunts[0]
              ? [data.hunts[0].name, `${data.hunts[0].bonuses.length} bonuses · ${data.hunts[0].status}`]
              : ['No hunt yet']
          }
          action="Run the hunt"
          onAction={() => goTo('hunt')}
        />
        <OverviewCard
          title="Guess the balance"
          lines={(() => {
            const r = data.guesses.find((g) => g.status !== 'drawn') ?? data.guesses[0]
            return r ? [r.name, `${r.guesses.length} guesses · ${r.status}`] : ['No round yet']
          })()}
          action="Manage rounds"
          onAction={() => goTo('guess')}
        />
        <OverviewCard
          title="Tournaments"
          lines={
            data.tournaments[0]
              ? [data.tournaments[0].name, `${data.tournaments[0].size} players · ${data.tournaments[0].status}`]
              : ['No bracket yet']
          }
          action="Open brackets"
          onAction={() => goTo('tournaments')}
        />
        <OverviewCard
          title="Giveaway"
          lines={
            data.giveaway
              ? [data.giveaway.prize, `${data.giveaway.entries.length} entries · ${data.giveaway.open ? 'open' : 'closed'}`]
              : ['Nothing running']
          }
          action="Run a giveaway"
          onAction={() => goTo('giveaway')}
        />
      </div>

      <p className="admin-note">
        King Points come off by hand in BotRix for now (store redemptions), and the originals use a demo balance, until
        the BotRix Premium management key is set.
      </p>
    </div>
  )
}

function OverviewCard({
  title,
  lines,
  action,
  onAction,
}: {
  title: string
  lines: ReactNode[]
  action: string
  onAction: () => void
}) {
  return (
    <section className="admin-card admin-overview__card">
      <h2 className="admin-card__title">{title}</h2>
      <ul className="admin-overview__lines">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <button type="button" className="admin-button admin-overview__action" onClick={onAction}>
        {action}
      </button>
    </section>
  )
}
