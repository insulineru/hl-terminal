import { describe, expect, test } from 'bun:test'
import {
  buildTriggerOrder,
  CROSSED_TRIGGER_WARNING,
  executeTriggerOrder,
  type TriggerWireOrder,
} from './trigger.js'

const MARK = 90_000

function infoMock(mark = '90000') {
  return {
    async meta() {
      return { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 50 }] }
    },
    async perpDexs() {
      return []
    },
    async metaAndAssetCtxs() {
      return [{ universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 50 }] }, [{ markPx: mark }]]
    },
  }
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    assetId: 0,
    szDecimals: 5,
    side: 'sell' as const,
    size: '0.5',
    triggerPx: '56666',
    reduceOnly: false,
    slippagePct: 3,
    markPx: MARK,
    force: false,
    ...overrides,
  }
}

describe('buildTriggerOrder', () => {
  test('builds a non-reduce-only sell stop-market from the trigger and slippage', () => {
    const built = buildTriggerOrder(baseInput())

    expect(built.ok).toBe(true)
    if (!built.ok) return

    const order: TriggerWireOrder = {
      a: 0,
      b: false,
      p: '54966',
      s: '0.5',
      r: false,
      t: { trigger: { isMarket: true, triggerPx: '56666', tpsl: 'sl' } },
    }

    expect(built.preview.order).toEqual(order)
    expect(built.preview.grouping).toBe('na')
    expect(built.preview.type).toBe('stop-market')
    expect(built.preview.size).toBe('0.5')
    expect(built.preview.warning).toBeUndefined()
  })

  test('applies slippage above the trigger for a buy stop-market', () => {
    const built = buildTriggerOrder(
      baseInput({ side: 'buy', triggerPx: '100000', size: '0.1', slippagePct: 3 }),
    )

    expect(built.ok).toBe(true)
    if (!built.ok) return

    expect(built.preview.order).toEqual({
      a: 0,
      b: true,
      p: '103000',
      s: '0.1',
      r: false,
      t: { trigger: { isMarket: true, triggerPx: '100000', tpsl: 'sl' } },
    })
  })

  test('builds a stop-limit at the given limit and ignores slippage', () => {
    const built = buildTriggerOrder(
      baseInput({
        side: 'buy',
        triggerPx: '100000',
        limitPx: '100500',
        size: '0.1',
        slippagePct: 10,
      }),
    )

    expect(built.ok).toBe(true)
    if (!built.ok) return

    expect(built.preview.type).toBe('stop-limit')
    expect(built.preview.isMarket).toBe(false)
    expect(built.preview.slippage).toBeUndefined()
    expect(built.preview.order.p).toBe('100500')
    expect(built.preview.order.t.trigger).toEqual({
      isMarket: false,
      triggerPx: '100000',
      tpsl: 'sl',
    })
  })

  test('keeps the caller size when reduce-only is requested', () => {
    const built = buildTriggerOrder(baseInput({ reduceOnly: true, size: '1.25' }))

    expect(built.ok).toBe(true)
    if (!built.ok) return

    expect(built.preview.order.s).toBe('1.25')
    expect(built.preview.order.r).toBe(true)
  })

  test('refuses a sell stop at or above the mark unless force is set', () => {
    const refused = buildTriggerOrder(baseInput({ triggerPx: '95000' }))
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.code).toBe('TRIGGER_DIRECTION')
    expect(refused.message).toContain('--force')
    expect(refused.message).toContain(CROSSED_TRIGGER_WARNING)

    const atMark = buildTriggerOrder(baseInput({ triggerPx: '90000' }))
    expect(atMark.ok).toBe(false)

    const forced = buildTriggerOrder(baseInput({ triggerPx: '95000', force: true }))
    expect(forced.ok).toBe(true)
    if (!forced.ok) return
    expect(forced.preview.warning).toContain('--force')
    expect(forced.preview.warning).toContain(CROSSED_TRIGGER_WARNING)
    expect(forced.preview.order.t.trigger.triggerPx).toBe('95000')
    expect(forced.preview.order.t.trigger.tpsl).toBe('sl')
  })

  test('refuses a buy stop at or below the mark unless force is set', () => {
    const refused = buildTriggerOrder(baseInput({ side: 'buy', triggerPx: '80000' }))
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.code).toBe('TRIGGER_DIRECTION')

    const forced = buildTriggerOrder(baseInput({ side: 'buy', triggerPx: '80000', force: true }))
    expect(forced.ok).toBe(true)
    if (!forced.ok) return
    expect(forced.preview.order.b).toBe(true)
    expect(forced.preview.warning).toBeDefined()
  })
})

