import {
  errorMessage,
  formatPrice,
  formatSize,
  normalizePerpCoin,
  parseOrderStatus,
  resolveAsset,
} from './exchange.js'
import { getPerpMarkPrice } from './perps.js'

/**
 * Stop entries always use Hyperliquid `tpsl: "sl"`:
 * a buy triggers when price rises to the trigger, a sell when price falls to it.
 * `tpsl: "tp"` is the opposite and is reserved for position take-profits.
 */
export const STOP_ENTRY_TPSL = 'sl' as const

export type TriggerSide = 'buy' | 'sell'

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
      tpsl: typeof STOP_ENTRY_TPSL
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
  tpsl: typeof STOP_ENTRY_TPSL
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
}

function failure(code: string, message: string): TriggerOrderFailure {
  return { ok: false, code, message }
}

/**
 * True when a stop entry would be on the wrong side of the mark.
 * Buy stops belong above the mark; sell stops belong below it.
 */
export function triggerDirectionMismatch(
  side: TriggerSide,
  triggerPx: number,
  markPx: number,
): boolean {
  if (side === 'buy') return triggerPx <= markPx
  return triggerPx >= markPx
}

function directionMessage(
  side: TriggerSide,
  triggerPx: string,
  markPx: number,
  force: boolean,
): string {
  const relation = side === 'buy' ? 'above' : 'below'
  const movement = side === 'buy' ? 'rises' : 'falls'
  const base = `${side === 'buy' ? 'Buy' : 'Sell'} stop trigger ${triggerPx} must be ${relation} mark ${markPx}. Stop entries use tpsl "sl" and trigger when price ${movement}.`
  if (force) return `${base} Placing anyway because --force was set.`
  return `${base} Pass --force to place it anyway.`
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

  let size: string
  try {
    size = formatSize(input.size, input.szDecimals)
  } catch (err) {
    return failure('INVALID_SIZE', `Invalid size "${input.size}": ${errorMessage(err)}`)
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

  const triggerNum = Number.parseFloat(triggerPx)
  const mismatched = triggerDirectionMismatch(input.side, triggerNum, input.markPx)
  if (mismatched && !input.force) {
    return failure(
      'TRIGGER_DIRECTION',
      directionMessage(input.side, triggerPx, input.markPx, false),
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
        'INVALID_PRICE',
        `Invalid stop-market limit from trigger "${triggerPx}" and slippage ${input.slippagePct}%: ${errorMessage(err)}`,
      )
    }
  } else {
    try {
      limitPx = formatPrice(requestedLimit, input.szDecimals, 'perp')
    } catch (err) {
      return failure(
        'INVALID_PRICE',
        `Invalid limit price "${requestedLimit}": ${errorMessage(err)}`,
      )
    }
  }

  const order: TriggerWireOrder = {
    a: input.assetId,
    b: isBuy,
    p: limitPx,
    s: size,
    r: input.reduceOnly,
    t: { trigger: { isMarket, triggerPx, tpsl: STOP_ENTRY_TPSL } },
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
      tpsl: STOP_ENTRY_TPSL,
      ...(isMarket ? { slippage: input.slippagePct } : {}),
      ...(mismatched
        ? { warning: directionMessage(input.side, triggerPx, input.markPx, true) }
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
  tpsl: typeof STOP_ENTRY_TPSL
  slippage?: number
  markPx: string
  warning?: string
  status: string
  oid: number | null
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

  const built = buildTriggerOrder({
    assetId,
    szDecimals,
    side: args.side,
    size: args.size,
    triggerPx: options.trigger,
    limitPx: options.limit,
    reduceOnly: options.reduceOnly,
    slippagePct: options.slippage,
    markPx: Number.parseFloat(markRaw),
    force: options.force,
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
    tpsl: STOP_ENTRY_TPSL,
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
    const parsed = parseOrderStatus(response?.response?.data?.statuses?.[0])
    if (parsed.kind === 'error') {
      return failure('ORDER_REJECTED', parsed.message)
    }

    const status = parsed.kind === 'string' ? parsed.value : parsed.kind
    const oid = parsed.kind === 'resting' || parsed.kind === 'filled' ? parsed.oid : null
    return { ok: true, data: { ...data, dryRun: false, status, oid } }
  } catch (err) {
    return failure('ORDER_FAILED', errorMessage(err))
  }
}
