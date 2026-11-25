import {
  errorMessage,
  formatPrice,
  formatSize,
  normalizePerpCoin,
  parseOrderStatus,
  resolveAsset,
} from './exchange.js'
import { getPerpMarkPrice } from './perps.js'

/** Default trigger style: a buy fires when price rises, a sell when price falls. */
export const DEFAULT_TRIGGER_TPSL = 'sl' as const

/**
 * Shown with --force and on a wrong-side trigger. An already-crossed trigger is
 * live against the current mark, so Hyperliquid may fill it immediately or reject it.
 */
export const CROSSED_TRIGGER_WARNING =
  'An already-crossed trigger may execute immediately at market or be rejected by Hyperliquid.'

export type TriggerSide = 'buy' | 'sell'
export type TriggerTpsl = 'sl' | 'tp'

export type TriggerWireOrder = {
  a: number
  b: boolean
  p: string
  s: string
  r: boolean
  t: {
    trigger: {
      isMarket: boolean
      triggerPx: string
      tpsl: TriggerTpsl
    }
  }
}

export type TriggerOrderPreview = {
  type: 'stop-market' | 'stop-limit'
  side: TriggerSide
  size: string
  triggerPx: string
  limitPx: string
  isMarket: boolean
  reduceOnly: boolean
  tpsl: TriggerTpsl
  /** Present for stop-market orders, where the limit is trigger ± slippage. */
  slippage?: number
  warning?: string
  order: TriggerWireOrder
  grouping: 'na'
}

export type TriggerOrderFailure = { ok: false; code: string; message: string }

export type BuildTriggerOrderInput = {
  assetId: number
  szDecimals: number
  side: TriggerSide
  /** Absolute base size. Not scaled to an open position. */
  size: string
  triggerPx: string
  /** When set, the order is a stop-limit at this price. Otherwise stop-market. */
  limitPx?: string
  reduceOnly: boolean
  slippagePct: number
  markPx: number
  force: boolean
  /** Defaults to sl. tp reverses which side of the mark is valid. */
  tpsl?: TriggerTpsl
}

