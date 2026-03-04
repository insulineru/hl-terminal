import { z } from 'incur'

export const positions = {
  description: 'View open positions with entry price, size, PnL, leverage, liq price',
  examples: [{ description: 'View all open perp positions' }],
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
    const state = await c.var.info.clearinghouseState({ user: address })

    // Filter to non-zero positions
    const openPositions = (state.assetPositions ?? [])
      .filter((ap: any) => {
        const szi = parseFloat(ap.position?.szi ?? '0')
        return szi !== 0
      })
      .map((ap: any) => {
        const pos = ap.position
        const szi = parseFloat(pos.szi ?? '0')
        return {
          coin: pos.coin ?? '',
          size: pos.szi ?? '0',
          entryPx: pos.entryPx ?? '0',
          unrealizedPnl: pos.unrealizedPnl ?? '0',
          leverage: pos.leverage?.value ?? '0',
          liquidationPx: pos.liquidationPx ?? '0',
          side: szi >= 0 ? 'Long' : 'Short',
        }
      })

    return c.ok({ positions: openPositions })
  },
}
