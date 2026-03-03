import { Cli, z } from 'incur'
import { resolveAsset, formatPrice } from '../lib/exchange.js'

export const position = Cli.create('position', {
  description: 'Manage position settings — leverage, take-profit, stop-loss',
})

position.command('leverage', {
  description: 'Set leverage for a coin (cross or isolated)',
  args: z.object({
    coin: z.string().describe('Coin symbol (e.g. BTC, ETH)'),
    leverage: z.coerce.number().int().min(1).describe('Leverage value (1-100)'),
  }),
  options: z.object({
    isolated: z.boolean().default(false).describe('Use isolated margin mode'),
    cross: z.boolean().default(false).describe('Use cross margin mode (default)'),
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
  alias: { dryRun: 'd' },
  output: z.object({
    dryRun: z.boolean(),
    coin: z.string(),
    leverage: z.number(),
    mode: z.string(),
  }),
  async run(c: any) {
    if (!c.var.exchange) {
      return c.error({
        code: 'READ_ONLY_ACCOUNT',
        message: 'This account has no private key and cannot set leverage',
        cta: {
          commands: [{ command: 'account add --name main', description: 'Add a trading account' }],
          description: 'Get started:',
        },
      })
    }

    if (c.options.isolated && c.options.cross) {
      return c.error({
        code: 'CONFLICTING_FLAGS',
        message: 'Cannot use both --isolated and --cross flags at the same time',
      })
    }

    const coin = c.args.coin.toUpperCase()

    let assetId: number
    try {
      const resolved = await resolveAsset(c.var.info, coin)
      assetId = resolved.assetId
    } catch (err) {
      return c.error({
        code: 'UNKNOWN_COIN',
        message: err instanceof Error ? err.message : String(err),
      })
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
      return c.ok({ dryRun: false, coin, leverage: c.args.leverage, mode })
    } catch (err) {
      return c.error({
        code: 'LEVERAGE_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

/**
 * Shared helper for placing position-level TP or SL trigger orders.
 * Auto-detects position direction from clearinghouseState.
 */
async function placeTriggerOrder(
  c: any,
  coin: string,
  triggerPrice: string,
  tpsl: 'tp' | 'sl',
  dryRun: boolean,
) {
  const { assetId, szDecimals } = await resolveAsset(c.var.info, coin)

  // Auto-detect position direction
  const state = await c.var.info.clearinghouseState({ user: c.var.address })
  const posEntry = (state.assetPositions ?? []).find(
    (ap: any) => ap.position?.coin?.toUpperCase() === coin,
  )

  if (!posEntry) {
    return c.error({
      code: 'NO_POSITION',
      message: `No open position for ${coin}`,
      cta: {
        commands: [{ command: 'positions', description: 'View open positions' }],
      },
    })
  }

  const szi = parseFloat(posEntry.position?.szi ?? '0')
  if (szi === 0) {
    return c.error({
      code: 'NO_POSITION',
      message: `No open position for ${coin}`,
      cta: {
        commands: [{ command: 'positions', description: 'View open positions' }],
      },
    })
  }

  const isLong = szi > 0
  const positionSide = isLong ? 'Long' : 'Short'

  // For TP: long sells (b=false), short buys (b=true)
  // For SL: same direction logic (close the position)
  const sideBoolean = !isLong // sell to close long, buy to close short

  const formattedTriggerPx = formatPrice(triggerPrice, szDecimals, 'perp')

  // Validate trigger price direction against current mid
  const mids = await c.var.info.allMids()
  const midRaw = mids[coin] ?? mids[coin.toUpperCase()]
  const mid = parseFloat(midRaw)

  if (!isNaN(mid)) {
    const triggerNum = parseFloat(formattedTriggerPx)
    if (tpsl === 'tp') {
      // Long TP must be above mid; short TP must be below mid
      if (isLong && triggerNum <= mid) {
        return c.error({
          code: 'INVALID_TP_PRICE',
          message: `Take-profit price must be above current price (${mid}) for a long position`,
        })
      }
      if (!isLong && triggerNum >= mid) {
        return c.error({
          code: 'INVALID_TP_PRICE',
          message: `Take-profit price must be below current price (${mid}) for a short position`,
        })
      }
    } else {
      // Long SL must be below mid; short SL must be above mid
      if (isLong && triggerNum >= mid) {
        return c.error({
          code: 'INVALID_SL_PRICE',
          message: `Stop-loss price must be below current price (${mid}) for a long position`,
        })
      }
      if (!isLong && triggerNum <= mid) {
        return c.error({
          code: 'INVALID_SL_PRICE',
          message: `Stop-loss price must be above current price (${mid}) for a short position`,
        })
      }
    }
  }

  const side = sideBoolean ? 'Buy' : 'Sell'

  if (dryRun) {
    return c.ok({
      dryRun: true,
      coin,
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
          t: {
            trigger: {
              isMarket: true,
              triggerPx: formattedTriggerPx,
              tpsl,
            },
          },
        },
      ],
      grouping: 'positionTpsl',
    })

    const status = response?.response?.data?.statuses?.[0]
    let statusStr = 'waitingForTrigger'
    if (typeof status === 'object' && status !== null) {
      if ('resting' in status) statusStr = 'resting'
      else if ('filled' in status) statusStr = 'filled'
      else if ('error' in status) {
        return c.error({
          code: 'ORDER_REJECTED',
          message: (status as any).error,
        })
      }
    } else if (typeof status === 'string') {
      statusStr = status
    }

    return c.ok({
      dryRun: false,
      coin,
      triggerPrice: formattedTriggerPx,
      side,
      positionSide,
      status: statusStr,
    })
  } catch (err) {
    return c.error({
      code: tpsl === 'tp' ? 'TP_FAILED' : 'SL_FAILED',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

position.command('tp', {
  description: 'Place a take-profit trigger order against an existing position',
  args: z.object({
    coin: z.string().describe('Coin symbol'),
  }),
  options: z.object({
    price: z.string().describe('Take-profit trigger price'),
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
  alias: { dryRun: 'd' },
  output: z.object({
    dryRun: z.boolean(),
    coin: z.string(),
    triggerPrice: z.string(),
    side: z.string(),
    positionSide: z.string(),
    status: z.string(),
  }),
  async run(c: any) {
    if (!c.var.exchange) {
      return c.error({
        code: 'READ_ONLY_ACCOUNT',
        message: 'This account has no private key and cannot place orders',
        cta: {
          commands: [{ command: 'account add --name main', description: 'Add a trading account' }],
          description: 'Get started:',
        },
      })
    }

    const coin = c.args.coin.toUpperCase()

    try {
      return await placeTriggerOrder(c, coin, c.options.price, 'tp', c.options.dryRun)
    } catch (err) {
      return c.error({
        code: 'TP_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

position.command('sl', {
  description: 'Place a stop-loss trigger order against an existing position',
  args: z.object({
    coin: z.string().describe('Coin symbol'),
  }),
  options: z.object({
    price: z.string().describe('Stop-loss trigger price'),
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
  alias: { dryRun: 'd' },
  output: z.object({
    dryRun: z.boolean(),
    coin: z.string(),
    triggerPrice: z.string(),
    side: z.string(),
    positionSide: z.string(),
    status: z.string(),
  }),
  async run(c: any) {
    if (!c.var.exchange) {
      return c.error({
        code: 'READ_ONLY_ACCOUNT',
        message: 'This account has no private key and cannot place orders',
        cta: {
          commands: [{ command: 'account add --name main', description: 'Add a trading account' }],
          description: 'Get started:',
        },
      })
    }

    const coin = c.args.coin.toUpperCase()

    try {
      return await placeTriggerOrder(c, coin, c.options.price, 'sl', c.options.dryRun)
    } catch (err) {
      return c.error({
        code: 'SL_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  },
})