function failure(code: string, message: string): TriggerOrderFailure {
  return { ok: false, code, message }
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/** (buy, sl) and (sell, tp) arm above the mark. (sell, sl) and (buy, tp) arm below it. */
export function triggerWantsAboveMark(side: TriggerSide, tpsl: TriggerTpsl): boolean {
  return (side === 'buy' && tpsl === 'sl') || (side === 'sell' && tpsl === 'tp')
}

/**
 * True when the trigger is already on the crossed side of the mark, including equality.
 * That order can fire immediately.
 */
export function triggerDirectionMismatch(
  side: TriggerSide,
  tpsl: TriggerTpsl,
  triggerPx: number,
  markPx: number,
): boolean {
  if (triggerWantsAboveMark(side, tpsl)) return triggerPx <= markPx
  return triggerPx >= markPx
}

function directionMessage(
  side: TriggerSide,
  tpsl: TriggerTpsl,
  triggerPx: string,
  markPx: number,
  force: boolean,
): string {
  const above = triggerWantsAboveMark(side, tpsl)
  const relation = above ? 'above' : 'below'
  const movement = above ? 'rises' : 'falls'
  const label = side === 'buy' ? 'Buy' : 'Sell'
  const base = `${label} ${tpsl} trigger ${triggerPx} must be ${relation} mark ${markPx} (${tpsl} ${side} triggers when price ${movement}). ${CROSSED_TRIGGER_WARNING}`
  if (force) return `${base} Placing anyway because --force was set.`
  return `${base} Pass --force to place it anyway.`
}

function formattedPositive(raw: string, formatted: string): boolean {
  return isPositive(Number(raw)) && isPositive(Number(formatted))
}

/**
 * Build the Hyperliquid trigger-order request.
 * Stop-market limit price is the trigger adjusted by slippage, same side rule as market orders.
 * Size is the caller's absolute size.
 */
export function buildTriggerOrder(
  input: BuildTriggerOrderInput,
): { ok: true; preview: TriggerOrderPreview } | TriggerOrderFailure {
  const isBuy = input.side === 'buy'
  const tpsl = input.tpsl ?? DEFAULT_TRIGGER_TPSL

  if (!Number.isFinite(input.slippagePct) || input.slippagePct < 0 || input.slippagePct >= 100) {
    return failure(
      'INVALID_SLIPPAGE',
      `Slippage must be >= 0 and < 100 (got ${input.slippagePct}).`,
    )
  }

  if (Number.isFinite(Number(input.size)) && !(Number(input.size) > 0)) {
    return failure('INVALID_SIZE', `Size must be greater than 0 (got ${input.size}).`)
  }

  let size: string
  try {
    size = formatSize(input.size, input.szDecimals)
  } catch (err) {
    return failure('INVALID_SIZE', `Invalid size "${input.size}": ${errorMessage(err)}`)
  }
  if (!formattedPositive(input.size, size)) {
    return failure('INVALID_SIZE', `Size must be greater than 0 (got ${size}).`)
  }

  if (Number.isFinite(Number(input.triggerPx)) && !(Number(input.triggerPx) > 0)) {
    return failure(
      'INVALID_PRICE',
      `Trigger price must be greater than 0 (got ${input.triggerPx}).`,
    )
  }

  let triggerPx: string
  try {
    triggerPx = formatPrice(input.triggerPx, input.szDecimals, 'perp')
  } catch (err) {
    return failure(
      'INVALID_PRICE',
      `Invalid trigger price "${input.triggerPx}": ${errorMessage(err)}`,
    )
  }
  if (!formattedPositive(input.triggerPx, triggerPx)) {
    return failure('INVALID_PRICE', `Trigger price must be greater than 0 (got ${triggerPx}).`)
  }

  if (!isPositive(input.markPx)) {
    return failure('PRICE_NOT_FOUND', `No mark price found (got ${input.markPx}).`)
  }

  const triggerNum = Number(triggerPx)
  const mismatched = triggerDirectionMismatch(input.side, tpsl, triggerNum, input.markPx)
  if (mismatched && !input.force) {
    return failure(
      'TRIGGER_DIRECTION',
      directionMessage(input.side, tpsl, triggerPx, input.markPx, false),
    )
  }

  const requestedLimit = input.limitPx
  const isMarket = requestedLimit === undefined
  let limitPx: string
  if (requestedLimit === undefined) {
    const factor = input.slippagePct / 100
    const slipped = isBuy ? triggerNum * (1 + factor) : triggerNum * (1 - factor)
    try {
      limitPx = formatPrice(slipped, input.szDecimals, 'perp')
    } catch (err) {
      return failure(
        'INVALID_SLIPPAGE',
        `Stop-market limit from trigger ${triggerPx} at ${input.slippagePct}% slippage is not a positive price: ${errorMessage(err)}`,
      )
    }
    if (!isPositive(Number(limitPx))) {
      return failure(
        'INVALID_SLIPPAGE',
        `Stop-market limit price ${limitPx} must be greater than 0. Lower --slippage or raise the trigger.`,
      )
    }
  } else {
    if (Number.isFinite(Number(requestedLimit)) && !(Number(requestedLimit) > 0)) {
      return failure('INVALID_PRICE', `Limit price must be greater than 0 (got ${requestedLimit}).`)
    }
    try {
      limitPx = formatPrice(requestedLimit, input.szDecimals, 'perp')
    } catch (err) {
      return failure(
        'INVALID_PRICE',
        `Invalid limit price "${requestedLimit}": ${errorMessage(err)}`,
      )
    }
    if (!formattedPositive(requestedLimit, limitPx)) {
      return failure('INVALID_PRICE', `Limit price must be greater than 0 (got ${limitPx}).`)
    }
  }

  const order: TriggerWireOrder = {
    a: input.assetId,
    b: isBuy,
    p: limitPx,
    s: size,
    r: input.reduceOnly,
    t: { trigger: { isMarket, triggerPx, tpsl } },
  }

  return {
    ok: true,
    preview: {
      type: isMarket ? 'stop-market' : 'stop-limit',
      side: input.side,
      size,
      triggerPx,
      limitPx,
      isMarket,
      reduceOnly: input.reduceOnly,
      tpsl,
      ...(isMarket ? { slippage: input.slippagePct } : {}),
      ...(mismatched
        ? { warning: directionMessage(input.side, tpsl, triggerPx, input.markPx, true) }
        : {}),
      order,
      grouping: 'na',
    },
  }
}

export type TriggerOrderArgs = {
  coin: string
  side: TriggerSide
  size: string
}

export type TriggerOrderOptions = {
  trigger: string
  limit?: string
  reduceOnly: boolean
  slippage: number
  dryRun: boolean
  force: boolean
  tpsl?: TriggerTpsl
}

export type TriggerOrderSuccess = {
  dryRun: boolean
  type: 'stop-market' | 'stop-limit'
  coin: string
  side: TriggerSide
  size: string
  triggerPx: string
  limitPx: string
  isMarket: boolean
  reduceOnly: boolean
  tpsl: TriggerTpsl
  slippage?: number
  markPx: string
  warning?: string
  status: string
  oid: number | null
  /** Set when the trigger filled immediately. */
  avgPx?: string
  totalSz?: string
}

type TriggerExchange = {
  order: (req: { orders: TriggerWireOrder[]; grouping: 'na' }) => Promise<any>
}

/**
 * Resolve the market and mark price, build the trigger order, and either preview it
 * or submit it. Callers pass a mock `info` / `exchange` in tests — this never reads
 * account config or private keys.
 */
export async function executeTriggerOrder(
  deps: { info: any; exchange?: TriggerExchange },
  args: TriggerOrderArgs,
  options: TriggerOrderOptions,
): Promise<{ ok: true; data: TriggerOrderSuccess } | TriggerOrderFailure> {
  const coin = normalizePerpCoin(args.coin)

  let assetId: number
  let szDecimals: number
  try {
    const resolved = await resolveAsset(deps.info, coin)
    assetId = resolved.assetId
    szDecimals = resolved.szDecimals
  } catch (err) {
    return failure('ASSET_NOT_FOUND', errorMessage(err))
  }

  let markRaw: string | undefined
  try {
    markRaw = await getPerpMarkPrice(deps.info, coin)
  } catch (err) {
    return failure('PRICE_FETCH_FAILED', `Failed to fetch mark price: ${errorMessage(err)}`)
  }
  if (!markRaw) {
    return failure('PRICE_NOT_FOUND', `No mark price found for ${coin}`)
  }

  const markPx = Number(markRaw)
  if (!isPositive(markPx)) {
    return failure('PRICE_NOT_FOUND', `No mark price found for ${coin}`)
  }

  const built = buildTriggerOrder({
    assetId,
    szDecimals,
    side: args.side,
    size: args.size,
    triggerPx: options.trigger,
    limitPx: options.limit,
    reduceOnly: options.reduceOnly,
    slippagePct: options.slippage,
    markPx,
    force: options.force,
    tpsl: options.tpsl,
  })
  if (!built.ok) return built

  const data: TriggerOrderSuccess = {
    dryRun: options.dryRun,
    type: built.preview.type,
    coin,
    side: args.side,
    size: built.preview.size,
    triggerPx: built.preview.triggerPx,
    limitPx: built.preview.limitPx,
    isMarket: built.preview.isMarket,
    reduceOnly: built.preview.reduceOnly,
    tpsl: built.preview.tpsl,
    ...(built.preview.slippage !== undefined ? { slippage: built.preview.slippage } : {}),
    markPx: markRaw,
    ...(built.preview.warning ? { warning: built.preview.warning } : {}),
    status: 'DRY_RUN',
    oid: null,
  }

  if (options.dryRun) return { ok: true, data }

  if (!deps.exchange) {
    return failure('READ_ONLY_ACCOUNT', 'This account has no private key and cannot place orders')
  }

  try {
    const response = await deps.exchange.order({
      orders: [built.preview.order],
      grouping: built.preview.grouping,
    })
    const statuses = response?.response?.data?.statuses
    const rawStatus = Array.isArray(statuses) ? statuses[0] : undefined
    if (rawStatus === undefined) {
      return failure('ORDER_FAILED', 'Exchange returned no order status')
    }

    const parsed = parseOrderStatus(rawStatus)
    if (parsed.kind === 'error') {
      return failure('ORDER_REJECTED', parsed.message)
    }

    const status = parsed.kind === 'string' ? parsed.value : parsed.kind
    const oid = parsed.kind === 'resting' || parsed.kind === 'filled' ? parsed.oid : null
    return {
      ok: true,
      data: {
        ...data,
        dryRun: false,
        status,
        oid,
        ...(parsed.kind === 'filled' ? { avgPx: parsed.avgPx, totalSz: parsed.totalSz } : {}),
      },
    }
  } catch (err) {
    return failure('ORDER_FAILED', errorMessage(err))
  }
}
