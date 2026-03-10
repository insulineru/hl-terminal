import { z } from 'incur'
import { getPerpMidPrice, normalizePerpCoin } from '../lib/perps.js'

export const price = {
  description: 'Get current mid-price for a perpetual market',
  args: z.object({
    coin: z.string().describe('Coin symbol (e.g. BTC, ETH, SOL)'),
  }),
  examples: [
    { args: { coin: 'BTC' }, description: 'Get BTC mid-price' },
    { args: { coin: 'xyz:BRENTOIL' }, description: 'Get xyz:BRENTOIL mid-price' },
    { args: { coin: 'ETH' }, description: 'Get ETH mid-price' },
  ],
  output: z.object({
    coin: z.string(),
    mid: z.string(),
  }),
  async run(c: any) {
    const coin = normalizePerpCoin(c.args.coin)
    const mid = await getPerpMidPrice(c.var.info, coin)

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
