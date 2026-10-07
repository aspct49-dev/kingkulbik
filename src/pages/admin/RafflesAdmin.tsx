import { useCallback, useEffect, useMemo, useState } from 'react'
import ticketIcon from '../../assets/ticket.svg'
import RaffleMachine from '../../components/raffle/RaffleMachine'
import type { RaffleDrawShow } from '../../components/raffle/RaffleMachine'
import type { Raffle, RaffleEntry, RaffleKind } from '../../../shared/raffles'
import { adminPost } from './api'
import { ConfirmButton, Field, Input, num } from './ui'
import '../../components/events/EventBlocks.css'
import '../RafflesPage.css'

type AdminRaffle = Omit<Raffle, 'entries'> & {
  entries: (RaffleEntry & { odds: number })[]
  totalTickets: number
  drawsTotal: number
  countingFrom: number | null
  error: string | null
}

const usd = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hours = (m: number) => `${Math.floor(m / 60).toLocaleString('en-US')}h ${Math.round(m % 60)}m`
const pct = (v: number) => `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: v < 0.01 ? 2 : 1 })}%`
const month = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dateInput = (at: number) => new Date(at).toISOString().slice(0, 10)
const fromDate = (v: string) => Date.parse(`${v}T00:00:00Z`)

const STATUS = { open: 'Counting tickets', locked: 'Locked: ready to draw', complete: 'Complete' } as const

/** Monthly wager and watch-time raffles: settings, live tickets, lock, and draws on the machine */
export default function RafflesAdmin({ notify }: { notify: (message: string) => void }) {
  const [raffles, setRaffles] = useState<AdminRaffle[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/raffles', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { raffles: AdminRaffle[] }
      setRaffles(body.raffles)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async (kind: RaffleKind) => {
    try {
      const res = await adminPost<{ raffle: Raffle }>('raffles', { kind })
      setSelected(res.raffle.id)
      await load()
      notify(kind === 'wager' ? 'Wager raffle created' : 'Watch-time raffle created')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create it.')
    }
  }

  const current = raffles?.find((r) => r.id === selected) ?? raffles?.[0] ?? null

  return (
    <div className="admin-stack">
      <p className="admin-intro">
        Wager raffle: one ticket per {usd(1000)} wagered under the code this month (from Stake). Watch-time raffle:
        tickets from minutes watched this month (from BotRix). Lock the tickets when the month ends, then draw live:
        each draw picks a ticket at random, so odds are each player's share of the tickets.
      </p>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2 className="admin-card__title">New raffle for {month(Date.now())}</h2>
        </div>
        <div className="admin-actions admin-actions--split">
          <p className="admin-note">
            BotRix has no monthly table, so watch time is counted from a snapshot taken when the month is first
            checked. Reset it if a month started without one.
          </p>
          <div className="admin-row__actions">
            <ConfirmButton
              label="Reset watch baseline"
              confirm="Count watch time from now?"
              onConfirm={() =>
                void adminPost('raffles/baseline')
                  .then(load)
                  .then(() => notify('Watch time now counts from today'))
                  .catch((err: Error) => notify(err.message))
              }
            />
            <button type="button" className="admin-button" onClick={() => void create('watch')}>
              New watch-time raffle
            </button>
            <button type="button" className="admin-button admin-button--gold" onClick={() => void create('wager')}>
              New wager raffle
            </button>
          </div>
        </div>
      </section>

      {raffles && raffles.length > 1 && (
        <div className="kk-tabs admin-picker" role="radiogroup" aria-label="Raffle">
          {raffles.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={r.id === current?.id}
              className={`kk-tab${r.id === current?.id ? ' kk-tab--selected' : ''}`}
              onClick={() => setSelected(r.id)}
            >
              {r.kind === 'wager' ? 'Wager' : 'Watch'} · {month(r.start)}
            </button>
          ))}
        </div>
      )}

      {failed && <p className="admin-error">Couldn’t load the raffles.</p>}
      {!raffles && !failed && <div className="admin-loading" aria-label="Loading" />}
      {raffles && !current && <p className="admin-card admin-empty">No raffles yet. Create one above.</p>}
      {current && <RaffleEditor key={current.id} raffle={current} reload={load} notify={notify} />}
    </div>
  )
}

