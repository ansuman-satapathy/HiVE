/**
 * Formats a number with standard 3-digit comma separation (en-US locale).
 * Ensures standard international grouping (e.g. 1,816,217 instead of 18,16,217).
 */
export function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0'
  return Number(num).toLocaleString('en-US')
}

/**
 * Formats large numbers compactly for dashboards, stat headers, and cards (e.g. 1.82M, 6.2K).
 * - >= 1B: e.g. 1.5B
 * - >= 1M: e.g. 1.82M
 * - >= 10K: e.g. 18.2K
 * - < 10K: standard comma-separated with en-US locale (e.g. 6,246)
 */
export function formatCompactNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0'
  const val = Number(num)
  const abs = Math.abs(val)

  if (abs >= 1_000_000_000) {
    const formatted = (val / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')
    return `${formatted}B`
  }
  if (abs >= 1_000_000) {
    const formatted = (val / 1_000_000).toFixed(2).replace(/\.?0+$/, '')
    return `${formatted}M`
  }
  if (abs >= 10_000) {
    const formatted = (val / 1_000).toFixed(1).replace(/\.?0+$/, '')
    return `${formatted}K`
  }
  return val.toLocaleString('en-US')
}