describe('executeTriggerOrder dry-run', () => {
  test('previews the acceptance sell stop without calling the exchange', async () => {
    let called = false
    const exchange = {
      async order() {
        called = true
        return {}
      },
    }

    const result = await executeTriggerOrder(
      { info: infoMock(), exchange },
      { coin: 'btc', side: 'sell', size: '0.5' },
      { trigger: '56666', reduceOnly: false, slippage: 3, dryRun: true, force: false },
    )

    expect(called).toBe(false)
    expect(result).toEqual({
      ok: true,
      data: {
        dryRun: true,
        type: 'stop-market',
        coin: 'BTC',
        side: 'sell',
        size: '0.5',
        triggerPx: '56666',
        limitPx: '54966',
        isMarket: true,
        reduceOnly: false,
        tpsl: 'sl',
        slippage: 3,
        markPx: '90000',
        status: 'DRY_RUN',
        oid: null,
      },
    })
  })

  test('dry-run stop-limit reports the limit and does not submit', async () => {
    const exchange = {
      async order() {
        throw new Error('exchange should not be called')
      },
    }

    const result = await executeTriggerOrder(
      { info: infoMock(), exchange },
      { coin: 'BTC', side: 'buy', size: '0.1' },
      {
        trigger: '100000',
        limit: '100500',
        reduceOnly: false,
        slippage: 3,
        dryRun: true,
        force: false,
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({
      dryRun: true,
      type: 'stop-limit',
      coin: 'BTC',
      side: 'buy',
      size: '0.1',
      triggerPx: '100000',
      limitPx: '100500',
      isMarket: false,
      reduceOnly: false,
      tpsl: 'sl',
      status: 'DRY_RUN',
      oid: null,
    })
    expect(result.data.slippage).toBeUndefined()
  })

  test('dry-run with --force previews a wrong-side stop and includes a warning', async () => {
    const result = await executeTriggerOrder(
      { info: infoMock() },
      { coin: 'BTC', side: 'buy', size: '0.2' },
      { trigger: '80000', reduceOnly: false, slippage: 3, dryRun: true, force: true },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.oid).toBeNull()
    expect(result.data.status).toBe('DRY_RUN')
    expect(result.data.triggerPx).toBe('80000')
    expect(result.data.tpsl).toBe('sl')
    expect(result.data.warning).toContain('--force')
    expect(result.data.warning).toContain(CROSSED_TRIGGER_WARNING)
    expect(result.data.limitPx).toBe('82400')
  })

  test('refuses the wrong side on dry-run and does not submit', async () => {
    let called = false
    const result = await executeTriggerOrder(
      {
        info: infoMock(),
        exchange: {
          async order() {
            called = true
            return {}
          },
        },
      },
      { coin: 'BTC', side: 'sell', size: '0.5' },
      { trigger: '120000', reduceOnly: false, slippage: 3, dryRun: true, force: false },
    )

    expect(called).toBe(false)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('TRIGGER_DIRECTION')
  })
})

describe('executeTriggerOrder request submission', () => {
  test('submits the wire order and returns the resting oid', async () => {
    const requests: unknown[] = []
    const result = await executeTriggerOrder(
      {
        info: infoMock('95000'),
        exchange: {
          async order(req) {
            requests.push(req)
            return { response: { data: { statuses: [{ resting: { oid: 4242 } }] } } }
          },
        },
      },
      { coin: 'BTC', side: 'sell', size: '0.5' },
      { trigger: '56666', reduceOnly: false, slippage: 10, dryRun: false, force: false },
    )

    expect(requests).toEqual([
      {
        grouping: 'na',
        orders: [
          {
            a: 0,
            b: false,
            p: '50999',
            s: '0.5',
            r: false,
            t: { trigger: { isMarket: true, triggerPx: '56666', tpsl: 'sl' } },
          },
        ],
      },
    ])
    expect(result).toEqual({
      ok: true,
      data: {
        dryRun: false,
        type: 'stop-market',
        coin: 'BTC',
        side: 'sell',
        size: '0.5',
        triggerPx: '56666',
        limitPx: '50999',
        isMarket: true,
        reduceOnly: false,
        tpsl: 'sl',
        slippage: 10,
        markPx: '95000',
        status: 'resting',
        oid: 4242,
      },
    })
  })

  test('does not look up a position; size stays absolute', async () => {
    const info = infoMock()
    const result = await executeTriggerOrder(
      {
        info,
        exchange: {
          async order() {
            return { response: { data: { statuses: [{ resting: { oid: 7 } }] } } }
          },
        },
      },
      { coin: 'BTC', side: 'sell', size: '0.5' },
      { trigger: '56666', reduceOnly: false, slippage: 3, dryRun: false, force: false },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.size).toBe('0.5')
    expect('clearinghouseState' in info).toBe(false)
  })

  test('returns the fill price and size when the trigger fills immediately', async () => {
    const result = await executeTriggerOrder(
      {
        info: infoMock('95000'),
        exchange: {
          async order() {
            return {
              response: {
                data: { statuses: [{ filled: { oid: 8, avgPx: '56600', totalSz: '0.5' } }] },
              },
            }
          },
        },
      },
      { coin: 'BTC', side: 'sell', size: '0.5' },
      { trigger: '56666', reduceOnly: false, slippage: 3, dryRun: false, force: false },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.status).toBe('filled')
    expect(result.data.oid).toBe(8)
    expect(result.data.avgPx).toBe('56600')
    expect(result.data.totalSz).toBe('0.5')
  })

  test('reports waitingForTrigger without an oid', async () => {
    const result = await executeTriggerOrder(
      {
        info: infoMock('95000'),
        exchange: {
          async order() {
            return { response: { data: { statuses: ['waitingForTrigger'] } } }
          },
        },
      },
      { coin: 'BTC', side: 'sell', size: '0.5' },
      { trigger: '56666', reduceOnly: false, slippage: 3, dryRun: false, force: false },
    )

    expect(result).toMatchObject({
      ok: true,
      data: { status: 'waitingForTrigger', oid: null, dryRun: false },
    })
  })

  test('returns ORDER_REJECTED when the exchange rejects the trigger', async () => {
    const result = await executeTriggerOrder(
      {
        info: infoMock('95000'),
        exchange: {
          async order() {
            return { response: { data: { statuses: [{ error: 'Insufficient margin' }] } } }
          },
        },
      },
      { coin: 'BTC', side: 'sell', size: '0.5' },
      { trigger: '56666', reduceOnly: false, slippage: 3, dryRun: false, force: false },
    )

    expect(result).toEqual({ ok: false, code: 'ORDER_REJECTED', message: 'Insufficient margin' })
  })

  test('returns ORDER_FAILED when the status list is empty or the request throws', async () => {
    const empty = await executeTriggerOrder(
      {
        info: infoMock('95000'),
        exchange: {
          async order() {
            return { response: { data: { statuses: [] } } }
          },
        },
      },
      { coin: 'BTC', side: 'sell', size: '0.5' },
      { trigger: '56666', reduceOnly: false, slippage: 3, dryRun: false, force: false },
    )
    expect(empty).toEqual({
      ok: false,
      code: 'ORDER_FAILED',
      message: 'Exchange returned no order status',
    })

    const thrown = await executeTriggerOrder(
      {
        info: infoMock('95000'),
        exchange: {
          async order() {
            throw new Error('network down')
          },
        },
      },
      { coin: 'BTC', side: 'sell', size: '0.5' },
      { trigger: '56666', reduceOnly: false, slippage: 3, dryRun: false, force: false },
    )
    expect(thrown).toEqual({ ok: false, code: 'ORDER_FAILED', message: 'network down' })
  })

  test('resolves a builder-dex market and rounds the trigger to the tick', async () => {
    const requests: unknown[] = []
    const info = {
      async meta(params?: { dex?: string }) {
        if (params?.dex === 'xyz') {
          return { universe: [{ name: 'xyz:BRENTOIL', szDecimals: 2, maxLeverage: 5 }] }
        }
        return { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 50 }] }
      },
      async perpDexs() {
        return [null, { name: 'xyz' }]
      },
      async metaAndAssetCtxs(params?: { dex?: string }) {
        if (params?.dex === 'xyz') {
          return [
            { universe: [{ name: 'xyz:BRENTOIL', szDecimals: 2, maxLeverage: 5 }] },
            [{ markPx: '70.5' }],
          ]
        }
        return [{ universe: [{ name: 'BTC' }] }, [{ markPx: '90000' }]]
      },
    }

    const result = await executeTriggerOrder(
      {
        info,
        exchange: {
          async order(req) {
            requests.push(req)
            return { response: { data: { statuses: [{ resting: { oid: 15 } }] } } }
          },
        },
      },
      { coin: 'xyz:brentoil', side: 'sell', size: '1.239' },
      {
        trigger: '60.5559',
        reduceOnly: false,
        slippage: 10,
        dryRun: false,
        force: false,
        tpsl: 'sl',
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.coin).toBe('xyz:BRENTOIL')
    expect(result.data.size).toBe('1.23')
    expect(result.data.triggerPx).toBe('60.555')
    expect(requests).toEqual([
      {
        grouping: 'na',
        orders: [
          {
            a: 110000,
            b: false,
            p: '54.499',
            s: '1.23',
            r: false,
            t: { trigger: { isMarket: true, triggerPx: '60.555', tpsl: 'sl' } },
          },
        ],
      },
    ])
  })
})

describe('buildTriggerOrder validation', () => {
  test('rejects non-positive size, trigger, and limit, including values the formatter keeps', () => {
    for (const size of ['0', '-1', '-0.5']) {
      const built = buildTriggerOrder(baseInput({ size }))
      expect(built.ok).toBe(false)
      if (built.ok) return
      expect(built.code).toBe('INVALID_SIZE')
    }

    for (const triggerPx of ['0', '-1']) {
      const built = buildTriggerOrder(baseInput({ triggerPx }))
      expect(built.ok).toBe(false)
      if (built.ok) return
      expect(built.code).toBe('INVALID_PRICE')
    }

    for (const limitPx of ['0', '-5']) {
      const built = buildTriggerOrder(baseInput({ side: 'buy', triggerPx: '100000', limitPx }))
      expect(built.ok).toBe(false)
      if (built.ok) return
      expect(built.code).toBe('INVALID_PRICE')
    }
  })

  test('rejects a missing, zero, or NaN mark', () => {
    for (const markPx of [Number.NaN, 0, -1]) {
      const built = buildTriggerOrder(baseInput({ markPx }))
      expect(built.ok).toBe(false)
      if (built.ok) return
      expect(built.code).toBe('PRICE_NOT_FOUND')
    }
  })

  test('rejects slippage outside [0, 100) and a stop-market limit that is not positive', () => {
    for (const slippagePct of [-1, 100, 150, Number.NaN]) {
      const built = buildTriggerOrder(baseInput({ slippagePct }))
      expect(built.ok).toBe(false)
      if (built.ok) return
      expect(built.code).toBe('INVALID_SLIPPAGE')
    }

    const collapsed = buildTriggerOrder(
      baseInput({ side: 'sell', triggerPx: '1', slippagePct: 99.9, szDecimals: 5 }),
    )
    expect(collapsed.ok).toBe(false)
    if (collapsed.ok) return
    expect(collapsed.code).toBe('INVALID_SLIPPAGE')
  })

  test('rounds the trigger and size to the market increment', () => {
    const built = buildTriggerOrder(baseInput({ triggerPx: '56666.129', size: '1.23456789' }))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.preview.triggerPx).toBe('56666')
    expect(built.preview.size).toBe('1.23456')
    expect(built.preview.order.t.trigger.triggerPx).toBe('56666')
  })

  test('validates direction for each side and tpsl pair', () => {
    const cases = [
      { side: 'buy' as const, tpsl: 'sl' as const, triggerPx: '100000', ok: true },
      { side: 'buy' as const, tpsl: 'sl' as const, triggerPx: '80000', ok: false },
      { side: 'sell' as const, tpsl: 'sl' as const, triggerPx: '80000', ok: true },
      { side: 'sell' as const, tpsl: 'sl' as const, triggerPx: '100000', ok: false },
      { side: 'buy' as const, tpsl: 'tp' as const, triggerPx: '80000', ok: true },
      { side: 'buy' as const, tpsl: 'tp' as const, triggerPx: '100000', ok: false },
      { side: 'sell' as const, tpsl: 'tp' as const, triggerPx: '100000', ok: true },
      { side: 'sell' as const, tpsl: 'tp' as const, triggerPx: '80000', ok: false },
    ]

    for (const entry of cases) {
      const built = buildTriggerOrder(baseInput(entry))
      expect(built.ok).toBe(entry.ok)
      if (!built.ok) {
        expect(built.code).toBe('TRIGGER_DIRECTION')
        expect(built.message).toContain(CROSSED_TRIGGER_WARNING)
      } else {
        expect(built.preview.order.t.trigger.tpsl).toBe(entry.tpsl)
      }
    }
  })
})

describe('executeTriggerOrder mark price', () => {
  test('returns PRICE_NOT_FOUND when the mark is missing or not positive', async () => {
    for (const mark of ['0', '-5', 'NaN']) {
      const result = await executeTriggerOrder(
        { info: infoMock(mark) },
        { coin: 'BTC', side: 'sell', size: '0.5' },
        { trigger: '56666', reduceOnly: false, slippage: 3, dryRun: true, force: false },
      )
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.code).toBe('PRICE_NOT_FOUND')
    }
  })
})
