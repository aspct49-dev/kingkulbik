import { useState } from 'react'

const OVERLAYS = [
  { path: '/overlay/hunt', name: 'Bonus hunt', size: '420 × 720', note: 'The current hunt: totals, break-even and every bonus.' },
  { path: '/overlay/tournament', name: 'Tournament', size: '1600 × 600', note: 'The newest published bracket.' },
  { path: '/overlay/giveaway', name: 'Giveaway', size: '520 × 300', note: 'Keyword, entry count, and a spinning reel when you draw.' },
  { path: '/overlay/raffle', name: 'Wager raffle machine', size: '800 × 680', note: 'The 3D machine: draws play live as you make them. Use ?kind=watch for the watch-time raffle.' },
  { path: '/overlay/guess', name: 'Guess the balance', size: '420 × 260', note: 'The round, its guess count and the winner once drawn.' },
] as const

/** Browser sources for OBS: transparent pages that follow the live data */
export default function OverlaysAdmin({ notify }: { notify: (message: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const origin = window.location.origin

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      notify('Link copied')
    } catch {
      notify(url)
    }
  }

  return (
    <div className="admin-stack">
      <p className="admin-intro">
        Add each one in OBS as a Browser Source with the size shown. They have a transparent background and update by
        themselves every few seconds.
      </p>
      <div className="admin-overview admin-overview--two">
        {OVERLAYS.map((o) => {
          const url = origin + o.path
          return (
            <section key={o.path} className="admin-card admin-overview__card">
              <h2 className="admin-card__title">
                {o.name} <span className="admin-count">{o.size}</span>
              </h2>
              <p className="admin-note">{o.note}</p>
              <code className="admin-url">{url}</code>
              <div className="admin-row__actions">
                <button type="button" className="admin-button admin-button--gold" onClick={() => void copy(url)}>
                  Copy link
                </button>
                <button type="button" className="admin-button" onClick={() => setPreview(preview === o.path ? null : o.path)}>
                  {preview === o.path ? 'Hide preview' : 'Preview'}
                </button>
                <a className="admin-button admin-button--quiet" href={o.path} target="_blank" rel="noopener noreferrer">
                  Open
                </a>
              </div>
              {preview === o.path && (
                <div className="admin-overlay-preview">
                  <iframe src={o.path} title={`${o.name} overlay preview`} />
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
