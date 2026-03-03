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

export { formatPrice, formatSize } from '@nktkas/hyperliquid/utils'
