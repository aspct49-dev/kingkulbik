import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import arrowIcon from '../assets/challenges/arrow-down.svg'
import './SortSelect.css'

type SortSelectProps<T extends string> = {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}

/**
 * The "Reward: Ascending" dropdown in a page's filter bar. A styled listbox
 * (the browser's own option list can't be themed): click or Enter/Space opens
 * it, arrows move, Enter picks, Escape or a click outside closes.
 */
export default function SortSelect<T extends string>({ value, options, onChange, className = '' }: SortSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const show = () => {
    setActive(selectedIndex)
    setOpen(true)
  }

  const pick = (index: number) => {
    onChange(options[index].value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        show()
      }
      return
    }
    if (e.key === 'ArrowDown') setActive((i) => Math.min(options.length - 1, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(options.length - 1)
    else if (e.key === 'Enter' || e.key === ' ') pick(active)
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false)
      if (e.key === 'Tab') return
    } else return
    e.preventDefault()
  }

  return (
    <div className={`sort-select${open ? ' sort-select--open' : ''} ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="sort-select__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <span className="sort-select__value">{options[selectedIndex]?.label}</span>
        <img className="sort-select__arrow" src={arrowIcon} width={9.26452} height={5.59302} alt="" />
      </button>
      <ul className="sort-select__list" id={listId} role="listbox" aria-label="Sort by" hidden={!open}>
        {options.map((o, i) => (
          <li
            key={o.value}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === selectedIndex}
            className={`sort-select__option${i === active ? ' sort-select__option--active' : ''}`}
            onPointerEnter={() => setActive(i)}
            onClick={() => pick(i)}
          >
            {o.label}
            {i === selectedIndex && <span className="sort-select__tick" aria-hidden />}
          </li>
        ))}
      </ul>
    </div>
  )
}
