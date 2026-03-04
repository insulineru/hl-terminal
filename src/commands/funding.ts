import { z } from 'incur'

export const funding = {
  description: 'View current funding rates or funding history for a specific coin',
  args: z.object({
    coin: z
      .string()
      .optional()
      .describe('Coin symbol (e.g. BTC). If omitted, shows all current rates'),
  }),
  examples: [
    { args: { coin: 'BTC' }, description: 'BTC funding history (7 days)' },
    { description: 'Current funding rates for all coins' },
  ],
  hint: 'Without a coin argument, fetches current rates for all markets (may take a few seconds).',
  output: z.object({
    rates: z.array(
      z.object({
        coin: z.string(),
        fundingRate: z.string(),
        premium: z.string(),
        time: z.number().optional(),
      }),
    ),
  }),
  async run(c: any) {
    const coin = c.args.coin?.toUpperCase()

    if (coin) {
      // Funding history for specific coin (last 7 days)
      const startTime = Date.now() - 7 * 24 * 60 * 60 * 1000
      const history = await c.var.info.fundingHistory({
        coin,
        startTime,
      })

      const rates = (history ?? []).map((h: any) => ({
        coin: h.coin ?? coin,
        fundingRate: h.fundingRate ?? '0',
        premium: h.premium ?? '0',
        time: h.time ?? 0,
      }))

      return c.ok({ rates })
    }

    // Current funding rates for all coins
    // Get meta for coin list, then fetch latest funding for each
    const meta = await c.var.info.meta()
    const coins = (meta.universe ?? []).map((m: any) => m.name)

    // Fetch funding for all coins in parallel (last 1 hour to get the latest entry)
    const startTime = Date.now() - 60 * 60 * 1000
    const results = await Promise.all(
      coins.map(async (coinName: string) => {
        try {
          const history = await c.var.info.fundingHistory({
            coin: coinName,
            startTime,
          })
          const latest = history?.[history.length - 1]
          if (latest) {
            return {
              coin: coinName,
              fundingRate: latest.fundingRate ?? '0',
              premium: latest.premium ?? '0',
              time: latest.time,
            }
          }
          return null
        } catch {
          return null
        }
      }),
    )

    const rates = results.filter((r: any) => r !== null)

    return c.ok({ rates })
  },
}
