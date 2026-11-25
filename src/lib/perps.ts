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

export type PerpOpenOrder = {
  oid: number
  coin: string
  side: string
  size: string
  price: string
  orderType: string
  /** Trigger price for stop/TP orders. Null for plain limit orders. */
  triggerPx: string | null
  /** True when the order becomes a market order after it triggers. */
  isMarket: boolean
  reduceOnly: boolean
  /** `sl` for stops, `tp` for take-profits, null otherwise. */
  tpsl: 'tp' | 'sl' | null
}

/** Shown instead of "0" / "0.0" for position-wide TP/SL, which scale with the position. */
export const FULL_POSITION_SIZE = 'full position'

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

function getRawPerpCoinName(coin: string): string {
  const normalizedCoin = normalizePerpCoin(coin)
  const delimiterIndex = normalizedCoin.indexOf(':')
  if (delimiterIndex === -1) return normalizedCoin
  return normalizedCoin.slice(delimiterIndex + 1)
}

function qualifyPerpCoin(dex: string | undefined, coin: string): string {
  const normalizedCoin = normalizePerpCoin(coin)

  if (!dex) {
    return normalizedCoin
  }

  return `${dex.toLowerCase()}:${getRawPerpCoinName(normalizedCoin)}`
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
      const qualifiedName = qualifyPerpCoin(dex, asset.name)

      registry.set(qualifiedName, {
        name: qualifiedName,
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
  const rawCoinName = getRawPerpCoinName(normalizedCoin)
  return mids[rawCoinName] ?? mids[normalizedCoin]
}

/**
 * Mark price for a perp. Trigger direction is checked against mark, not mid:
 * a buy stop must sit above it and a sell stop below it.
 */
export async function getPerpMarkPrice(
  info: InfoClient,
  coin: string,
): Promise<string | undefined> {
  const normalizedCoin = normalizePerpCoin(coin)
  const dex = getCoinDex(normalizedCoin)
  const [meta, ctxs] = dex ? await info.metaAndAssetCtxs({ dex }) : await info.metaAndAssetCtxs()

  const index = (meta.universe ?? []).findIndex(
    (asset) => qualifyPerpCoin(dex, asset.name) === normalizedCoin,
  )
  if (index < 0) return undefined

  const mark = ctxs[index]?.markPx
  if (!mark || !(Number.parseFloat(mark) > 0)) return undefined
  return mark
}

type DexQueryResult<T> = {
  dex: string | undefined
  data: T
}

async function listPerpDexQueries<T>(
  info: InfoClient,
  query: (dex?: string) => Promise<T>,
): Promise<DexQueryResult<T>[]> {
  const dexs = await listPerpDexs(info)
  const dexNames = [undefined, ...dexs.map((dex) => dex.name)]
  const results = await Promise.allSettled(dexNames.map((dex) => query(dex)))

  return results.flatMap((result, index) =>
    result.status === 'fulfilled' ? [{ dex: dexNames[index], data: result.value }] : [],
  )
}

async function listUserPerpRawPositions(info: InfoClient, address: string): Promise<RawPosition[]> {
  const states = await listPerpDexQueries(info, (dex) =>
    dex
      ? info.clearinghouseState({ user: address, dex })
      : info.clearinghouseState({ user: address }),
  )

  return states.flatMap(({ dex, data: state }) =>
    ((state as any).assetPositions ?? [])
      .map((ap: any) => ap.position)
      .filter((position: any) => parseFloat(position?.szi ?? '0') !== 0)
      .map((position: any) => ({
        coin: qualifyPerpCoin(dex, position.coin ?? ''),
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

function displayOrderType(order: any): string {
  if (typeof order.orderType === 'string' && order.orderType.length > 0) return order.orderType
  if (order.isTrigger === true || order.isPositionTpsl === true) return 'Trigger'
  return 'Limit'
}

function isTriggerOrder(order: any, orderType: string): boolean {
  if (order.isTrigger === true || order.isPositionTpsl === true) return true
  return /stop|take profit/i.test(orderType)
}

function orderIsMarket(orderType: string): boolean {
  return /market/i.test(orderType)
}

function orderTpsl(orderType: string): 'tp' | 'sl' | null {
  if (/take profit/i.test(orderType)) return 'tp'
  if (/stop/i.test(orderType)) return 'sl'
  return null
}

function displayOrderSize(order: any, isTrigger: boolean): string {
  const raw = String(order.sz ?? '0')
  // Position TP/SL is submitted with size 0 and scales with the position.
  if (order.isPositionTpsl === true) return FULL_POSITION_SIZE
  if (isTrigger && Number.parseFloat(raw) === 0) return FULL_POSITION_SIZE
  return raw
}

function displayTriggerPx(order: any, isTrigger: boolean): string | null {
  if (!isTrigger) return null
  const raw = order.triggerPx
  if (raw === undefined || raw === null || raw === '') return null
  const value = Number.parseFloat(String(raw))
  if (!Number.isFinite(value) || value <= 0) return null
  return String(raw)
}

function mapOpenOrder(order: any, dex?: string): PerpOpenOrder {
  const orderType = displayOrderType(order)
  const isTrigger = isTriggerOrder(order, orderType)

  return {
    oid: order.oid ?? 0,
    coin: qualifyPerpCoin(dex, order.coin ?? ''),
    side: formatSide(order.side ?? ''),
    size: displayOrderSize(order, isTrigger),
    price: order.limitPx ?? order.px ?? '0',
    orderType,
    triggerPx: displayTriggerPx(order, isTrigger),
    isMarket: orderIsMarket(orderType),
    reduceOnly: order.reduceOnly === true,
    tpsl: orderTpsl(orderType),
  }
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
): Promise<PerpOpenOrder[]> {
  const orderSets = await listPerpDexQueries(info, (dex) => fetchOrdersForDex(info, address, dex))

  return orderSets.flatMap(({ dex, data: orders }) =>
    (orders as any[]).map((order: any) => mapOpenOrder(order, dex)),
  )
}
