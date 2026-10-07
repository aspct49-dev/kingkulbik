import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { useState } from 'react'
import socialsIcon from '../assets/events/socials-icon.svg'
import bgKick from '../assets/socials/bg-kick.webp'
import kickLogo from '../assets/socials/kick-logo.svg'
import kickSmall from '../assets/socials/kick-k-small.svg'
import replayRing from '../assets/socials/kick-replay-ring.svg'
import vodGlow from '../assets/socials/vod-glow.webp'
import vodLine from '../assets/socials/vod-line.svg'
import cardBgX from '../assets/socials/card-bg-x.webp'
import cardBgDiscord from '../assets/socials/card-bg-discord.webp'
import cardShade from '../assets/socials/card-shade.svg'
import xLogo from '../assets/socials/x-logo.svg'
import discordLogo from '../assets/socials/discord-logo.svg'
import PageHeading from '../components/PageHeading'
import { socials } from '../data/links'
import { useKickSocials } from '../hooks/useEvents'
import type { KickChannelInfo, KickVod } from '../../shared/socials'
import { KICK_CHANNEL } from '../../shared/events'
import './ChallengesPage.css'
import './SocialsPage.css'

const KICK_URL = socials.kick.url
const VODS_URL = `${KICK_URL}/videos`
const PAGE = 8

const count = (n: number) => n.toLocaleString('en-US')

