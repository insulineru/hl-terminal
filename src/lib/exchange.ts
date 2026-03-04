import type { InfoClient } from '@nktkas/hyperliquid'

/**
 * Resolve a coin symbol (e.g. "BTC") to its asset ID and size decimals.
 * The asset ID is the coin's index in meta.universe — required by ExchangeClient actions.
 *
 * @throws Error with available coins hint if the coin is not found.
 */
export async function resolveAsset(
  info: InfoClient,
  coin: string,
): Promise<{ assetId: number; szDecimals: number }> {
  const upperCoin = coin.toUpperCase()
  const meta = await info.meta()

  const index = meta.universe.findIndex((asset) => asset.name.toUpperCase() === upperCoin)

  if (index === -1) {
    const available = meta.universe.map((a) => a.name).join(', ')
    throw new Error(
      `Coin "${coin}" not found. Run \`hl markets\` to see available markets.\nAvailable: ${available}`,
    )
  }

  const asset = meta.universe[index]
  if (!asset) {
    throw new Error(`Coin "${coin}" not found in meta.universe`)
  }

  return { assetId: index, szDecimals: asset.szDecimals }
}

/**
 * Build a map of coin name -> asset index from meta.universe.
 * Fetches meta once for bulk resolution (e.g. cancel-all).
 */
export async function buildAssetMap(info: InfoClient): Promise<Map<string, number>> {
  const meta = await info.meta()
  const map = new Map<string, number>()
  meta.universe.forEach((a, i) => {
    map.set(a.name, i)
  })
  return map
}

/**
 * Extract a message string from an unknown error.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Decode Hyperliquid wire-format side code to human-readable string.
 */
export function formatSide(code: string): string {
  if (code === 'B') return 'Buy'
  if (code === 'A') return 'Sell'
  return code
}

type ParsedStatus =
  | { kind: 'resting'; oid: number }
  | { kind: 'filled'; oid: number; avgPx: string; totalSz: string }
  | { kind: 'error'; message: string }
  | { kind: 'string'; value: string }

/**
 * Parse a Hyperliquid order response status into a structured result.
 */
export function parseOrderStatus(status: unknown): ParsedStatus {
  if (typeof status === 'object' && status !== null) {
    if ('resting' in status) {
      const s = status as { resting: { oid: number } }
      return { kind: 'resting', oid: s.resting.oid }
    }
    if ('filled' in status) {
      const s = status as { filled: { oid: number; avgPx: string; totalSz: string } }
      return { kind: 'filled', oid: s.filled.oid, avgPx: s.filled.avgPx, totalSz: s.filled.totalSz }
    }
    if ('error' in status) {
      return { kind: 'error', message: (status as { error: string }).error }
    }
  }
  return { kind: 'string', value: String(status) }
}

/**
 * Guard that returns a read-only account error if no exchange client is available.
 * Returns the error response, or null if the exchange exists.
 */
export function requireExchange(c: any, action: string) {
  if (!c.var.exchange) {
    return c.error({
      code: 'READ_ONLY_ACCOUNT',
      message: `This account has no private key and cannot ${action}`,
      cta: {
        commands: [{ command: 'account add --name main', description: 'Add a trading account' }],
        description: 'Get started:',
      },
    })
  }
  return null
}

export { formatPrice, formatSize } from '@nktkas/hyperliquid/utils'
