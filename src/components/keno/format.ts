/** King Points: whole numbers as BotRix keeps them (137 → "137"); older fractional amounts keep up to 2 decimals */
export const formatPoints = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** Pay-table style: 0.00, 1.60, 26.00, 100.0, 1,000 — at most 5 characters as in the design */
export function formatMultiplier(value: number) {
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (value >= 100) return value.toFixed(1)
  return value.toFixed(2)
}

/** Narrow pay tables: same exact value, fewer characters — 1k, 250, 13, 1.1, 2.25, 0 */
export function formatMultiplierCompact(value: number) {
  if (value >= 1000) return `${value / 1000}k`
  return String(Number(value.toFixed(2)))
}
