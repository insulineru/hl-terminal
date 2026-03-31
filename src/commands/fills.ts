import { z } from 'incur'
import { formatSide } from '../lib/exchange.js'
import { normalizePerpCoin } from '../lib/perps.js'

export const fills = {
  description:
    'View trade fills (execution history). Supports time range queries for full history.',
  args: z.object({
    coin: z.string().optional().describe('Filter by coin symbol (e.g. BTC). If omitted, shows all'),
  }),
  options: z.object({
    limit: z.number().optional().describe('Max number of fills to show (default 50)'),
    days: z.number().optional().describe('Look back N days (default: all time)'),
  }),
  examples: [
    { args: { coin: 'BTC' }, options: { limit: 10 }, description: 'Last 10 BTC fills' },
    { options: { days: 7 }, description: 'All fills from last 7 days' },
  ],
  hint: 'Use --days to filter by time range. Fills are aggregated by time.',
  alias: { limit: 'l', days: 'd' },
  output: z.object({
    fills: z.array(
      z.object({
        time: z.string(),
        coin: z.string(),
        side: z.string(),
        size: z.string(),
        price: z.string(),
        fee: z.string(),
        closedPnl: z.string(),
      }),
    ),
    total: z.number(),
  }),
  async run(c: any) {
    const address = c.var.address
    const limit = c.options.limit ?? 50
    const coin = c.args.coin ? normalizePerpCoin(c.args.coin) : undefined

    // Use userFillsByTime for full history with pagination
    const days = c.options.days
    const startTime = days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0 // epoch = all time

    const rawFills = await c.var.info.userFillsByTime({
      user: address,
      startTime,
      aggregateByTime: true,
      reversed: true, // newest first
    })

    let filtered = rawFills ?? []
    if (coin) {
      filtered = filtered.filter((f: any) => normalizePerpCoin(f.coin) === coin)
    }

    const total = filtered.length

    // Apply limit
    const capped = filtered.slice(0, limit)

    const result = capped.map((f: any) => ({
      time: new Date(f.time).toISOString().replace('T', ' ').slice(0, 19),
      coin: f.coin ?? '',
      side: formatSide(f.side ?? ''),
      size: f.sz ?? '0',
      price: f.px ?? '0',
      fee: f.fee ?? '0',
      closedPnl: f.closedPnl ?? '0',
    }))

    return c.ok({ fills: result, total })
  },
}
