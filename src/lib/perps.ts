import type { InfoClient } from '@nktkas/hyperliquid'

export type PerpMarket = {
  name: string
  szDecimals: number
  maxLeverage: number
  assetId: number
  dex?: string
}

type DexMeta = { name: string }

type RawPosition = {
  coin: string
  szi: string
  entryPx: string
  unrealizedPnl: string
  leverage: string
  liquidationPx: string
}

type RawOrder = {
  oid: number
  coin: string
  side: string
  size: string
  price: string
  orderType: string
}

export function normalizePerpCoin(coin: string): string {
  const trimmed = coin.trim()
  const delimiterIndex = trimmed.indexOf(':')

  if (delimiterIndex === -1) {
    return trimmed.toUpperCase()
  }

  const dex = trimmed.slice(0, delimiterIndex).toLowerCase()
  const asset = trimmed.slice(delimiterIndex + 1).toUpperCase()
  return `${dex}:${asset}`
}

function getCoinDex(coin: string): string | undefined {
  const delimiterIndex = coin.indexOf(':')
  if (delimiterIndex === -1) return undefined
  return coin.slice(0, delimiterIndex)
}

async function listPerpDexs(info: InfoClient): Promise<DexMeta[]> {
  try {
    const dexs = await info.perpDexs()
    return (dexs ?? []).flatMap((dex) => (dex?.name ? [{ name: dex.name }] : []))
  } catch {
    return []
  }
}

export async function buildPerpMarketRegistry(info: InfoClient): Promise<Map<string, PerpMarket>> {
  const registry = new Map<string, PerpMarket>()
  const mainMeta = await info.meta()

  for (const [index, asset] of (mainMeta.universe ?? []).entries()) {
    registry.set(asset.name, {
      name: asset.name,
      szDecimals: asset.szDecimals ?? 0,
      maxLeverage: asset.maxLeverage ?? 0,
      assetId: index,
    })
  }

  const dexs = await listPerpDexs(info)
  const dexResults = await Promise.allSettled(
    dexs.map(async (dex, dexOffset) => ({
      dex: dex.name,
      dexOffset,
      meta: await info.meta({ dex: dex.name }),
    })),
  )

  for (const result of dexResults) {
    if (result.status !== 'fulfilled') continue

    const { dex, dexOffset, meta } = result.value
    const baseAssetId = 110000 + dexOffset * 10000

    for (const [index, asset] of (meta.universe ?? []).entries()) {
      registry.set(asset.name, {
        name: asset.name,
        szDecimals: asset.szDecimals ?? 0,
        maxLeverage: asset.maxLeverage ?? 0,
        assetId: baseAssetId + index,
        dex,
      })
    }
  }

  return registry
}

export async function findPerpMarket(
  info: InfoClient,
  coin: string,
): Promise<PerpMarket | undefined> {
  const registry = await buildPerpMarketRegistry(info)
  return registry.get(normalizePerpCoin(coin))
}

export async function listPerpMarkets(info: InfoClient): Promise<PerpMarket[]> {
  return Array.from((await buildPerpMarketRegistry(info)).values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}

export async function getPerpMidPrice(info: InfoClient, coin: string): Promise<string | undefined> {
  const normalizedCoin = normalizePerpCoin(coin)
  const dex = getCoinDex(normalizedCoin)
  const mids = dex ? await info.allMids({ dex }) : await info.allMids()
  return mids[normalizedCoin]
}

async function listPerpDexQueries<T>(
  info: InfoClient,
  query: (dex?: string) => Promise<T>,
): Promise<T[]> {
  const dexs = await listPerpDexs(info)
  const results = await Promise.allSettled([
    query(undefined),
    ...dexs.map((dex) => query(dex.name)),
  ])
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
}

async function listUserPerpRawPositions(info: InfoClient, address: string): Promise<RawPosition[]> {
  const states = await listPerpDexQueries(info, (dex) =>
    dex
      ? info.clearinghouseState({ user: address, dex })
      : info.clearinghouseState({ user: address }),
  )

  return states.flatMap((state: any) =>
    (state.assetPositions ?? [])
      .map((ap: any) => ap.position)
      .filter((position: any) => parseFloat(position?.szi ?? '0') !== 0)
      .map((position: any) => ({
        coin: position.coin ?? '',
        szi: position.szi ?? '0',
        entryPx: position.entryPx ?? '0',
        unrealizedPnl: position.unrealizedPnl ?? '0',
        leverage: String(position.leverage?.value ?? '0'),
        liquidationPx: position.liquidationPx ?? '0',
      })),
  )
}

export async function findUserPerpPosition(
  info: InfoClient,
  address: string,
  coin: string,
): Promise<RawPosition | undefined> {
  const normalizedCoin = normalizePerpCoin(coin)
  return (await listUserPerpRawPositions(info, address)).find(
    (position) => normalizePerpCoin(position.coin) === normalizedCoin,
  )
}

export async function listUserPerpPositions(info: InfoClient, address: string) {
  const positions = await listUserPerpRawPositions(info, address)

  return positions.map((position) => ({
    coin: position.coin,
    size: position.szi,
    entryPx: position.entryPx,
    unrealizedPnl: position.unrealizedPnl,
    leverage: position.leverage,
    liquidationPx: position.liquidationPx,
    side: parseFloat(position.szi) >= 0 ? 'Long' : 'Short',
  }))
}

function formatSide(code: string): string {
  if (code === 'B') return 'Buy'
  if (code === 'A') return 'Sell'
  return code
}

async function fetchOrdersForDex(info: InfoClient, address: string, dex?: string): Promise<any[]> {
  try {
    return dex
      ? await info.frontendOpenOrders({ user: address, dex })
      : await info.frontendOpenOrders({ user: address })
  } catch {
    return dex
      ? await info.openOrders({ user: address, dex })
      : await info.openOrders({ user: address })
  }
}

export async function listUserPerpOpenOrders(
  info: InfoClient,
  address: string,
): Promise<RawOrder[]> {
  const orderSets = await listPerpDexQueries(info, (dex) => fetchOrdersForDex(info, address, dex))

  return orderSets.flat().map((order: any) => ({
    oid: order.oid ?? 0,
    coin: order.coin ?? '',
    side: formatSide(order.side ?? ''),
    size: order.sz ?? '0',
    price: order.limitPx ?? order.px ?? '0',
    orderType: order.orderType ?? 'Limit',
  }))
}
