/*
 * Stream events: bonus hunts, guess the balance, slot tournaments and the
 * Kick chat giveaway. Types and the pure maths shared by the server (which
 * stores and validates) and the pages (which render and edit).
 *
 * The bracket logic is ported from Fugroo's (single elimination, flat match
 * list with `${round}-${position}` ids, resets unwind every later round).
 */

// ------------------------------------------------------------------ bonus hunt

export type HuntBonus = {
  id: string
  game: string
  /** Stake catalog slug and art, when picked from the catalog */
  slug?: string
  image?: string
  provider?: string
  /** Bet size in dollars */
  bet: number
  /** What the bonus paid, null until it's opened (0 is a real result) */
  payout: number | null
}

/** collecting: buying bonuses · opening: paying them out · finished */
export type HuntStatus = 'collecting' | 'opening' | 'finished'

export type Hunt = {
  id: string
  name: string
  /** Dollars spent collecting the bonuses */
  startBalance: number
  status: HuntStatus
  bonuses: HuntBonus[]
  createdAt: number
  finishedAt: number | null
}

export type HuntStats = {
  count: number
  opened: number
  totalBet: number
  totalWon: number
  /** Average multiplier needed across all bonuses to get the start back */
  breakEven: number | null
  /** Needed on the bonuses still to open, given what's been won */
  liveBreakEven: number | null
  /** Average multiplier of the opened bonuses */
  average: number | null
  best: HuntBonus | null
  /** totalWon - startBalance, once anything is opened */
  profit: number
}

export function huntStats(h: Hunt): HuntStats {
  const opened = h.bonuses.filter((b) => b.payout !== null)
  const waiting = h.bonuses.filter((b) => b.payout === null)
  const totalBet = h.bonuses.reduce((s, b) => s + b.bet, 0)
  const totalWon = opened.reduce((s, b) => s + (b.payout ?? 0), 0)
  const openedBet = opened.reduce((s, b) => s + b.bet, 0)
  const waitingBet = waiting.reduce((s, b) => s + b.bet, 0)
  const best = opened.reduce<HuntBonus | null>(
    (top, b) => (b.bet > 0 && (!top || (b.payout ?? 0) / b.bet > (top.payout ?? 0) / top.bet) ? b : top),
    null,
  )
  const remaining = h.startBalance - totalWon
  return {
    count: h.bonuses.length,
    opened: opened.length,
    totalBet,
    totalWon,
    breakEven: totalBet > 0 && h.startBalance > 0 ? h.startBalance / totalBet : null,
    liveBreakEven: waitingBet > 0 ? Math.max(0, remaining) / waitingBet : null,
    average: openedBet > 0 ? totalWon / openedBet : null,
    best,
    profit: totalWon - h.startBalance,
  }
}

export const bonusMultiplier = (b: HuntBonus) => (b.payout !== null && b.bet > 0 ? b.payout / b.bet : null)

// ------------------------------------------------------------ guess the balance

export type Guess = {
  /** Discord id: one guess per account */
  userId: string
  name: string
  avatar: string | null
  value: number
  at: number
}

/** open: taking guesses · closed: entries shut, hunt running · drawn: settled */
export type GuessStatus = 'open' | 'closed' | 'drawn'

export type GuessRound = {
  id: string
  name: string
  /** Free text, e.g. "$100" */
  prize: string
  /** The hunt it's played on (its start balance and bonus count show on the page) */
  huntId: string | null
  status: GuessStatus
  guesses: Guess[]
  finalBalance: number | null
  createdAt: number
  drawnAt: number | null
}

export type RankedGuess = Guess & { place: number; offBy: number }

/** Closest first; ties go to whoever guessed earlier */
export function rankGuesses(round: Pick<GuessRound, 'guesses' | 'finalBalance'>): RankedGuess[] {
  const final = round.finalBalance
  if (final === null) return []
  return round.guesses
    .map((g) => ({ ...g, offBy: Math.abs(g.value - final), place: 0 }))
    .sort((a, b) => a.offBy - b.offBy || a.at - b.at)
    .map((g, i) => ({ ...g, place: i + 1 }))
}

