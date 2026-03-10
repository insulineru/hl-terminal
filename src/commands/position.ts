import { Cli, z } from 'incur'
import {
  resolveAsset,
  formatPrice,
  errorMessage,
  parseOrderStatus,
  requireExchange,
  normalizePerpCoin,
} from '../lib/exchange.js'
import { findUserPerpPosition, getPerpMidPrice } from '../lib/perps.js'

export const position = Cli.create('position', {
  description: 'Manage position settings — leverage, take-profit, stop-loss',
})

position.command('leverage', {
  description: 'Set leverage for a coin (cross or isolated)',
  args: z.object({
    coin: z.string().describe('Coin symbol (e.g. BTC, ETH)'),
    leverage: z.coerce.number().int().min(1).max(100).describe('Leverage value (1-100)'),
  }),
  options: z.object({
    isolated: z.boolean().default(false).describe('Use isolated margin mode'),
    cross: z.boolean().default(false).describe('Use cross margin mode (default)'),
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
  examples: [
    { args: { coin: 'BTC', leverage: 10 }, description: 'Set 10x cross leverage on BTC' },
    {
      args: { coin: 'ETH', leverage: 5 },
      options: { isolated: true },
      description: '5x isolated leverage on ETH',
    },
  ],
  hint: 'Set leverage before placing orders. Cross margin is the default.',
  alias: { dryRun: 'd' },
  output: z.object({
    dryRun: z.boolean(),
    coin: z.string(),
    leverage: z.number(),
    mode: z.string(),
  }),
  async run(c: any) {
    const guard = requireExchange(c, 'set leverage')
    if (guard) return guard

    if (c.options.isolated && c.options.cross) {
      return c.error({
        code: 'CONFLICTING_FLAGS',
        message: 'Cannot use both --isolated and --cross flags at the same time',
      })
    }

    const coin = normalizePerpCoin(c.args.coin)

    let assetId: number
    try {
      const resolved = await resolveAsset(c.var.info, coin)
      assetId = resolved.assetId
    } catch (err) {
      return c.error({ code: 'UNKNOWN_COIN', message: errorMessage(err) })
    }

    const isCross = !c.options.isolated
    const mode = isCross ? 'cross' : 'isolated'

    if (c.options.dryRun) {
      return c.ok({ dryRun: true, coin, leverage: c.args.leverage, mode })
    }

    try {
      await c.var.exchange.updateLeverage({
        asset: assetId,
        isCross,
        leverage: c.args.leverage,
      })
      return c.ok(
        { dryRun: false, coin, leverage: c.args.leverage, mode },
        {
          cta: {
            commands: [
              { command: 'order create', description: 'Place an order with new leverage' },
            ],
          },
        },
      )
    } catch (err) {
      return c.error({ code: 'LEVERAGE_FAILED', message: errorMessage(err) })
    }
  },
})

/**
 * Shared helper for placing position-level TP or SL trigger orders.
 * Auto-detects position direction across all supported perp dexs.
 */
async function placeTriggerOrder(
  c: any,
  coin: string,
  triggerPrice: string,
  tpsl: 'tp' | 'sl',
  dryRun: boolean,
) {
  const normalizedCoin = normalizePerpCoin(coin)

  // Fetch all independent data in parallel
  const [resolvedAsset, position, midRaw] = await Promise.all([
    resolveAsset(c.var.info, normalizedCoin),
    findUserPerpPosition(c.var.info, c.var.address, normalizedCoin),
    getPerpMidPrice(c.var.info, normalizedCoin),
  ])

  const { assetId, szDecimals } = resolvedAsset

  if (!position) {
    return c.error({
      code: 'NO_POSITION',
      message: `No open position for ${normalizedCoin}`,
      cta: { commands: [{ command: 'positions', description: 'View open positions' }] },
    })
  }

  const szi = parseFloat(position.szi ?? '0')
  if (szi === 0) {
    return c.error({
      code: 'NO_POSITION',
      message: `No open position for ${normalizedCoin}`,
      cta: { commands: [{ command: 'positions', description: 'View open positions' }] },
    })
  }

  const isLong = szi > 0
  const positionSide = isLong ? 'Long' : 'Short'
  const sideBoolean = !isLong // sell to close long, buy to close short

  const formattedTriggerPx = formatPrice(triggerPrice, szDecimals, 'perp')

  // Validate trigger price direction against current mid
  const mid = parseFloat(midRaw ?? '')

  if (!isNaN(mid)) {
    const triggerNum = parseFloat(formattedTriggerPx)
    const label = tpsl === 'tp' ? 'Take-profit' : 'Stop-loss'
    const code = tpsl === 'tp' ? 'INVALID_TP_PRICE' : 'INVALID_SL_PRICE'

    if (tpsl === 'tp') {
      if (isLong && triggerNum <= mid) {
        return c.error({
          code,
          message: `${label} price must be above current price (${mid}) for a long position`,
        })
      }
      if (!isLong && triggerNum >= mid) {
        return c.error({
          code,
          message: `${label} price must be below current price (${mid}) for a short position`,
        })
      }
    } else {
      if (isLong && triggerNum >= mid) {
        return c.error({
          code,
          message: `${label} price must be below current price (${mid}) for a long position`,
        })
      }
      if (!isLong && triggerNum <= mid) {
        return c.error({
          code,
          message: `${label} price must be above current price (${mid}) for a short position`,
        })
      }
    }
  }

  const side = sideBoolean ? 'Buy' : 'Sell'

  if (dryRun) {
    return c.ok({
      dryRun: true,
      coin: normalizedCoin,
      triggerPrice: formattedTriggerPx,
      side,
      positionSide,
      status: 'DRY_RUN',
    })
  }

  try {
    const response = await c.var.exchange.order({
      orders: [
        {
          a: assetId,
          b: sideBoolean,
          p: formattedTriggerPx,
          s: '0',
          r: true,
          t: { trigger: { isMarket: true, triggerPx: formattedTriggerPx, tpsl } },
        },
      ],
      grouping: 'positionTpsl',
    })

    const parsed = parseOrderStatus(response?.response?.data?.statuses?.[0])
    if (parsed.kind === 'error') {
      return c.error({ code: 'ORDER_REJECTED', message: parsed.message })
    }

    const statusStr = parsed.kind === 'string' ? parsed.value : parsed.kind

    return c.ok(
      {
        dryRun: false,
        coin: normalizedCoin,
        triggerPrice: formattedTriggerPx,
        side,
        positionSide,
        status: statusStr,
      },
      { cta: { commands: [{ command: 'orders', description: 'View trigger orders' }] } },
    )
  } catch (err) {
    return c.error({ code: tpsl === 'tp' ? 'TP_FAILED' : 'SL_FAILED', message: errorMessage(err) })
  }
}

const triggerOutput = z.object({
  dryRun: z.boolean(),
  coin: z.string(),
  triggerPrice: z.string(),
  side: z.string(),
  positionSide: z.string(),
  status: z.string(),
})

position.command('tp', {
  description: 'Place a take-profit trigger order against an existing position',
  args: z.object({ coin: z.string().describe('Coin symbol') }),
  options: z.object({
    price: z.string().describe('Take-profit trigger price'),
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
  examples: [
    {
      args: { coin: 'BTC' },
      options: { price: '100000' },
      description: 'Take-profit on BTC at $100k',
    },
  ],
  hint: 'Scales with position size. Auto-detects long/short direction.',
  alias: { dryRun: 'd' },
  output: triggerOutput,
  async run(c: any) {
    const guard = requireExchange(c, 'place orders')
    if (guard) return guard

    try {
      return await placeTriggerOrder(
        c,
        normalizePerpCoin(c.args.coin),
        c.options.price,
        'tp',
        c.options.dryRun,
      )
    } catch (err) {
      return c.error({ code: 'TP_FAILED', message: errorMessage(err) })
    }
  },
})

position.command('sl', {
  description: 'Place a stop-loss trigger order against an existing position',
  args: z.object({ coin: z.string().describe('Coin symbol') }),
  options: z.object({
    price: z.string().describe('Stop-loss trigger price'),
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
  examples: [
    { args: { coin: 'BTC' }, options: { price: '90000' }, description: 'Stop-loss on BTC at $90k' },
  ],
  hint: 'Scales with position size. Auto-detects long/short direction.',
  alias: { dryRun: 'd' },
  output: triggerOutput,
  async run(c: any) {
    const guard = requireExchange(c, 'place orders')
    if (guard) return guard

    try {
      return await placeTriggerOrder(
        c,
        normalizePerpCoin(c.args.coin),
        c.options.price,
        'sl',
        c.options.dryRun,
      )
    } catch (err) {
      return c.error({ code: 'SL_FAILED', message: errorMessage(err) })
    }
  },
})
