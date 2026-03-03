import { Cli, z } from 'incur'
import { resolveAsset, formatPrice, formatSize } from '../lib/exchange.js'

export const order = Cli.create('order', {
  description: 'Place and manage orders',
})

order.command('create', {
  description: 'Place a limit or market order',
  args: z.object({
    coin: z.string().describe('Coin symbol (BTC, ETH)'),
    side: z.enum(['buy', 'sell']).describe('Order side'),
    size: z.string().describe('Order size in base currency units'),
  }),
  options: z.object({
    price: z.string().optional().describe('Limit price (omit for market order)'),
    tif: z.enum(['GTC', 'IOC', 'ALO']).default('GTC').describe('Time-in-force for limit orders'),
    slippage: z.number().default(3).describe('Slippage tolerance % for market orders'),
    reduceOnly: z.boolean().default(false).describe('Reduce-only flag'),
    tp: z.string().optional().describe('Inline take-profit trigger price'),
    sl: z.string().optional().describe('Inline stop-loss trigger price'),
    dryRun: z.boolean().default(false).describe('Preview without executing'),
  }),
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
    // Guard: read-only account cannot place orders
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

    // Resolve asset
    let assetId: number
    let szDecimals: number
    try {
      const resolved = await resolveAsset(c.var.info, coin)
      assetId = resolved.assetId
      szDecimals = resolved.szDecimals
    } catch (err) {
      return c.error({
        code: 'ASSET_NOT_FOUND',
        message: err instanceof Error ? err.message : String(err),
      })
    }

    const formattedSize = formatSize(c.args.size, szDecimals)
    const isBuy = c.args.side === 'buy'

    // Determine order type and price
    let formattedPrice: string
    let orderType: string
    let tifStr: 'Gtc' | 'Ioc' | 'Alo' | 'FrontendMarket'

    if (c.options.price !== undefined) {
      // Limit order
      orderType = 'limit'
      formattedPrice = formatPrice(c.options.price, szDecimals, 'perp')
      const tifMap: Record<string, 'Gtc' | 'Ioc' | 'Alo'> = {
        GTC: 'Gtc',
        IOC: 'Ioc',
        ALO: 'Alo',
      }
      tifStr = tifMap[c.options.tif] ?? 'Gtc'
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
          message: `Failed to fetch mid prices: ${err instanceof Error ? err.message : String(err)}`,
        })
      }

      const mid = allMids[coin]
      if (!mid) {
        return c.error({
          code: 'PRICE_NOT_FOUND',
          message: `No mid price found for ${coin}`,
        })
      }

      const midNum = parseFloat(mid)
      const slippageFactor = c.options.slippage / 100
      const slippagePrice = isBuy ? midNum * (1 + slippageFactor) : midNum * (1 - slippageFactor)
      formattedPrice = formatPrice(slippagePrice, szDecimals, 'perp')
    }

    // Build the main order object
    const mainOrder = {
      a: assetId,
      b: isBuy,
      p: formattedPrice,
      s: formattedSize,
      r: c.options.reduceOnly,
      t: { limit: { tif: tifStr } },
    }

    // Build orders array, optionally including TP/SL trigger orders
    const orders: (typeof mainOrder)[] = [mainOrder]
    const hasTP = c.options.tp !== undefined
    const hasSL = c.options.sl !== undefined

    if (hasTP && c.options.tp) {
      const tpPx = formatPrice(c.options.tp, szDecimals, 'perp')
      orders.push({
        a: assetId,
        b: !isBuy, // opposite side
        p: tpPx,
        s: formattedSize,
        r: true,
        t: { trigger: { isMarket: true, triggerPx: tpPx, tpsl: 'tp' } } as any,
      })
    }

    if (hasSL && c.options.sl) {
      const slPx = formatPrice(c.options.sl, szDecimals, 'perp')
      orders.push({
        a: assetId,
        b: !isBuy, // opposite side
        p: slPx,
        s: formattedSize,
        r: true,
        t: { trigger: { isMarket: true, triggerPx: slPx, tpsl: 'sl' } } as any,
      })
    }

    const grouping = hasTP || hasSL ? 'normalTpsl' : 'na'

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

      const mainStatus = statuses[0]

      let status: string
      let oid: number | null = null
      let avgPx: string | undefined
      let totalSz: string | undefined

      if (typeof mainStatus === 'object' && mainStatus !== null && 'resting' in mainStatus) {
        status = 'resting'
        oid = (mainStatus as any).resting.oid
      } else if (typeof mainStatus === 'object' && mainStatus !== null && 'filled' in mainStatus) {
        status = 'filled'
        oid = (mainStatus as any).filled.oid
        avgPx = (mainStatus as any).filled.avgPx
        totalSz = (mainStatus as any).filled.totalSz
      } else if (typeof mainStatus === 'object' && mainStatus !== null && 'error' in mainStatus) {
        return c.error({
          code: 'ORDER_REJECTED',
          message: (mainStatus as any).error,
        })
      } else if (mainStatus === 'waitingForFill') {
        status = 'waitingForFill'
      } else if (mainStatus === 'waitingForTrigger') {
        status = 'waitingForTrigger'
      } else {
        status = String(mainStatus)
      }

      // Parse TP/SL statuses if present
      let tpStatus: string | undefined
      let slStatus: string | undefined

      if (hasTP && statuses[1]) {
        const s = statuses[1]
        if (typeof s === 'object' && s !== null && 'resting' in s) tpStatus = 'resting'
        else if (typeof s === 'object' && s !== null && 'filled' in s) tpStatus = 'filled'
        else if (typeof s === 'object' && s !== null && 'error' in s)
          tpStatus = `error: ${(s as any).error}`
        else tpStatus = String(s)
      }

      if (hasSL && statuses[hasTP ? 2 : 1]) {
        const s = statuses[hasTP ? 2 : 1]
        if (typeof s === 'object' && s !== null && 'resting' in s) slStatus = 'resting'
        else if (typeof s === 'object' && s !== null && 'filled' in s) slStatus = 'filled'
        else if (typeof s === 'object' && s !== null && 'error' in s)
          slStatus = `error: ${(s as any).error}`
        else slStatus = String(s)
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
      return c.error({
        code: 'ORDER_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
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
    // Guard: read-only account
    if (!c.var.exchange) {
      return c.error({
        code: 'READ_ONLY_ACCOUNT',
        message: 'This account has no private key and cannot cancel orders',
        cta: {
          commands: [{ command: 'account add --name main', description: 'Add a trading account' }],
          description: 'Get started:',
        },
      })
    }

    // Fetch open orders
    let openOrders: any[]
    try {
      openOrders = await c.var.info.frontendOpenOrders({ user: c.var.address })
    } catch (err) {
      return c.error({
        code: 'FETCH_ORDERS_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    }

    // Find the target order
    const target = openOrders.find((o: any) => o.oid === c.args.oid)
    if (!target) {
      return c.error({
        code: 'ORDER_NOT_FOUND',
        message: `Order ${c.args.oid} not found in open orders`,
      })
    }

    const side = target.side === 'B' ? 'Buy' : target.side === 'A' ? 'Sell' : target.side
    const cancelledDetails = {
      oid: target.oid,
      coin: target.coin,
      side,
      size: target.sz ?? '0',
      price: target.limitPx ?? target.px ?? '0',
    }

    // Dry-run: return details without executing
    if (c.options.dryRun) {
      return c.ok({
        dryRun: true,
        cancelled: cancelledDetails,
      })
    }

    // Resolve asset ID from the order's coin
    let assetId: number
    try {
      const resolved = await resolveAsset(c.var.info, target.coin)
      assetId = resolved.assetId
    } catch (err) {
      return c.error({
        code: 'ASSET_NOT_FOUND',
        message: err instanceof Error ? err.message : String(err),
      })
    }

    // Execute cancel
    try {
      const response = await c.var.exchange.cancel({ cancels: [{ a: assetId, o: c.args.oid }] })
      const cancelStatus = response.response.data.statuses[0]

      if (typeof cancelStatus === 'object' && cancelStatus !== null && 'error' in cancelStatus) {
        return c.error({
          code: 'CANCEL_FAILED',
          message: (cancelStatus as any).error,
        })
      }

      return c.ok({
        dryRun: false,
        cancelled: cancelledDetails,
      })
    } catch (err) {
      return c.error({
        code: 'CANCEL_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
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
    // Guard: read-only account
    if (!c.var.exchange) {
      return c.error({
        code: 'READ_ONLY_ACCOUNT',
        message: 'This account has no private key and cannot cancel orders',
        cta: {
          commands: [{ command: 'account add --name main', description: 'Add a trading account' }],
          description: 'Get started:',
        },
      })
    }

    // Fetch all open orders
    let openOrders: any[]
    try {
      openOrders = await c.var.info.frontendOpenOrders({ user: c.var.address })
    } catch (err) {
      return c.error({
        code: 'FETCH_ORDERS_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
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
      side: o.side === 'B' ? 'Buy' : o.side === 'A' ? 'Sell' : o.side,
      size: o.sz ?? '0',
    }))

    // Dry-run: return list without executing
    if (c.options.dryRun) {
      return c.ok({
        dryRun: true,
        count: filtered.length,
        cancelled: cancelledSummary,
      })
    }

    // Build coin -> assetId map from meta
    let coinToAssetId: Map<string, number>
    try {
      const meta = await c.var.info.meta()
      coinToAssetId = new Map<string, number>()
      meta.universe.forEach((a: any, i: number) => {
        coinToAssetId.set(a.name, i)
      })
    } catch (err) {
      return c.error({
        code: 'META_FETCH_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    }

    // Build cancels array
    const cancels = filtered.map((o: any) => ({
      a: coinToAssetId.get(o.coin)!,
      o: o.oid,
    }))

    // Execute bulk cancel
    try {
      await c.var.exchange.cancel({ cancels })

      return c.ok({
        dryRun: false,
        count: filtered.length,
        cancelled: cancelledSummary,
      })
    } catch (err) {
      return c.error({
        code: 'CANCEL_ALL_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  },
})
