import { useEffect, useSyncExternalStore } from 'react'
import { DEFAULT_CHALLENGES, DEFAULT_STORE_ITEMS } from '../../shared/content'
import type { Challenge, StoreItem } from '../../shared/content'
import { DEFAULT_RULES } from '../../shared/originals'
import type { OriginalsRules } from '../../shared/originals'

/*
 * Admin-managed content, fetched once per page load and shared by every
 * component. Until the server answers (or if it can't), the built-in defaults
 * show, so the pages never flash empty.
 */

type Resource<T> = {
  value: T
  loaded: boolean
  started: boolean
  listeners: Set<() => void>
}

function resource<T>(initial: T): Resource<T> {
  return { value: initial, loaded: false, started: false, listeners: new Set() }
}

function setValue<T>(r: Resource<T>, value: T) {
  r.value = value
  r.loaded = true
  r.listeners.forEach((l) => l())
}

function load<T>(r: Resource<T>, url: string, pick: (body: Record<string, unknown>) => T | undefined) {
  r.started = true
  return fetch(url, { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((body: Record<string, unknown>) => {
      const value = pick(body)
      if (value !== undefined) setValue(r, value)
    })
    .catch(() => undefined)
}

function useResource<T>(r: Resource<T>, url: string, pick: (body: Record<string, unknown>) => T | undefined) {
  const value = useSyncExternalStore(
    (l) => {
      r.listeners.add(l)
      return () => r.listeners.delete(l)
    },
    () => r.value,
  )
  useEffect(() => {
    if (!r.started) void load(r, url, pick)
  }, [r, url, pick])
  return value
}

const challenges = resource<Challenge[]>(DEFAULT_CHALLENGES)
const shop = resource<StoreItem[]>(DEFAULT_STORE_ITEMS)
const rules = resource<OriginalsRules>(DEFAULT_RULES)

const pickChallenges = (b: Record<string, unknown>) => b.challenges as Challenge[] | undefined
const pickShop = (b: Record<string, unknown>) => b.items as StoreItem[] | undefined
const pickRules = (b: Record<string, unknown>) => b.rules as OriginalsRules | undefined

export const useChallenges = () => useResource(challenges, '/api/content/challenges', pickChallenges)
export const useStoreItems = () => useResource(shop, '/api/content/shop', pickShop)
export const useOriginalsRules = () => useResource(rules, '/api/originals/rules', pickRules)

/** After an admin edit: the public pages show the change without a reload */
export const setChallenges = (value: Challenge[]) => setValue(challenges, value)
export const setStoreItems = (value: StoreItem[]) => setValue(shop, value.filter((i) => !i.hidden))
export const setOriginalsRules = (value: OriginalsRules) => setValue(rules, value)
