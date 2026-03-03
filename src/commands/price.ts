import { z } from 'incur'

export const price = {
  description: 'Get current mid-price for a coin',
  args: z.object({
    coin: z.string().describe('Coin symbol (e.g. BTC, ETH, SOL)'),
  }),
  output: z.object({
    coin: z.string(),
    mid: z.string(),
  }),
  async run(c: any) {
    const coin = c.args.coin.toUpperCase()
    const mids = await c.var.info.allMids()
    const mid = mids[coin]

    if (!mid) {
      return c.error({
        code: 'UNKNOWN_COIN',
        message: `Unknown coin: ${coin}`,
        cta: {
          commands: [{ command: 'markets', description: 'List available coins' }],
          description: 'Try:',
        },
      })
    }

    return c.ok({ coin, mid })
  },
}
