import { z } from 'incur'
import { normalizePerpCoin } from '../lib/perps.js'

const CANDLE_INTERVALS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M',
] as const

type CandleInterval = (typeof CANDLE_INTERVALS)[number]

const INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
}

function getCandleApiCoin(coin: string): string {
  const delimiterIndex = coin.indexOf(':')
  if (delimiterIndex === -1) return coin
  return coin.slice(delimiterIndex + 1)
}

export const candles = {
  description: 'View OHLCV candle history for a perpetual market',
  args: z.object({
    coin: z.string().describe('Coin symbol (e.g. BTC, ETH, xyz:BRENTOIL)'),
  }),
  options: z.object({
    interval: z.enum(CANDLE_INTERVALS).optional().describe('Candle interval (default 1h)'),
    limit: z.number().optional().describe('Number of candles to fetch (default 24)'),
  }),
  examples: [
    { args: { coin: 'BTC' }, description: 'Last 24 hourly candles for BTC' },
    {
      args: { coin: 'ETH' },
      options: { interval: '15m' as const, limit: 12 },
      description: 'Last 12 ETH 15-minute candles',
    },
    {
      args: { coin: 'xyz:BRENTOIL' },
      description: 'Last 24 hourly candles for a DEX market',
    },
  ],
  alias: { interval: 'i', limit: 'l' },
  output: z.object({
    coin: z.string(),
    interval: z.string(),
    candles: z.array(
      z.object({
        time: z.string(),
        open: z.string(),
        high: z.string(),
        low: z.string(),
        close: z.string(),
        volume: z.string(),
        trades: z.number(),
      }),
    ),
    total: z.number(),
  }),
  async run(c: any) {
    const coin = normalizePerpCoin(c.args.coin)
    const interval: CandleInterval = c.options.interval ?? '1h'
    const limit = c.options.limit ?? 24
    const intervalMs = INTERVAL_MS[interval]
    const now = Date.now()
    const startTime = now - limit * intervalMs

    const rawCandles = await c.var.info.candleSnapshot({
      coin: getCandleApiCoin(coin),
      interval,
      startTime,
      endTime: now,
    })

    const candles = (rawCandles ?? []).map((candle: any) => ({
      time: new Date(candle.t).toISOString().replace('T', ' ').slice(0, 19),
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c,
      volume: candle.v,
      trades: candle.n,
    }))

    return c.ok({ coin, interval, candles, total: candles.length })
  },
}
