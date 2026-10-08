/*
 * Accounts: one per player, signed into with Discord or Kick.
 *
 * An account made with Discord has the Discord id as its id (every account
 * from before Kick sign-in). One made with Kick has kick-<Kick user id>, and
 * can link Discord later. Either way the profile (server/profiles.ts) says
 * which Discord and Kick belong to it, so signing in with either finds it.
 *
 * Signing in with Kick when that Kick is on no account makes a new one. If
 * that player later links the Discord of an older account, or that older
 * account links this Kick, the Kick-made account is merged into it: its bets,
 * redemptions and owed payouts move over and it's removed.
 */

import type { PlayerProfile } from '../shared/profiles.js'
import type { SessionUser } from './auth.js'
import { read, update } from './store.js'

/** The account's id: the Discord id on accounts made with Discord (older cookies carry no id) */
export const accountId = (user: SessionUser) => user.id ?? user.discord?.id ?? ''

export const displayName = (user: SessionUser) => user.discord?.name ?? user.kick?.username ?? 'Player'

export const userAvatar = (user: SessionUser) => user.discord?.avatar ?? user.kick?.avatar ?? null

/** The Discord on a profile (older profiles: the id is the Discord id) */
export const profileDiscordId = (p: PlayerProfile) =>
  p.discordId !== undefined ? p.discordId : /^\d{5,25}$/.test(p.id) ? p.id : null

/** Newest first, so a stray duplicate from before Kick sign-in loses to the account in use */
const byLastSeen = (a: PlayerProfile, b: PlayerProfile) => b.lastSeen - a.lastSeen

export async function findByKick(kickId: string) {
  const owners = (await read('players')).filter((p) => p.kick?.id === kickId).sort(byLastSeen)
  // An account with Discord is the older, fuller one
  return owners.find((p) => profileDiscordId(p)) ?? owners[0] ?? null
}

export async function findByDiscord(discordId: string) {
  const players = await read('players')
  return players.find((p) => p.id === discordId) ?? players.find((p) => profileDiscordId(p) === discordId) ?? null
}

/** A session for an existing account, from what its profile remembers */
export function sessionFromProfile(p: PlayerProfile, via: SessionUser['via']): SessionUser {
  const discordId = profileDiscordId(p)
  return {
    ...(p.id !== discordId ? { id: p.id } : {}),
    discord: discordId ? { id: discordId, username: p.username, name: p.name, avatar: p.avatar } : null,
    kick: p.kick,
    // An admin unlink clears the profile's link too, so one still here is current
    stake: p.stake ? { username: p.stake.username, linkedAt: Math.floor(Date.now() / 1000) } : null,
    signedInAt: Math.floor(Date.now() / 1000),
    via,
  }
}

/** Move a Kick-made account into another: its history and totals join the other's, and it's removed */
export async function mergeAccounts(fromId: string, intoId: string) {
  if (fromId === intoId) return
  const move = <T extends { userId: string }>(list: T[]) =>
    list.map((x) => (x.userId === fromId ? { ...x, userId: intoId } : x))
  await update('bets', move)
  await update('redemptions', move)
  await update('owedPayouts', move)
  await update('players', (list) => {
    const from = list.find((p) => p.id === fromId)
    if (!from) return list
    const cents = (n: number) => Math.round(n * 100) / 100
    return list
      .filter((p) => p.id !== fromId)
      .map((p) =>
        p.id === intoId
          ? {
              ...p,
              firstSeen: Math.min(p.firstSeen, from.firstSeen),
              bets: p.bets + from.bets,
              wagered: cents(p.wagered + from.wagered),
              paid: cents(p.paid + from.paid),
            }
          : p,
      )
  })
}
