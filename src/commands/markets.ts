import { z } from 'incur'

export const markets = {
  description: 'List available markets with metadata (perps + spot)',
  examples: [{ description: 'List all available perp markets' }],
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
    const meta = await c.var.info.meta()

    const marketList = (meta.universe ?? [])
      .map((m: any) => ({
        name: m.name ?? '',
        szDecimals: m.szDecimals ?? 0,
        maxLeverage: m.maxLeverage ?? 0,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name))

    return c.ok({ markets: marketList })
  },
}
