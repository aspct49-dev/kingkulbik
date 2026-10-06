/*
 * Coinflip helpers for the page. The rules and results live on the server
 * (server/originals.ts, shared/originals.ts): Stake-style streaks where each
 * correct call doubles the multiplier, (1 - house edge) × 2ⁿ after n calls.
 */

export type Side = 'heads' | 'tails'

/** A game cashes out automatically after this many correct calls */
export const MAX_STREAK = 20

/** Random Pick: which side to call (only the call; the flip itself is the server's) */
export function randomSide(): Side {
  const buf = new Uint8Array(1)
  crypto.getRandomValues(buf)
  return buf[0] & 1 ? 'heads' : 'tails'
}

/** 1.98 → "1.98", 1038090.24 → "1,038,090" */
export const formatMultiplier = (value: number) =>
  value >= 1000
    ? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
