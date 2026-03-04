import { z } from 'incur'

export const balance = {
  description: 'View account balance (perps margin + spot wallet)',
  examples: [{ description: 'View perps margin and spot wallet balances' }],
  hint: 'Shows perps margin summary and non-zero spot token balances.',
  output: z.object({
    perps: z.object({
      accountValue: z.string(),
      totalNtlPos: z.string(),
      totalRawUsd: z.string(),
    }),
    spot: z.array(
      z.object({
        coin: z.string(),
        total: z.string(),
        hold: z.string(),
      }),
    ),
  }),
  async run(c: any) {
    const address = c.var.address

    // Fetch perps and spot in parallel
    const [perpState, spotState] = await Promise.all([
      c.var.info.clearinghouseState({ user: address }),
      c.var.info.spotClearinghouseState({ user: address }),
    ])

    const perps = {
      accountValue: perpState.marginSummary?.accountValue ?? '0',
      totalNtlPos: perpState.marginSummary?.totalNtlPos ?? '0',
      totalRawUsd: perpState.marginSummary?.totalRawUsd ?? '0',
    }

    // Filter out zero-balance spot tokens
    const spot = (spotState.balances ?? [])
      .filter((b: any) => parseFloat(b.total ?? '0') > 0)
      .map((b: any) => ({
        coin: b.coin,
        total: b.total ?? '0',
        hold: b.hold ?? '0',
      }))

    return c.ok({ perps, spot })
  },
}
