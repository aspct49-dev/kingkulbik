import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import searchIcon from '../../assets/item-store/search.svg'

/** The Stake slot catalog (public/stake-slots.json): ~9,500 games, compact rows */
type Catalog = {
  imagePrefix: string
  providers: string[]
  games: [name: string, slug: string, provider: number, image: string][]
}

export type SlotGame = { name: string; slug: string; provider: string; image: string }

let catalog: Promise<Catalog> | null = null
const loadCatalog = () =>
  (catalog ??= fetch('/stake-slots.json').then((r) => {
    if (!r.ok) throw new Error(String(r.status))
    return r.json() as Promise<Catalog>
  }))

/** Imgix resizes on the fly: 300px wide covers the challenge card at 2× */
export const catalogImage = (prefix: string, hash: string, width = 300) =>
  `${prefix}${hash}?w=${width}&auto=format&q=75`

const providerName = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

const LIMIT = 30

/** Search Stake's slots by name; picking one fills in the game, its art and its link */
export default function SlotPicker({
  onPick,
  compact,
  placeholder = 'Search Stake slots',
}: {
  onPick: (game: SlotGame) => void
  /** Small field whose menu floats above everything (for inside the bracket) */
  compact?: boolean
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [data, setData] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  // Compact pickers sit in scrolling areas, so their menu is fixed to the viewport
  const [float, setFloat] = useState<CSSProperties | undefined>(undefined)

  useEffect(() => {
    if (!open || !compact) return
    const place = () => {
      const r = rootRef.current?.getBoundingClientRect()
      if (r) setFloat({ position: 'fixed', top: r.bottom + 4, left: r.left, width: Math.max(260, r.width), right: 'auto' })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, compact])

  useEffect(() => {
    if (!open || data) return
    loadCatalog()
      .then(setData)
      .catch(() => {
        catalog = null
        setFailed(true)
      })
  }, [open, data])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!data || q.length < 2) return []
    const starts: SlotGame[] = []
    const contains: SlotGame[] = []
    for (const [name, slug, provider, image] of data.games) {
      const n = name.toLowerCase()
      if (!n.includes(q)) continue
      const game = { name, slug, provider: providerName(data.providers[provider] ?? ''), image: catalogImage(data.imagePrefix, image) }
      ;(n.startsWith(q) ? starts : contains).push(game)
      if (starts.length >= LIMIT) break
    }
    return [...starts, ...contains].slice(0, LIMIT)
  }, [data, query])

  useEffect(() => setActive(0), [query])

  const pick = (game: SlotGame) => {
    onPick(game)
    setQuery('')
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault()
      pick(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const q = query.trim()
  const status = failed
    ? 'The Stake catalog could not be loaded.'
    : !data
      ? 'Loading the Stake catalog…'
      : q.length < 2
        ? `Type a game name (${data.games.length.toLocaleString('en-US')} Stake slots).`
        : results.length === 0
          ? `No Stake slot matches “${q}”.`
          : null

  return (
    <div className={`slot-picker${compact ? ' slot-picker--compact' : ''}`} ref={rootRef}>
      <div className="admin-input admin-input--icon">
        {!compact && <img src={searchIcon} width={14} height={14} alt="" />}
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <div className="slot-picker__menu" style={float}>
          {status ? (
            <p className="slot-picker__status">{status}</p>
          ) : (
            <ul className="slot-picker__list" id={listId} role="listbox" aria-label="Stake slots">
              {results.map((game, i) => (
                <li
                  key={game.slug}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`slot-picker__option${i === active ? ' slot-picker__option--active' : ''}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(game)}
                >
                  <img src={game.image.replace('w=300', 'w=80')} width={30} height={40} alt="" loading="lazy" />
                  <span className="slot-picker__text">
                    <span className="slot-picker__name">{game.name}</span>
                    {game.provider && <span className="slot-picker__provider">{game.provider}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
