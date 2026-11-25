import { Cli, z } from 'incur'
import {
  resolveAsset,
  buildAssetMap,
  formatPrice,
  formatSize,
  errorMessage,
  parseOrderStatus,
  requireExchange,
  normalizePerpCoin,
} from '../lib/exchange.js'
import { getPerpMidPrice, listUserPerpOpenOrders } from '../lib/perps.js'
import { CROSSED_TRIGGER_WARNING, executeTriggerOrder } from '../lib/trigger.js'

const TIF_MAP: Record<string, 'Gtc' | 'Ioc' | 'Alo'> = {
  GTC: 'Gtc',
  IOC: 'Ioc',
  ALO: 'Alo',
}

export const order = Cli.create('order', {
  description: 'Place and manage orders, including stop-market and stop-limit entries',
})

order.command('create', {
  description: 'Place a limit or market order',
  args: z.object({
    coin: z.string().describe('Coin symbol (BTC, ETH)'),
    side: z.enum(['buy', 'sell']).describe('Order side'),
    size: z.string().describe('Order size in base currency units'),
    price: z.string().optional().describe('Limit price — omit for market order'),
  }),
  options: z.object({
    tif: z.enum(['GTC', 'IOC', 'ALO']).default('GTC').describe('Time-in-force for limit orders'),
    slippage: z.number().default(3).describe('Slippage tolerance % for market orders'),
    reduceOnly: z.boolean().default(false).describe('Reduce-only flag'),
    tp: z.string().optional().describe('Inline take-profit trigger price'),
    sl: z.string().optional().describe('Inline stop-loss trigger price'),
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
  examples: [
    {
      args: { coin: 'BTC', side: 'buy', size: '0.001', price: '95000' },
      description: 'Limit buy 0.001 BTC at $95,000',
    },
    { args: { coin: 'ETH', side: 'sell', size: '1.5' }, description: 'Market sell 1.5 ETH' },
    {
      args: { coin: 'BTC', side: 'buy', size: '0.01' },
      options: { tp: '100000', sl: '90000' },
      description: 'Market buy with TP/SL',
    },
  ],
  hint: 'Omit [price] for a market order. Include it for a limit order.',
  alias: { reduceOnly: 'r', dryRun: 'd' },
  output: z.object({
    dryRun: z.boolean(),
    type: z.string(),
    coin: z.string(),
    side: z.string(),
    size: z.string(),
    price: z.string(),
    tif: z.string().optional(),
    reduceOnly: z.boolean(),
    status: z.string(),
    oid: z.number().nullable(),
    avgPx: z.string().optional(),
    totalSz: z.string().optional(),
    tpStatus: z.string().optional(),
    slStatus: z.string().optional(),
  }),
  async run(c: any) {
    const guard = requireExchange(c, 'place orders')
    if (guard) return guard

    const coin = normalizePerpCoin(c.args.coin)

    let assetId: number
    let szDecimals: number
    try {
      const resolved = await resolveAsset(c.var.info, coin)
      assetId = resolved.assetId
      szDecimals = resolved.szDecimals
    } catch (err) {
      return c.error({ code: 'ASSET_NOT_FOUND', message: errorMessage(err) })
    }

    let formattedSize: string
    try {
      formattedSize = formatSize(c.args.size, szDecimals)
    } catch (err) {
      return c.error({
        code: 'INVALID_SIZE',
        message: `Invalid size "${c.args.size}": ${errorMessage(err)}`,
      })
    }

    const isBuy = c.args.side === 'buy'

    // Determine order type and price
    let formattedPrice: string
    let orderType: string
    let tifStr: 'Gtc' | 'Ioc' | 'Alo' | 'FrontendMarket'

    if (c.args.price !== undefined) {
      // Limit order
      orderType = 'limit'
      try {
        formattedPrice = formatPrice(c.args.price!, szDecimals, 'perp')
      } catch (err) {
        return c.error({
          code: 'INVALID_PRICE',
          message: `Invalid price "${c.args.price}": ${errorMessage(err)}`,
        })
      }
      tifStr = TIF_MAP[c.options.tif] ?? 'Gtc'
    } else {
      // Market order — fetch mid price and apply slippage
      orderType = 'market'
      tifStr = 'FrontendMarket'

      let mid: string | undefined
      try {
        mid = await getPerpMidPrice(c.var.info, coin)
      } catch (err) {
        return c.error({
          code: 'PRICE_FETCH_FAILED',
          message: `Failed to fetch mid prices: ${errorMessage(err)}`,
        })
      }

      if (!mid) {
        return c.error({ code: 'PRICE_NOT_FOUND', message: `No mid price found for ${coin}` })
      }

      const midNum = parseFloat(mid)
      const slippageFactor = c.options.slippage / 100
      const slippagePrice = isBuy ? midNum * (1 + slippageFactor) : midNum * (1 - slippageFactor)
      formattedPrice = formatPrice(slippagePrice, szDecimals, 'perp')
    }

    // Build orders array
    const orders: any[] = [
      {
        a: assetId,
        b: isBuy,
        p: formattedPrice,
        s: formattedSize,
        r: c.options.reduceOnly,
        t: { limit: { tif: tifStr } },
      },
    ]

    let tpIndex: number | undefined
    let slIndex: number | undefined

    if (c.options.tp) {
      let tpPx: string
      try {
        tpPx = formatPrice(c.options.tp, szDecimals, 'perp')
      } catch (err) {
        return c.error({
          code: 'INVALID_PRICE',
          message: `Invalid TP price "${c.options.tp}": ${errorMessage(err)}`,
        })
      }
      tpIndex = orders.length
      orders.push({
        a: assetId,
        b: !isBuy,
        p: tpPx,
        s: formattedSize,
        r: true,
        t: { trigger: { isMarket: true, triggerPx: tpPx, tpsl: 'tp' } },
      })
    }

    if (c.options.sl) {
      let slPx: string
      try {
        slPx = formatPrice(c.options.sl, szDecimals, 'perp')
      } catch (err) {
        return c.error({
          code: 'INVALID_PRICE',
          message: `Invalid SL price "${c.options.sl}": ${errorMessage(err)}`,
        })
      }
      slIndex = orders.length
      orders.push({
        a: assetId,
        b: !isBuy,
        p: slPx,
        s: formattedSize,
        r: true,
        t: { trigger: { isMarket: true, triggerPx: slPx, tpsl: 'sl' } },
      })
    }

    const grouping = tpIndex !== undefined || slIndex !== undefined ? 'normalTpsl' : 'na'

    // Dry-run: return preview without executing
    if (c.options.dryRun) {
      return c.ok({
        dryRun: true,
        type: orderType,
        coin,
        side: c.args.side,
        size: formattedSize,
        price: formattedPrice,
        tif: orderType === 'limit' ? c.options.tif : undefined,
        reduceOnly: c.options.reduceOnly,
        status: 'DRY_RUN',
        oid: null,
      })
    }

    // Execute order
    try {
      const response = await c.var.exchange.order({ orders, grouping })
      const statuses = response.response.data.statuses

      const main = parseOrderStatus(statuses[0])
      if (main.kind === 'error') {
        return c.error({ code: 'ORDER_REJECTED', message: main.message })
      }

      const status = main.kind === 'string' ? main.value : main.kind
      const oid = main.kind === 'resting' || main.kind === 'filled' ? main.oid : null
      const avgPx = main.kind === 'filled' ? main.avgPx : undefined
      const totalSz = main.kind === 'filled' ? main.totalSz : undefined

      // Parse TP/SL statuses if present
      let tpStatus: string | undefined
      let slStatus: string | undefined

      if (tpIndex !== undefined && statuses[tpIndex]) {
        const tp = parseOrderStatus(statuses[tpIndex])
        tpStatus =
          tp.kind === 'error' ? `error: ${tp.message}` : tp.kind === 'string' ? tp.value : tp.kind
      }

      if (slIndex !== undefined && statuses[slIndex]) {
        const sl = parseOrderStatus(statuses[slIndex])
        slStatus =
          sl.kind === 'error' ? `error: ${sl.message}` : sl.kind === 'string' ? sl.value : sl.kind
      }

      return c.ok(
        {
          dryRun: false,
          type: orderType,
          coin,
          side: c.args.side,
          size: formattedSize,
          price: formattedPrice,
          tif: orderType === 'limit' ? c.options.tif : undefined,
          reduceOnly: c.options.reduceOnly,
          status,
          oid,
          avgPx,
          totalSz,
          tpStatus,
          slStatus,
        },
        {
          cta: {
            commands: [
              { command: 'orders', description: 'View open orders' },
              { command: 'positions', description: 'View positions' },
            ],
          },
        },
      )
    } catch (err) {
      return c.error({ code: 'ORDER_FAILED', message: errorMessage(err) })
    }
  },
})

order.command('trigger', {
  description:
    'Place a stop entry (stop-market or stop-limit). Size is absolute and does not scale with a position. Reduce-only defaults to false, so the order can open or flip a position.',
  args: z.object({
    coin: z.string().describe('Coin symbol (BTC, ETH)'),
    side: z.enum(['buy', 'sell']).describe('Order side'),
    size: z.string().describe('Absolute order size in base units. Does not scale with position'),
  }),
  options: z.object({
    trigger: z.string().describe('Trigger price. Direction versus the mark depends on --tpsl'),
    limit: z
      .string()
      .optional()
      .describe('Limit price. Omit for a stop-market; set for a stop-limit'),
    tpsl: z
      .enum(['sl', 'tp'])
      .default('sl')
      .describe(
        'Trigger style. sl (default): buy fires when price rises, sell when it falls. tp is the opposite',
      ),
    reduceOnly: z
      .boolean()
      .default(false)
      .describe(
        'Reduce-only. Default false so the order can open or flip a position. `--reduce-only false` (space) parses as true; use --no-reduce-only or --reduce-only=false',
      ),
    slippage: z
      .number()
      .min(0)
      .lt(100)
      .default(3)
      .describe(
        'Slippage % for the stop-market limit. Default 3 matches market orders. Pass 10 to match the Hyperliquid UI',
      ),
    force: z
      .boolean()
      .default(false)
      .describe(
        `Place even if the trigger is on the wrong side of the mark. ${CROSSED_TRIGGER_WARNING}`,
      ),
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
  examples: [
    {
      args: { coin: 'BTC', side: 'sell', size: '0.5' },
      options: { trigger: '56666' },
      description: 'Sell stop-market 0.5 BTC if price falls to 56666',
    },
    {
      args: { coin: 'BTC', side: 'buy', size: '0.1' },
      options: { trigger: '100000', limit: '100500' },
      description: 'Buy stop-limit 0.1 BTC, trigger 100000, limit 100500',
    },
    {
      args: { coin: 'BTC', side: 'sell', size: '0.5' },
      options: { trigger: '56666', slippage: 10, dryRun: true },
      description: 'Preview a sell stop-market with the 10% bound the Hyperliquid UI uses',
    },
  ],
  hint: 'Omit --limit for a stop-market. Default slippage is 3% (same as market orders); pass --slippage 10 so a stop-market is more likely to fill, matching the Hyperliquid UI. --tpsl sl (default) buys above the mark and sells below it; --tpsl tp is the opposite. --force places an already-crossed trigger, which may fill immediately or be rejected. Cancel with: order cancel <oid>.',
  alias: { reduceOnly: 'r', dryRun: 'd' },
  output: z.object({
    dryRun: z.boolean().describe('True when the order was not sent'),
    type: z.enum(['stop-market', 'stop-limit']).describe('stop-market when --limit is omitted'),
    coin: z.string(),
    side: z.string(),
    size: z.string().describe('Absolute size sent to the exchange'),
    triggerPx: z.string().describe('Price that activates the order'),
    limitPx: z
      .string()
      .describe('Limit price. For a stop-market this is the slippage bound, not the trigger'),
    isMarket: z.boolean().describe('True for stop-market (Hyperliquid trigger isMarket)'),
    reduceOnly: z.boolean(),
    tpsl: z.enum(['sl', 'tp']).describe('Trigger style sent to Hyperliquid'),
    slippage: z.number().optional().describe('Slippage % used for a stop-market limit'),
    avgPx: z.string().optional().describe('Average fill price when the order fills immediately'),
    totalSz: z.string().optional().describe('Filled size when the order fills immediately'),
    markPx: z.string().describe('Mark price used for the direction check'),
    warning: z.string().optional().describe('Set when --force overrides a wrong-side trigger'),
    status: z.string(),
    oid: z.number().nullable().describe('Exchange order id, or null for a dry run'),
  }),
  async run(c: any) {
    // Watch-only accounts can preview. A live order still needs a private key.
    if (!c.options.dryRun) {
      const guard = requireExchange(c, 'place orders')
      if (guard) return guard
    }

    const result = await executeTriggerOrder(
      { info: c.var.info, exchange: c.var.exchange },
      { coin: c.args.coin, side: c.args.side, size: c.args.size },
      {
        trigger: c.options.trigger,
        limit: c.options.limit,
        reduceOnly: c.options.reduceOnly,
        slippage: c.options.slippage,
        dryRun: c.options.dryRun,
        force: c.options.force,
        tpsl: c.options.tpsl,
      },
    )

    if (!result.ok) return c.error({ code: result.code, message: result.message })

    if (result.data.dryRun) return c.ok(result.data)

    const commands = [{ command: 'orders', description: 'View open orders' }]
    if (result.data.oid != null) {
      commands.unshift({
        command: `order cancel ${result.data.oid}`,
        description: 'Cancel this trigger order',
      })
    }

    return c.ok(result.data, { cta: { commands } })
  },
})

order.command('cancel', {
  description: 'Cancel an order by ID',
  args: z.object({
    oid: z.coerce.number().describe('Order ID to cancel'),
  }),
  options: z.object({
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
  examples: [{ args: { oid: 12345 }, description: 'Cancel order by ID' }],
  hint: 'Find order IDs with: hl orders',
  alias: { dryRun: 'd' },
  output: z.object({
    dryRun: z.boolean(),
    cancelled: z.object({
      oid: z.number(),
      coin: z.string(),
      side: z.string(),
      size: z.string(),
      price: z.string(),
      triggerPx: z
        .string()
        .nullable()
        .describe('Trigger price for a trigger order, otherwise null'),
    }),
  }),
  async run(c: any) {
    const guard = requireExchange(c, 'cancel orders')
    if (guard) return guard

    // Fetch open orders and encoded asset IDs in parallel
    let openOrders: any[]
    let assetMap: Map<string, number>
    try {
      ;[openOrders, assetMap] = await Promise.all([
        listUserPerpOpenOrders(c.var.info, c.var.address),
        buildAssetMap(c.var.info),
      ])
    } catch (err) {
      return c.error({ code: 'FETCH_ORDERS_FAILED', message: errorMessage(err) })
    }

    // Find the target order
    const target = openOrders.find((o: any) => o.oid === c.args.oid)
    if (!target) {
      return c.error({
        code: 'ORDER_NOT_FOUND',
        message: `Order ${c.args.oid} not found in open orders`,
      })
    }

    const cancelledDetails = {
      oid: target.oid,
      coin: target.coin,
      side: target.side,
      size: target.size ?? '0',
      price: target.price ?? '0',
      triggerPx: target.triggerPx ?? null,
    }

    if (c.options.dryRun) {
      return c.ok({ dryRun: true, cancelled: cancelledDetails })
    }

    const assetId = assetMap.get(target.coin)
    if (assetId === undefined) {
      return c.error({ code: 'ASSET_NOT_FOUND', message: `Asset ID not found for ${target.coin}` })
    }

    try {
      const response = await c.var.exchange.cancel({ cancels: [{ a: assetId, o: c.args.oid }] })
      const cancelStatus = parseOrderStatus(response.response.data.statuses[0])

      if (cancelStatus.kind === 'error') {
        return c.error({ code: 'CANCEL_FAILED', message: cancelStatus.message })
      }

      return c.ok(
        { dryRun: false, cancelled: cancelledDetails },
        { cta: { commands: [{ command: 'orders', description: 'View remaining orders' }] } },
      )
    } catch (err) {
      return c.error({ code: 'CANCEL_FAILED', message: errorMessage(err) })
    }
  },
})

order.command('cancel-all', {
  description: 'Cancel all open orders (optionally filtered by coin)',
  options: z.object({
    coin: z.string().optional().describe('Filter by coin symbol'),
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
  examples: [
    { description: 'Cancel all open orders' },
    { options: { coin: 'BTC' }, description: 'Cancel all BTC orders' },
  ],
  hint: 'Use --coin to cancel only orders for a specific market.',
  alias: { dryRun: 'd' },
  output: z.object({
    dryRun: z.boolean(),
    count: z.number(),
    cancelled: z.array(
      z.object({
        oid: z.number(),
        coin: z.string(),
        side: z.string(),
        size: z.string(),
      }),
    ),
    failed: z.array(z.object({ oid: z.number(), error: z.string() })).optional(),
  }),
  async run(c: any) {
    const guard = requireExchange(c, 'cancel orders')
    if (guard) return guard

    // Fetch open orders and encoded asset IDs in parallel
    let openOrders: any[]
    let assetMap: Map<string, number>
    try {
      ;[openOrders, assetMap] = await Promise.all([
        listUserPerpOpenOrders(c.var.info, c.var.address),
        buildAssetMap(c.var.info),
      ])
    } catch (err) {
      return c.error({ code: 'FETCH_ORDERS_FAILED', message: errorMessage(err) })
    }

    // Filter by coin if provided
    const filterCoin = c.options.coin ? normalizePerpCoin(c.options.coin) : undefined
    const filtered = filterCoin
      ? openOrders.filter((o: any) => normalizePerpCoin(o.coin ?? '') === filterCoin)
      : openOrders

    if (filtered.length === 0) {
      return c.ok({ dryRun: c.options.dryRun, count: 0, cancelled: [] })
    }

    const cancelledSummary = filtered.map((o: any) => ({
      oid: o.oid,
      coin: o.coin,
      side: o.side,
      size: o.size ?? '0',
    }))

    if (c.options.dryRun) {
      return c.ok({ dryRun: true, count: filtered.length, cancelled: cancelledSummary })
    }

    // Build cancels array, skipping orders with unknown coins
    const cancels: { a: number; o: number }[] = []
    for (const o of filtered) {
      const a = assetMap.get(o.coin)
      if (a === undefined) continue
      cancels.push({ a, o: o.oid })
    }

    if (cancels.length === 0) {
      return c.error({
        code: 'CANCEL_ALL_FAILED',
        message: 'Could not resolve asset IDs for any orders',
      })
    }

    try {
      const response = await c.var.exchange.cancel({ cancels })
      const statuses = response?.response?.data?.statuses ?? []

      // Check for partial failures
      const failed: { oid: number; error: string }[] = []
      for (let i = 0; i < statuses.length; i++) {
        const parsed = parseOrderStatus(statuses[i])
        if (parsed.kind === 'error') {
          failed.push({ oid: filtered[i].oid, error: parsed.message })
        }
      }

      if (failed.length > 0 && failed.length === filtered.length) {
        return c.error({
          code: 'CANCEL_ALL_FAILED',
          message: `All ${failed.length} cancellations failed: ${failed[0]!.error}`,
        })
      }

      const actualCancelled = cancelledSummary.filter(
        (_: any, i: number) => !failed.some((f) => f.oid === filtered[i].oid),
      )

      return c.ok(
        {
          dryRun: false,
          count: actualCancelled.length,
          cancelled: actualCancelled,
          ...(failed.length > 0 ? { failed } : {}),
        },
        { cta: { commands: [{ command: 'orders', description: 'Confirm no remaining orders' }] } },
      )
    } catch (err) {
      return c.error({ code: 'CANCEL_ALL_FAILED', message: errorMessage(err) })
    }
  },
})
