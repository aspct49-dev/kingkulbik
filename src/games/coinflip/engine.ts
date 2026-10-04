/*
 * Coinflip rules — pure logic, no UI. Stake-style streaks: a bet starts a
 * game, each correct call doubles the multiplier, cash out any time after a
 * correct call, and a wrong call loses the stake.
 *
 * After n correct calls the multiplier is RETURN_TO_PLAYER × 2ⁿ
 * (1.98×, 3.96×, 7.92×, …). Each call is 50/50, so reaching n pays with
 * probability 1/2ⁿ and the return stays at 99% however long the streak runs:
 * the house edge applies once, not on every flip.
 */

export type Side = 'heads' | 'tails'

export const RETURN_TO_PLAYER = 0.99
/** A game cashes out automatically after this many correct calls */
export const MAX_STREAK = 20

/** Multiplier after `streak` correct calls (0 → nothing yet) */
export const multiplierFor = (streak: number) =>
  streak <= 0 ? 0 : Math.round(RETURN_TO_PLAYER * 2 ** streak * 100) / 100

/** First-call multiplier, for display */
export const MULTIPLIER = multiplierFor(1)

/** A fair flip from the platform's cryptographic RNG (one random bit). */
export function flipCoin(): Side {
  const buf = new Uint8Array(1)
  crypto.getRandomValues(buf)
  return buf[0] & 1 ? 'heads' : 'tails'
}

export const randomSide = flipCoin

/** 1.98 → "1.98", 1038090.24 → "1,038,090" */
export const formatMultiplier = (value: number) =>
  value >= 1000
    ? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