/** What the public page gets: other people's guesses stay hidden until the draw */
export type PublicGuessRound = Omit<GuessRound, 'guesses'> & {
  count: number
  mine: Guess | null
  /** Top of the standings, once drawn */
  standings: RankedGuess[]
  hunt: {
    name: string
    status: HuntStatus
    startBalance: number
    count: number
    opened: number
    /** Paid so far by the opened bonuses */
    totalWon: number
    /** Average multiplier needed across the hunt to get the start back */
    breakEven: number | null
  } | null
}

// ------------------------------------------------------------------ tournaments

export type Player = {
  name: string
  /** Slot they play this match */
  slot: string
  slug?: string
  image?: string
}

export type Match = {
  /** `${round}-${position}`; round 0 is the first round */
  id: string
  round: number
  position: number
  player1: Player
  player2: Player
  /** Multiplier each player hit; null until entered (0 is a real result) */
  mult1: number | null
  mult2: number | null
  winner: 'p1' | 'p2' | null
}

export const BRACKET_SIZES = [4, 8, 16, 32] as const
export type BracketSize = (typeof BRACKET_SIZES)[number]

/** draft: being set up, hidden · live · complete: the final has a winner */
export type TournamentStatus = 'draft' | 'live' | 'complete'

export type Tournament = {
  id: string
  name: string
  prize: string
  size: BracketSize
  status: TournamentStatus
  matches: Match[]
  createdAt: number
  completedAt: number | null
}

export const EMPTY_PLAYER: Player = { name: '', slot: '' }

export const isBracketSize = (n: number): n is BracketSize => (BRACKET_SIZES as readonly number[]).includes(n)

export const roundsIn = (matches: Match[]) => matches.reduce((max, m) => Math.max(max, m.round + 1), 0)

const childId = (m: Pick<Match, 'round' | 'position'>, rounds: number) =>
  m.round + 1 >= rounds ? null : `${m.round + 1}-${Math.floor(m.position / 2)}`

/** Empty bracket; round 0 is paired in entry order (0 v 1, 2 v 3 …) */
export function buildBracket(size: BracketSize, players: Player[] = []): Match[] {
  const rounds = Math.log2(size)
  const matches: Match[] = []
  for (let r = 0; r < rounds; r++) {
    const count = size / 2 ** (r + 1)
    for (let i = 0; i < count; i++) {
      matches.push({
        id: `${r}-${i}`,
        round: r,
        position: i,
        player1: r === 0 ? { ...(players[i * 2] ?? EMPTY_PLAYER) } : { ...EMPTY_PLAYER },
        player2: r === 0 ? { ...(players[i * 2 + 1] ?? EMPTY_PLAYER) } : { ...EMPTY_PLAYER },
        mult1: null,
        mult2: null,
        winner: null,
      })
    }
  }
  return matches
}

export function updatePlayer(matches: Match[], matchId: string, which: 1 | 2, patch: Partial<Player>): Match[] {
  return matches.map((m) => {
    if (m.id !== matchId) return m
    const key = which === 1 ? 'player1' : 'player2'
    return { ...m, [key]: { ...m[key], ...patch } }
  })
}

export function setMultiplier(matches: Match[], matchId: string, which: 1 | 2, value: number | null): Match[] {
  return matches.map((m) => (m.id === matchId ? { ...m, [which === 1 ? 'mult1' : 'mult2']: value } : m))
}

/** Record a winner and carry them into the next round (a decided match must be reset first) */
export function advanceWinner(matches: Match[], matchId: string, which: 'p1' | 'p2'): Match[] {
  const match = matches.find((m) => m.id === matchId)
  if (!match || match.winner) return matches
  const updated = matches.map((m) => (m.id === matchId ? { ...m, winner: which } : m))
  const next = childId(match, roundsIn(matches))
  if (!next) return updated
  const winner = which === 'p1' ? match.player1 : match.player2
  // Even positions feed the top of the next match, odd the bottom
  const top = match.position % 2 === 0
  return updated.map((m) =>
    m.id === next
      ? { ...m, player1: top ? { ...winner } : m.player1, player2: top ? m.player2 : { ...winner } }
      : m,
  )
}

