/*
 * Keno helpers for the page. 40 tiles; the player picks 1–10, then 10 are
 * drawn. The draw and the payout are settled on the server from the provably
 * fair seeds (server/originals.ts); the pay tables are Stake's, scaled to the
 * house edge set in the admin panel (shared/originals.ts).
 */

export { TILE_COUNT, DRAW_COUNT, MAX_PICKS, RISKS } from '../../../shared/kenoTables'
export type { Risk } from '../../../shared/kenoTables'
import { TILE_COUNT, MAX_PICKS } from '../../../shared/kenoTables'

/** Unbiased integer in [0, max) from the platform's cryptographic RNG. */
function secureRandomInt(max: number) {
  const limit = Math.floor(0x1_0000_0000 / max) * max // reject the biased tail
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % max
}

/** Random Pick: `count` distinct tiles (1-based) for the player's selection */
export function drawTiles(count = MAX_PICKS): number[] {
  const tiles = Array.from({ length: TILE_COUNT }, (_, i) => i + 1)
  // Partial Fisher–Yates shuffle
  for (let i = 0; i < count; i++) {
    const j = i + secureRandomInt(TILE_COUNT - i)
    ;[tiles[i], tiles[j]] = [tiles[j], tiles[i]]
  }
  return tiles.slice(0, count)
}
