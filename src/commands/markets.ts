import { z } from 'incur'
import { listPerpMarkets } from '../lib/perps.js'

export const markets = {
  description: 'List available perpetual markets across the main exchange and builder dexs',
  examples: [
    { description: 'List all available perpetual markets, including dex-qualified symbols' },
  ],
  output: z.object({
    markets: z.array(
      z.object({
        name: z.string(),
        szDecimals: z.number(),
        maxLeverage: z.number(),
      }),
    ),
  }),
  async run(c: any) {
    const marketList = (await listPerpMarkets(c.var.info)).map((m) => ({
      name: m.name,
      szDecimals: m.szDecimals,
      maxLeverage: m.maxLeverage,
    }))

    return c.ok({ markets: marketList })
  },
}