/** Higher multiplier wins; a tie goes to player 1 (re-spin by resetting) */
export function decideByMultiplier(matches: Match[], matchId: string): Match[] {
  const m = matches.find((x) => x.id === matchId)
  if (!m || m.winner || m.mult1 === null || m.mult2 === null) return matches
  return advanceWinner(matches, matchId, m.mult1 >= m.mult2 ? 'p1' : 'p2')
}

/** Undo a decided match and everything it fed into later rounds */
export function resetMatch(matches: Match[], matchId: string): Match[] {
  const rounds = roundsIn(matches)
  let out = matches.map((m) => (m.id === matchId ? { ...m, winner: null } : m))
  let cursor = out.find((m) => m.id === matchId)
  while (cursor) {
    const next = childId(cursor, rounds)
    if (!next) break
    const child = out.find((m) => m.id === next)
    if (!child) break
    const top = cursor.position % 2 === 0
    const cleared: Match = {
      ...child,
      player1: top ? { ...EMPTY_PLAYER } : child.player1,
      player2: top ? child.player2 : { ...EMPTY_PLAYER },
      mult1: top ? null : child.mult1,
      mult2: top ? child.mult2 : null,
      winner: null,
    }
    out = out.map((m) => (m.id === next ? cleared : m))
    if (!child.winner) break
    cursor = cleared
  }
  return out
}

export const matchesInRound = (matches: Match[], round: number) =>
  matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position)

export function championOf(matches: Match[]): Player | null {
  const rounds = roundsIn(matches)
  const final = matches.find((m) => m.round === rounds - 1)
  if (!final?.winner) return null
  return final.winner === 'p1' ? final.player1 : final.player2
}

export function roundLabel(round: number, rounds: number) {
  const fromEnd = rounds - 1 - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semi-finals'
  if (fromEnd === 2) return 'Quarter-finals'
  if (fromEnd === 3) return 'Round of 16'
  return `Round ${round + 1}`
}

export const matchReady = (m: Match) => m.player1.name.trim() !== '' && m.player2.name.trim() !== ''

// ------------------------------------------------------------------ giveaway

export type GiveawayEntry = {
  /** Kick user id (stable where the name isn't) */
  kickId: string
  name: string
  at: number
}

export type Giveaway = {
  id: string
  /** What's being given away, e.g. "$50 tip" */
  prize: string
  /** Chat message that enters, e.g. "!join" */
  keyword: string
  open: boolean
  /** BotRix King Points needed to enter (0: anyone) */
  minPoints: number
  entries: GiveawayEntry[]
  /** Removed by hand; typing the keyword again keeps them out */
  removed: GiveawayEntry[]
  /** Drawn so far this round, newest first (a winner can't be drawn twice) */
  winners: (GiveawayEntry & { drawnAt: number })[]
  /** Last few chat names refused, and why (for the panel) */
  refused: { name: string; reason: string; at: number }[]
  /** Names for the spinning reel of the latest draw, ending on its winner */
  reel: string[]
  createdAt: number
}

/** A past giveaway winner (kept across rounds for the Raffles page) */
export type RaffleWin = { name: string; prize: string; at: number }

/** What viewers and the overlay see */
export type PublicGiveaway = {
  id: string
  prize: string
  keyword: string
  open: boolean
  minPoints: number
  count: number
  recent: string[]
  winners: { name: string; drawnAt: number }[]
  reel: string[]
} | null

export const KICK_CHANNEL = 'kingkulbik'
/** King Kulbik's chatroom (looked up from kick.com/api/v2/channels/kingkulbik) */
export const KICK_CHATROOM_ID = 41471945
