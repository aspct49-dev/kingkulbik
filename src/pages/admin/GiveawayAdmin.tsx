import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import coinIcon from '../../assets/coin.svg'
import { KICK_CHATROOM_ID } from '../../../shared/events'
import type { Giveaway } from '../../../shared/events'
import { adminPost } from './api'
import { readChat } from './kickChat'
import type { ChatStatus } from './kickChat'
import { ConfirmButton, Field, Input, num } from './ui'

const STATUS_LABEL: Record<ChatStatus, string> = { off: 'Not listening', connecting: 'Connecting to chat…', on: 'Listening to Kick chat' }

/** Kick chat giveaway: viewers type the keyword, the server checks them and draws */
export default function GiveawayAdmin({
  giveaway,
  onChange,
  notify,
}: {
  giveaway: Giveaway | null
  onChange: (g: Giveaway | null) => void
  notify: (message: string) => void
}) {
  const [form, setForm] = useState({ prize: '', keyword: '!join', minPoints: '0' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [chat, setChat] = useState<ChatStatus>('off')
  const [live, setLive] = useState<boolean | null>(null)
  const [chatroom, setChatroom] = useState(KICK_CHATROOM_ID)
  const queue = useRef(new Map<string, { kickId: string; name: string }>())
  const keywordRef = useRef(giveaway?.keyword ?? '')
  keywordRef.current = giveaway?.keyword ?? ''

  // Channel lookup: chatroom id and whether the stream is live
  useEffect(() => {
    fetch('/api/admin/kick', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { chatroomId: number; live: boolean | null }) => {
        setChatroom(d.chatroomId)
        setLive(d.live)
      })
      .catch(() => undefined)
  }, [])

  // Listen while a giveaway is taking entries
  const listening = Boolean(giveaway?.open)
  useEffect(() => {
    if (!listening) return
    return readChat(
      chatroom,
      (m) => {
        const word = m.text.trim().split(/\s+/)[0]?.toLowerCase()
        if (word && word === keywordRef.current) queue.current.set(m.kickId, { kickId: m.kickId, name: m.name })
      },
      setChat,
    )
  }, [listening, chatroom])

  // Hand new entrants to the server every couple of seconds
  useEffect(() => {
    if (!listening) return
    const id = window.setInterval(async () => {
      if (!queue.current.size) return
      const entries = [...queue.current.values()]
      queue.current.clear()
      try {
        const res = await adminPost<{ giveaway: Giveaway }>('giveaway/enter', { entries })
        onChange(res.giveaway)
      } catch {
        entries.forEach((e) => queue.current.set(e.kickId, e))
      }
    }, 2000)
    return () => window.clearInterval(id)
  }, [listening, onChange])

  const act = async (route: string, body: unknown, message?: string) => {
    setBusy(true)
    try {
      const res = await adminPost<{ giveaway: Giveaway | null }>(`giveaway/${route}`, body)
      onChange(res.giveaway)
      if (message) notify(message)
      return res.giveaway
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save.')
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const start = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.prize.trim()) return setError('What are you giving away?')
    if (!/^\S{1,24}$/.test(form.keyword.trim())) return setError('The keyword is one word, like !join.')
    const minPoints = form.minPoints.trim() ? num(form.minPoints) : 0
    if (!(minPoints >= 0)) return setError('Minimum King Points is a number (0 for anyone).')
    await act('start', { prize: form.prize.trim(), keyword: form.keyword.trim(), minPoints }, 'Giveaway started')
  }

  const latest = giveaway?.winners[0]

  return (
    <div className="admin-stack">
      <p className="admin-intro">
        Viewers enter by typing the keyword in Kick chat. Entries arrive while this page is open, since it does the
        listening. With a King Points minimum, each entrant is checked against BotRix. The server picks the winner.
      </p>

      {!giveaway ? (
        <form className="admin-card" onSubmit={start} noValidate>
          <div className="admin-card__head">
            <h2 className="admin-card__title">Start a giveaway</h2>
            <LiveChip live={live} />
          </div>
          <div className="admin-grid">
            <Field label="Prize">
              <Input value={form.prize} onChange={(v) => setForm((f) => ({ ...f, prize: v }))} placeholder="$50 tip" maxLength={60} />
            </Field>
            <Field label="Chat keyword">
              <Input value={form.keyword} onChange={(v) => setForm((f) => ({ ...f, keyword: v }))} placeholder="!join" maxLength={24} />
            </Field>
            <Field label="Minimum King Points" hint="0 lets anyone in">
              <Input
                value={form.minPoints}
                onChange={(v) => setForm((f) => ({ ...f, minPoints: v }))}
                unit={<img src={coinIcon} width={14} height={14} alt="King Points" />}
                inputMode="numeric"
              />
            </Field>
          </div>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <div className="admin-actions">
            <button type="submit" className="kk-button admin-submit" disabled={busy}>
              Start giveaway
            </button>
          </div>
        </form>
      ) : (
        <>
          <section className="admin-card">
            <div className="admin-card__head">
              <h2 className="admin-card__title">
                {giveaway.prize}
                <span className="admin-count">
                  Type <strong className="admin-strong">{giveaway.keyword}</strong> in chat
                  {giveaway.minPoints > 0 && <> · {giveaway.minPoints.toLocaleString('en-US')}+ King Points</>}
                </span>
              </h2>
              <LiveChip live={live} />
            </div>

            <div className="giveaway-status">
              <span className={`giveaway-status__dot giveaway-status__dot--${giveaway.open ? chat : 'off'}`} aria-hidden />
              {giveaway.open ? STATUS_LABEL[chat] : 'Entries closed'}
              <span className="giveaway-status__count">
                <strong>{giveaway.entries.length}</strong> {giveaway.entries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {latest && (
              <div className="giveaway-winner" key={latest.kickId + latest.drawnAt}>
                <span className="giveaway-winner__label">Winner</span>
                <span className="giveaway-winner__name">{latest.name}</span>
                <a className="admin-link" href={`https://kick.com/${encodeURIComponent(latest.name)}`} target="_blank" rel="noopener noreferrer">
                  kick.com/{latest.name}
                </a>
              </div>
            )}

            <div className="admin-actions admin-actions--split">
              <div className="admin-row__actions">
                <button
                  type="button"
                  className="admin-button"
                  disabled={busy}
                  onClick={() => void act('update', { open: !giveaway.open }, giveaway.open ? 'Entries closed' : 'Entries open')}
                >
                  {giveaway.open ? 'Close entries' : 'Reopen entries'}
                </button>
                <ConfirmButton label="End giveaway" confirm="End it?" onConfirm={() => void act('end', {}, 'Giveaway ended')} />
              </div>
              <button
                type="button"
                className="kk-button admin-submit"
                disabled={busy || giveaway.entries.length === 0}
                onClick={() => void act('draw', {}, 'Winner drawn')}
              >
                {giveaway.winners.length ? 'Draw another' : 'Draw winner'}
              </button>
            </div>
          </section>

          <div className="admin-rules">
            <section className="admin-card">
              <h2 className="admin-card__title">
                Entries <span className="admin-count">{giveaway.entries.length}</span>
              </h2>
              {giveaway.entries.length === 0 ? (
                <p className="admin-empty">Nobody yet. Tell chat to type {giveaway.keyword}.</p>
              ) : (
                <ul className="giveaway-names">
                  {[...giveaway.entries].reverse().map((e) => (
                    <li key={e.kickId}>
                      {e.name}
                      <button
                        type="button"
                        className="giveaway-names__remove"
                        aria-label={`Remove ${e.name}`}
                        onClick={() => void act('remove', { kickId: e.kickId })}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="admin-card">
              <h2 className="admin-card__title">Winners</h2>
              {giveaway.winners.length === 0 ? (
                <p className="admin-empty">No draws yet.</p>
              ) : (
                <ol className="giveaway-names giveaway-names--ranked">
                  {giveaway.winners.map((w) => (
                    <li key={w.kickId}>{w.name}</li>
                  ))}
                </ol>
              )}
              {giveaway.removed.length > 0 && (
                <>
                  <h3 className="admin-subtitle">Removed</h3>
                  <ul className="giveaway-names">
                    {giveaway.removed.map((e) => (
                      <li key={e.kickId}>
                        {e.name}
                        <button type="button" className="admin-link" onClick={() => void act('restore', { kickId: e.kickId })}>
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {giveaway.refused.length > 0 && (
                <>
                  <h3 className="admin-subtitle">Turned away</h3>
                  <ul className="admin-note giveaway-refused">
                    {giveaway.refused.slice(0, 8).map((r) => (
                      <li key={r.name + r.at}>
                        {r.name}: {r.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function LiveChip({ live }: { live: boolean | null }) {
  if (live === null) return null
  return <span className={`admin-chip${live ? ' admin-chip--live' : ''}`}>{live ? 'Live on Kick' : 'Offline'}</span>
}