function RaffleEditor({ raffle, reload, notify }: { raffle: AdminRaffle; reload: () => Promise<void>; notify: (m: string) => void }) {
  const wager = raffle.kind === 'wager'
  const [form, setForm] = useState({
    title: raffle.title,
    prizePool: String(raffle.prizePool),
    prizePerDraw: String(raffle.prizePerDraw),
    maxWinsPerPerson: String(raffle.maxWinsPerPerson),
    ticketUnit: String(raffle.ticketUnit),
    start: dateInput(raffle.start),
    end: dateInput(raffle.end),
  })
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState<RaffleDrawShow | null>(null)
  const [animating, setAnimating] = useState(false)
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const act = async (route: string, body: unknown, message: string) => {
    setBusy(true)
    try {
      const res = await adminPost<{ draw?: { n: number; name: string } }>(`raffles/${raffle.id}${route}`, body)
      if (res.draw) {
        setAnimating(true)
        setShow({ key: `${raffle.id}-${res.draw.n}`, name: res.draw.name })
      } else notify(message)
      await reload()
      return res
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    void act(
      '',
      {
        title: form.title.trim(),
        prizePool: num(form.prizePool),
        prizePerDraw: num(form.prizePerDraw),
        maxWinsPerPerson: num(form.maxWinsPerPerson),
        ticketUnit: num(form.ticketUnit),
        start: fromDate(form.start),
        end: fromDate(form.end),
      },
      'Raffle saved',
    )

  // Balls: everyone still able to win
  const balls = useMemo(() => {
    const wins = new Map<string, number>()
    raffle.draws.forEach((d) => wins.set(d.name, (wins.get(d.name) ?? 0) + 1))
    return [...raffle.entries]
      .filter((e) => (wins.get(e.name) ?? 0) < raffle.maxWinsPerPerson)
      .sort((a, b) => b.tickets - a.tickets)
      .map((e) => e.name)
  }, [raffle.entries, raffle.draws, raffle.maxWinsPerPerson])
  const resting = raffle.draws.length ? raffle.draws[raffle.draws.length - 1].name : null
  const sorted = [...raffle.entries].sort((a, b) => b.tickets - a.tickets)
  const done = raffle.draws.length

  return (
    <>
      <section className="admin-card">
        <div className="admin-card__head">
          <h2 className="admin-card__title">
            {raffle.title}
            <span className="admin-count">
              {month(raffle.start)} · {raffle.totalTickets.toLocaleString('en-US')} tickets · {raffle.entries.length} players
            </span>
          </h2>
          <span className={`admin-chip${raffle.status === 'open' ? ' admin-chip--on' : ''}`}>{STATUS[raffle.status]}</span>
        </div>
        {raffle.error && <p className="admin-error">{raffle.error}</p>}
        {raffle.countingFrom && (
          <p className="admin-note">Watch time counted from {new Date(raffle.countingFrom).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.</p>
        )}

        {raffle.status === 'open' ? (
          <>
            <div className="admin-grid">
              <Field label="Title" wide>
                <Input value={form.title} onChange={set('title')} maxLength={60} />
              </Field>
              <Field label="Prize pool">
                <Input value={form.prizePool} onChange={set('prizePool')} unit="$" inputMode="decimal" />
              </Field>
              <Field label="Prize per draw" hint={`${Math.floor(num(form.prizePool) / num(form.prizePerDraw) || 0)} draws`}>
                <Input value={form.prizePerDraw} onChange={set('prizePerDraw')} unit="$" inputMode="decimal" />
              </Field>
              <Field label="Max wins per person" hint={`Up to ${usd((num(form.prizePerDraw) || 0) * (num(form.maxWinsPerPerson) || 0))} each`}>
                <Input value={form.maxWinsPerPerson} onChange={set('maxWinsPerPerson')} inputMode="numeric" />
              </Field>
              <Field label={wager ? 'Dollars wagered per ticket' : 'Minutes watched per ticket'}>
                <Input value={form.ticketUnit} onChange={set('ticketUnit')} unit={wager ? '$' : 'min'} inputMode="decimal" />
              </Field>
              <Field label="Counts from (UTC)">
                <span className="admin-input">
                  <input type="date" value={form.start} onChange={(e) => set('start')(e.target.value)} aria-label="Counts from" />
                </span>
              </Field>
              <Field label="Until, not including (UTC)">
                <span className="admin-input">
                  <input type="date" value={form.end} onChange={(e) => set('end')(e.target.value)} aria-label="Until" />
                </span>
              </Field>
            </div>
            <div className="admin-actions admin-actions--split">
              <ConfirmButton label="Delete raffle" confirm="Delete it?" onConfirm={() => void act('/delete', {}, 'Raffle deleted')} />
              <div className="admin-row__actions">
                <button type="button" className="admin-button" disabled={busy} onClick={save}>
                  Save settings
                </button>
                <ConfirmButton
                  tone="gold"
                  label="Lock tickets"
                  confirm={`Lock ${raffle.totalTickets.toLocaleString('en-US')} tickets?`}
                  onConfirm={() => void act('/lock', {}, 'Tickets locked. Ready to draw')}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="admin-actions admin-actions--split">
            <p className="admin-note">
              {usd(raffle.prizePool)} pool · {raffle.drawsTotal} draws of {usd(raffle.prizePerDraw)} · max {raffle.maxWinsPerPerson} wins
              each · seed hash <code>{raffle.seedHash?.slice(0, 16)}…</code>
            </p>
            <div className="admin-row__actions">
              {raffle.status === 'locked' && done === 0 && (
                <button type="button" className="admin-button" disabled={busy} onClick={() => void act('/unlock', {}, 'Unlocked: tickets count again')}>
                  Unlock
                </button>
              )}
              <ConfirmButton
                label="Delete raffle"
                confirm={raffle.status === 'complete' ? 'Delete it and its draws?' : 'Delete it?'}
                onConfirm={() => void act('/delete', {}, 'Raffle deleted')}
              />
            </div>
          </div>
        )}
      </section>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2 className="admin-card__title">
            Draws <span className="admin-count">{done} of {raffle.drawsTotal}</span>
          </h2>
          {raffle.status === 'locked' && (
            <button
              type="button"
              className="kk-button admin-submit"
              disabled={busy || animating}
              onClick={() => void act('/draw', {}, '')}
            >
              {animating ? 'Drawing…' : `Draw ${done + 1} of ${raffle.drawsTotal}`}
            </button>
          )}
        </div>
        <div className="admin-raffle-machine">
          <RaffleMachine
            names={balls}
            draw={show}
            resting={show ? null : resting}
            onDrawn={() => {
              setAnimating(false)
              notify('Winner drawn')
            }}
          />
        </div>
        {done > 0 && (
          <ol className="raffles__draws">
            {raffle.draws.map((d) => (
              <li key={d.n} className="raffles__draw raffles__draw--done">
                <span className="raffles__draw-n">Draw {d.n + 1}</span>
                <span className="raffles__draw-name">{animating && d.n === done - 1 ? '…' : d.name}</span>
                <span className="raffles__draw-prize">
                  {usd(d.prize)} · ticket {d.ticket + 1} of {d.pool}
                </span>
              </li>
            ))}
          </ol>
        )}
        {raffle.status === 'complete' && raffle.seed && (
          <p className="admin-note">
            Seed revealed: <code>{raffle.seed}</code>
          </p>
        )}
      </section>

      <section className="admin-card">
        <h2 className="admin-card__title">
          Tickets <span className="admin-count">{raffle.status === 'open' ? 'live, updates every minute' : 'locked'}</span>
        </h2>
        {sorted.length === 0 ? (
          <p className="admin-empty">No tickets yet.</p>
        ) : (
          <div className="ev-table raffles__table">
            <div className="ev-table__row ev-table__row--head">
              <span>#</span>
              <span>{wager ? 'Stake user' : 'Kick user'}</span>
              <span>{wager ? 'Wagered' : 'Watched'}</span>
              <span>Tickets</span>
              <span>Odds</span>
            </div>
            {sorted.slice(0, 100).map((e, i) => (
              <div key={e.name} className="ev-table__row">
                <span>
                  <span className="ev-table__place">{i + 1}</span>
                </span>
                <span className="ev-table__name">{e.name}</span>
                <span className="raffles__muted">{wager ? money(e.amount) : hours(e.amount)}</span>
                <span className="raffles__tickets">
                  <img src={ticketIcon} width={15} height={15} alt="" />
                  {e.tickets.toLocaleString('en-US')}
                </span>
                <span>{pct(e.odds)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
