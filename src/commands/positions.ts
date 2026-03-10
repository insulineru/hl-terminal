import { z } from 'incur'
import { listUserPerpPositions } from '../lib/perps.js'

export const positions = {
  description: 'View open perpetual positions across the main exchange and builder dexs',
  examples: [{ description: 'View all open perpetual positions' }],
  output: z.object({
    positions: z.array(
      z.object({
        coin: z.string(),
        size: z.string(),
        entryPx: z.string(),
        unrealizedPnl: z.string(),
        leverage: z.string(),
        liquidationPx: z.string(),
        side: z.string(),
      }),
    ),
  }),
  async run(c: any) {
    const address = c.var.address
    const openPositions = await listUserPerpPositions(c.var.info, address)

    return c.ok({ positions: openPositions })
  },
}
