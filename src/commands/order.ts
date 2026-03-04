import { Cli, z } from 'incur'
import {
  resolveAsset,
  buildAssetMap,
  formatPrice,
  formatSize,
  formatSide,
  errorMessage,
  parseOrderStatus,
  requireExchange,
} from '../lib/exchange.js'

const TIF_MAP: Record<string, 'Gtc' | 'Ioc' | 'Alo'> = {
  GTC: 'Gtc',
  IOC: 'Ioc',
  ALO: 'Alo',
}

export const order = Cli.create('order', {
  description: 'Place and manage orders',
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

    const coin = c.args.coin.toUpperCase()

    let assetId: number
    let szDecimals: number
    try {
      const resolved = await resolveAsset(c.var.info, coin)
      assetId = resolved.assetId
      szDecimals = resolved.szDecimals
    } catch (err) {
      return c.error({ code: 'ASSET_NOT_FOUND', message: errorMessage(err) })
    }

    const formattedSize = formatSize(c.args.size, szDecimals)
    const isBuy = c.args.side === 'buy'

    // Determine order type and price
    let formattedPrice: string
    let orderType: string
    let tifStr: 'Gtc' | 'Ioc' | 'Alo' | 'FrontendMarket'

    if (c.args.price !== undefined) {
      // Limit order
      orderType = 'limit'
      formattedPrice = formatPrice(c.args.price!, szDecimals, 'perp')
      tifStr = TIF_MAP[c.options.tif] ?? 'Gtc'
    } else {
      // Market order — fetch mid price and apply slippage
      orderType = 'market'
      tifStr = 'FrontendMarket'

      let allMids: Record<string, string>
      try {
        allMids = await c.var.info.allMids()
      } catch (err) {
        return c.error({
          code: 'PRICE_FETCH_FAILED',
          message: `Failed to fetch mid prices: ${errorMessage(err)}`,
        })
      }

      const mid = allMids[coin]
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
      const tpPx = formatPrice(c.options.tp, szDecimals, 'perp')
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
      const slPx = formatPrice(c.options.sl, szDecimals, 'perp')
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
        tpStatus = tp.kind === 'error' ? `error: ${tp.message}` : tp.kind === 'string' ? tp.value : tp.kind
      }

      if (slIndex !== undefined && statuses[slIndex]) {
        const sl = parseOrderStatus(statuses[slIndex])
        slStatus = sl.kind === 'error' ? `error: ${sl.message}` : sl.kind === 'string' ? sl.value : sl.kind
      }

      return c.ok({
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
      })
    } catch (err) {
      return c.error({ code: 'ORDER_FAILED', message: errorMessage(err) })
    }
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
  alias: { dryRun: 'd' },
  output: z.object({
    dryRun: z.boolean(),
    cancelled: z.object({
      oid: z.number(),
      coin: z.string(),
      side: z.string(),
      size: z.string(),
      price: z.string(),
    }),
  }),
  async run(c: any) {
    const guard = requireExchange(c, 'cancel orders')
    if (guard) return guard

    // Fetch open orders and meta in parallel
    let openOrders: any[]
    let assetMap: Map<string, number>
    try {
      ;[openOrders, assetMap] = await Promise.all([
        c.var.info.frontendOpenOrders({ user: c.var.address }),
        buildAssetMap(c.var.info),
      ])
    } catch (err) {
      return c.error({ code: 'FETCH_ORDERS_FAILED', message: errorMessage(err) })
    }

    // Find the target order
    const target = openOrders.find((o: any) => o.oid === c.args.oid)
    if (!target) {
      return c.error({ code: 'ORDER_NOT_FOUND', message: `Order ${c.args.oid} not found in open orders` })
    }

    const cancelledDetails = {
      oid: target.oid,
      coin: target.coin,
      side: formatSide(target.side),
      size: target.sz ?? '0',
      price: target.limitPx ?? target.px ?? '0',
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

      return c.ok({ dryRun: false, cancelled: cancelledDetails })
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
  }),
  async run(c: any) {
    const guard = requireExchange(c, 'cancel orders')
    if (guard) return guard

    // Fetch open orders and meta in parallel
    let openOrders: any[]
    let assetMap: Map<string, number>
    try {
      ;[openOrders, assetMap] = await Promise.all([
        c.var.info.frontendOpenOrders({ user: c.var.address }),
        buildAssetMap(c.var.info),
      ])
    } catch (err) {
      return c.error({ code: 'FETCH_ORDERS_FAILED', message: errorMessage(err) })
    }

    // Filter by coin if provided
    const filterCoin = c.options.coin?.toUpperCase()
    const filtered = filterCoin
      ? openOrders.filter((o: any) => o.coin?.toUpperCase() === filterCoin)
      : openOrders

    if (filtered.length === 0) {
      return c.ok({ dryRun: c.options.dryRun, count: 0, cancelled: [] })
    }

    const cancelledSummary = filtered.map((o: any) => ({
      oid: o.oid,
      coin: o.coin,
      side: formatSide(o.side),
      size: o.sz ?? '0',
    }))

    if (c.options.dryRun) {
      return c.ok({ dryRun: true, count: filtered.length, cancelled: cancelledSummary })
    }

    // Build cancels array using pre-fetched asset map
    const cancels = filtered.map((o: any) => ({
      a: assetMap.get(o.coin)!,
      o: o.oid,
    }))

    try {
      await c.var.exchange.cancel({ cancels })
      return c.ok({ dryRun: false, count: filtered.length, cancelled: cancelledSummary })
    } catch (err) {
      return c.error({ code: 'CANCEL_ALL_FAILED', message: errorMessage(err) })
    }
  },
})
