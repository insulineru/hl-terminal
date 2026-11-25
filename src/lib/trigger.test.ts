import { describe, expect, test } from 'bun:test'
import { buildTriggerOrder, executeTriggerOrder, type TriggerWireOrder } from './trigger.js'

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

    const atMark = buildTriggerOrder(baseInput({ triggerPx: '90000' }))
    expect(atMark.ok).toBe(false)

    const forced = buildTriggerOrder(baseInput({ triggerPx: '95000', force: true }))
    expect(forced.ok).toBe(true)
    if (!forced.ok) return
    expect(forced.preview.warning).toContain('--force')
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
})
