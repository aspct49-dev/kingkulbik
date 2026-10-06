import type { Challenge, StoreItem } from '../../../shared/content'
import type { FeedBet, OriginalsRules } from '../../../shared/originals'
import type { Giveaway, GuessRound, Hunt, Tournament } from '../../../shared/events'

export type AdminData = {
  discordId: string
  challenges: Challenge[]
  shop: StoreItem[]
  rules: OriginalsRules
  feed: FeedBet[]
  hunts: Hunt[]
  guesses: GuessRound[]
  tournaments: Tournament[]
  giveaway: Giveaway | null
  /** Redemptions waiting on an admin */
  pending: number
  players: number
}

export type AdminStatus =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'forbidden'; discordId: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: AdminData }

export async function loadAdmin(): Promise<AdminStatus> {
  try {
    const res = await fetch('/api/admin/status', { credentials: 'same-origin' })
    const body = (await res.json().catch(() => ({}))) as Partial<AdminData> & { admin?: boolean; signedIn?: boolean }
    if (!res.ok) return { kind: 'error', message: 'Could not load the admin panel.' }
    if (!body.admin) return body.signedIn ? { kind: 'forbidden', discordId: body.discordId ?? null } : { kind: 'signed-out' }
    return { kind: 'ready', data: body as AdminData }
  } catch {
    return { kind: 'error', message: 'Could not reach the server.' }
  }
}

/** POST to an admin route; resolves to the JSON body or throws the server's message */
export async function adminPost<T>(route: string, body: unknown = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/admin/${route}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Could not reach the server.')
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`)
  return data
}

/**
 * Shrink a picked image in the browser (longest edge `maxEdge`, WebP) and
 * upload it. Returns its public URL.
 */
export async function uploadImage(file: File, maxEdge = 800): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file.')
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That image could not be read.')
  })
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
  // Browsers without WebP encoding hand back PNG
  const out = blob ?? (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png')))
  if (!out) throw new Error('That image could not be converted.')

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('That image could not be read.'))
    reader.readAsDataURL(out)
  })
  const { url } = await adminPost<{ url: string }>('upload', { data, type: out.type })
  return url
}