/** 7584000 → "2:06:24" */
function duration(ms: number) {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** Kick's times are UTC without a zone: "2026-10-06 12:58:43" */
function ago(when: string) {
  const t = Date.parse(when.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(t)) return ''
  const days = Math.floor((Date.now() - t) / 86_400_000)
  if (days < 1) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The live stream, King Kulbik's socials and his recent Kick streams */
export default function SocialsPage() {
  const { data } = useKickSocials()
  const channel = data?.channel ?? null

  return (
    <div className="section-page">
      <div className="socials">
      <div className="socials__backdrop" style={{ backgroundImage: `url(${bgKick})` }} aria-hidden />

      <PageHeading icon={socialsIcon} gold="SOCIALS" rest="& VIDEO">
        Watch the stream <span className="page-heading__accent">LIVE</span>, catch up on past streams and follow along.
      </PageHeading>

      <section className="socials__section" aria-labelledby="socials-live">
        <SectionTitle
          id="socials-live"
          icon={<img src={kickLogo} width={44} height={54} alt="" />}
          before="Watch"
          accent="Stream"
          after="Live"
          handle={socials.kick.handle}
          href={KICK_URL}
          tone="kick"
          aside={<LiveBadge channel={channel} />}
        />
        <LivePlayer channel={channel} loaded={Boolean(data)} />
      </section>

      <section className="socials__section" aria-labelledby="socials-follow">
        <SectionTitle
          id="socials-follow"
          icon={
            <span className="socials__icon-tile">
              <img src={socialsIcon} width={26} height={26} alt="" />
            </span>
          }
          before="Follow"
          accent="Me"
          after="on Socials"
          handle={socials.x.handle}
          href={socials.x.url}
          tone="gold"
        />
        <ul className="socials__cards">
          <SocialCard
            name="Kick"
            handle={channel ? `${count(channel.followers)} followers` : socials.kick.handle}
            href={KICK_URL}
            action={channel?.live ? 'Watch live' : 'Follow'}
            brand="#53fc18"
            bg={cardBgX}
            tint="kick"
            logo={<img src={kickLogo} width={70} height={86} alt="" />}
            live={Boolean(channel?.live)}
          />
          <SocialCard
            name="X"
            handle={socials.x.handle}
            href={socials.x.url}
            action="Follow"
            brand="#c4c4c4"
            bg={cardBgX}
            logo={<img src={xLogo} width={106} height={96} alt="" />}
          />
          <SocialCard
            name="Discord"
            handle="Join the community"
            href={socials.discord.url}
            action="Join"
            brand="#444cde"
            bg={cardBgDiscord}
            logo={<img src={discordLogo} width={104} height={80} alt="" />}
          />
        </ul>
      </section>

      <section className="socials__section" aria-labelledby="socials-vods">
        <SectionTitle
          id="socials-vods"
          icon={
            <span className="socials__replay" aria-hidden>
              <img className="socials__replay-ring" src={replayRing} width={54} height={54} alt="" />
              <img className="socials__replay-k" src={kickSmall} width={18} height={23} alt="" />
            </span>
          }
          before="Watch"
          accent="Recent"
          after="Streams"
          handle={socials.kick.handle}
          href={VODS_URL}
          tone="kick"
        />
        <Vods vods={data?.vods ?? null} />
      </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- pieces

function SectionTitle({
  id,
  icon,
  before,
  accent,
  after,
  handle,
  href,
  tone,
  aside,
}: {
  id: string
  icon: ReactNode
  before: string
  accent: string
  after: string
  handle: string
  href: string
  tone: 'kick' | 'gold'
  aside?: ReactNode
}) {
  return (
    <header className={`socials__title socials__title--${tone}`}>
      <span className="socials__title-icon">{icon}</span>
      <div className="socials__title-text">
        <h2 id={id}>
          {before} <span className="socials__title-accent">{accent}</span> {after}
        </h2>
        <a className="socials__handle" href={href} target="_blank" rel="noopener noreferrer">
          {handle}
        </a>
      </div>
      {aside}
    </header>
  )
}

function LiveBadge({ channel }: { channel: KickChannelInfo | null }) {
  if (!channel) return null
  return channel.live ? (
    <span className="socials__status socials__status--live">
      <span className="socials__dot" aria-hidden />
      Live · {count(channel.live.viewers)} watching
    </span>
  ) : (
    <span className="socials__status">Offline</span>
  )
}

/** Kick's player while live; the offline banner (with a way to the VODs) when not */
function LivePlayer({ channel, loaded }: { channel: KickChannelInfo | null; loaded: boolean }) {
  // Without channel data (Kick unreachable) the player still works: it shows Kick's own offline screen
  const showPlayer = !loaded || !channel || channel.live
  return (
    <div className="socials__player-wrap">
      <div className="socials__player">
        {showPlayer ? (
          <iframe
            src={`https://player.kick.com/${KICK_CHANNEL}?autoplay=true&muted=true`}
            title="King Kulbik live on Kick"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="socials__offline">
            {channel.offlineBanner && (
              <img src={channel.offlineBanner} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
            )}
            <div className="socials__offline-card">
              <p className="socials__offline-title">Stream is offline</p>
              <p className="socials__offline-text">Follow on Kick to get notified when King Kulbik goes live.</p>
              <div className="socials__offline-actions">
                <a className="kk-button socials__offline-follow" href={KICK_URL} target="_blank" rel="noopener noreferrer">
                  Follow on Kick
                </a>
                <a className="socials__dark-button" href="#socials-vods">
                  Past streams
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
      {channel?.live && (
        <p className="socials__now">
          <span className="socials__now-title">{channel.live.title}</span>
          {channel.live.category && <span className="socials__now-category">{channel.live.category}</span>}
        </p>
      )}
    </div>
  )
}

/** How far a social card turns towards the mouse at its edges */
const TILT_DEG = 16

/** Turn the card towards the mouse (mouse only; still for reduced motion) */
function tilt(e: PointerEvent<HTMLAnchorElement>) {
  if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const card = e.currentTarget
  const r = card.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width - 0.5
  const y = (e.clientY - r.top) / r.height - 0.5
  card.classList.add('socials-card--tilting')
  card.style.setProperty('--ry', `${(x * TILT_DEG * 2).toFixed(2)}deg`)
  card.style.setProperty('--rx', `${(-y * TILT_DEG * 2).toFixed(2)}deg`)
}

/** Ease back flat when the mouse leaves */
function untilt(e: PointerEvent<HTMLAnchorElement>) {
  const card = e.currentTarget
  card.classList.remove('socials-card--tilting')
  card.style.setProperty('--rx', '0deg')
  card.style.setProperty('--ry', '0deg')
}

function SocialCard({
  name,
  handle,
  href,
  action,
  brand,
  bg,
  tint,
  logo,
  live = false,
}: {
  name: string
  handle: string
  href: string
  action: string
  brand: string
  bg: string
  tint?: 'kick'
  logo: ReactNode
  live?: boolean
}) {
  return (
    <li>
      <a
        className={`socials-card${tint ? ` socials-card--${tint}` : ''}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ '--brand': brand, backgroundImage: `url(${bg})` } as CSSProperties}
        onPointerMove={tilt}
        onPointerLeave={untilt}
      >
        <img className="socials-card__shade" src={cardShade} width={219} height={99} alt="" />
        {live && (
          <span className="socials-card__live">
            <span className="socials__dot" aria-hidden />
            Live
          </span>
        )}
        <span className="socials-card__logo">{logo}</span>
        <span className="socials-card__name">{name}</span>
        <span className="socials-card__handle">{handle}</span>
        <span className="socials-card__action">{action}</span>
      </a>
    </li>
  )
}

function Vods({ vods }: { vods: KickVod[] | null }) {
  const [shown, setShown] = useState(PAGE)

  if (!vods) return <div className="socials__vods-loading" aria-label="Loading" />
  if (!vods.length) {
    return (
      <p className="socials__empty">
        Past streams couldn't be loaded right now.{' '}
        <a href={VODS_URL} target="_blank" rel="noopener noreferrer">
          Watch them on Kick
        </a>
        .
      </p>
    )
  }

  return (
    <>
      <ul className="socials__vods">
        {vods.slice(0, shown).map((v) => (
          <li key={v.id}>
            <a
              className="vod-card"
              href={v.live ? KICK_URL : `${KICK_URL}/videos/${v.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img className="vod-card__glow" src={vodGlow} width={238} height={141} alt="" />
              <span className="vod-card__thumb">
                {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" />}
                {v.live ? (
                  <span className="vod-card__badge vod-card__badge--live">
                    <span className="socials__dot" aria-hidden />
                    Live now
                  </span>
                ) : (
                  v.durationMs > 0 && <span className="vod-card__badge">{duration(v.durationMs)}</span>
                )}
              </span>
              <img className="vod-card__line" src={vodLine} width={170} height={1} alt="" />
              <span className="vod-card__title">{v.title || 'Untitled stream'}</span>
              <span className="vod-card__meta">
                {ago(v.startedAt)}
                {!v.live && <> · {count(v.views)} views</>}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {shown < vods.length && (
        <button type="button" className="socials__dark-button socials__more" onClick={() => setShown((n) => n + PAGE)}>
          Show more streams
        </button>
      )}
    </>
  )
}
