import type { InfoClient } from '@nktkas/hyperliquid'
import {
  buildPerpMarketRegistry,
  findPerpMarket,
  listPerpMarkets,
  normalizePerpCoin,
} from './perps.js'

/**
 * Resolve a perp market symbol (e.g. "BTC" or "xyz:BRENTOIL") to its asset ID and size decimals.
 * Supports main perps and builder dex perps using Hyperliquid's encoded asset IDs.
 *
 * @throws Error with available coins hint if the coin is not found.
 */
export async function resolveAsset(
  info: InfoClient,
  coin: string,
): Promise<{ assetId: number; szDecimals: number }> {
  const market = await findPerpMarket(info, coin)

  if (!market) {
    const available = (await listPerpMarkets(info)).map((a) => a.name).join(', ')
    throw new Error(
      `Coin "${coin}" not found. Run \`hl markets\` to see available markets.\nAvailable: ${available}`,
    )
  }

  return { assetId: market.assetId, szDecimals: market.szDecimals }
}

/**
 * Build a map of coin name -> encoded asset ID for all supported perp markets.
 */
export async function buildAssetMap(info: InfoClient): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const registry = await buildPerpMarketRegistry(info)
  registry.forEach((market, coin) => map.set(coin, market.assetId))
  return map
}

export { normalizePerpCoin }

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
