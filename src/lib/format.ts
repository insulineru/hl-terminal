// --- Number Formatting ---

/**
 * Format a number with smart rounding based on magnitude.
 * Prices > 1000: 2 decimals with commas ($65,432.10)
 * Prices 1-1000: 2 decimals ($123.45)
 * Prices < 1: 4 decimals ($0.1234)
 */
export function formatPrice(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)

  const abs = Math.abs(num)
  let decimals: number

  if (abs >= 1000) {
    decimals = 2
  } else if (abs >= 1) {
    decimals = 2
  } else if (abs >= 0.01) {
    decimals = 4
  } else {
    decimals = 6
  }

  return (
    '$' +
    num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  )
}

/**
 * Truncate an address for display: 0x1234...abcd
 */
export function truncateAddress(address: string): string {
  if (address.length <= 13) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
