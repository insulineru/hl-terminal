import { describe, expect, test } from 'bun:test'
import {
  buildPerpMarketRegistry,
  getPerpMarkPrice,
  getPerpMidPrice,
  listUserPerpOpenOrders,
  listUserPerpPositions,
} from './perps.js'

function createInfoMock(overrides: Partial<Record<string, any>> = {}) {
  return {
    async meta(params?: { dex?: string }) {
      if (params?.dex === 'xyz') {
        return {
          universe: [{ name: 'xyz:BRENTOIL', szDecimals: 2, maxLeverage: 5 }],
        }
      }

      return {
        universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 50 }],
      }
    },
    async perpDexs() {
      return [null, { name: 'xyz' }]
    },
    async allMids(params?: { dex?: string }) {
      if (params?.dex === 'xyz') {
        return { 'xyz:BRENTOIL': '70.12' }
      }

      return { BTC: '95000' }
    },
    async clearinghouseState(params: { user: string; dex?: string }) {
      if (params.dex === 'xyz') {
        return {
          assetPositions: [
            {
              position: {
                coin: 'xyz:BRENTOIL',
                szi: '3',
                entryPx: '69',
                unrealizedPnl: '3.36',
                leverage: { value: 5 },
                liquidationPx: '50',
              },
            },
          ],
        }
      }

      return {
        assetPositions: [
          {
            position: {
              coin: 'BTC',
              szi: '0.01',
              entryPx: '94000',
              unrealizedPnl: '10',
              leverage: { value: 3 },
              liquidationPx: null,
            },
          },
          {
            position: {
              coin: 'ETH',
              szi: '0',
              entryPx: '0',
              unrealizedPnl: '0',
              leverage: { value: 1 },
              liquidationPx: null,
            },
          },
        ],
      }
    },
    async frontendOpenOrders(params: { user: string; dex?: string }) {
      if (params.dex === 'xyz') {
        throw new Error('frontend unavailable')
      }

      return [{ oid: 1, coin: 'BTC', side: 'B', sz: '0.01', limitPx: '95000', orderType: 'Limit' }]
    },
    async metaAndAssetCtxs(params?: { dex?: string }) {
      if (params?.dex === 'xyz') {
        return [
          { universe: [{ name: 'xyz:BRENTOIL', szDecimals: 2, maxLeverage: 5 }] },
          [{ markPx: '70.5' }],
        ]
      }

      return [
        { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 50 }] },
        [{ markPx: '95100' }],
      ]
    },
    async openOrders(params: { user: string; dex?: string }) {
      if (params.dex === 'xyz') {
        return [
          {
            oid: 2,
            coin: 'xyz:BRENTOIL',
            side: 'A',
            sz: '3',
            limitPx: '71',
            orderType: 'Limit',
          },
        ]
      }

      return []
    },
    ...overrides,
  }
}

describe('buildPerpMarketRegistry', () => {
  test('includes builder dex markets with encoded asset ids', async () => {
    const registry = await buildPerpMarketRegistry(createInfoMock() as any)

    expect(registry.get('BTC')).toEqual({
      assetId: 0,
      dex: undefined,
      maxLeverage: 50,
      name: 'BTC',
      szDecimals: 5,
    })

    expect(registry.get('xyz:BRENTOIL')).toEqual({
      assetId: 110000,
      dex: 'xyz',
      maxLeverage: 5,
      name: 'xyz:BRENTOIL',
      szDecimals: 2,
    })
  })
})

describe('getPerpMidPrice', () => {
  test('uses dex-qualified mids for builder dex coins', async () => {
    const mid = await getPerpMidPrice(createInfoMock() as any, 'xyz:BRENTOIL')

    expect(mid).toBe('70.12')
  })
})

describe('listUserPerpPositions', () => {
  test('aggregates non-zero positions from main dex and builder dexs', async () => {
    const positions = await listUserPerpPositions(createInfoMock() as any, '0x123')

    expect(positions).toEqual([
      {
        coin: 'BTC',
        entryPx: '94000',
        leverage: '3',
        liquidationPx: '0',
        side: 'Long',
        size: '0.01',
        unrealizedPnl: '10',
      },
      {
        coin: 'xyz:BRENTOIL',
        entryPx: '69',
        leverage: '5',
        liquidationPx: '50',
        side: 'Long',
        size: '3',
        unrealizedPnl: '3.36',
      },
    ])
  })
})

describe('getPerpMarkPrice', () => {
  test('reads the mark price for main and builder-dex markets', async () => {
    const info = createInfoMock() as any

    expect(await getPerpMarkPrice(info, 'btc')).toBe('95100')
    expect(await getPerpMarkPrice(info, 'xyz:BRENTOIL')).toBe('70.5')
  })
})

describe('listUserPerpOpenOrders', () => {
  test('aggregates orders across dexs and falls back to openOrders when frontend endpoint fails', async () => {
    const orders = await listUserPerpOpenOrders(createInfoMock() as any, '0x123')

    expect(orders).toEqual([
      {
        coin: 'BTC',
        isMarket: false,
        oid: 1,
        orderType: 'Limit',
        price: '95000',
        reduceOnly: false,
        side: 'Buy',
        size: '0.01',
        tpsl: null,
        triggerPx: null,
      },
      {
        coin: 'xyz:BRENTOIL',
        isMarket: false,
        oid: 2,
        orderType: 'Limit',
        price: '71',
        reduceOnly: false,
        side: 'Sell',
        size: '3',
        tpsl: null,
        triggerPx: null,
      },
    ])
  })

  test('shows triggerPx instead of treating the slippage limit as the stop, and labels position TP/SL size', async () => {
    const info = createInfoMock({
      async frontendOpenOrders(params: { dex?: string }) {
        if (params.dex) return []
        return [
          {
            oid: 9,
            coin: 'BTC',
            side: 'A',
            sz: '0.5',
            limitPx: '50999',
            orderType: 'Stop Market',
            isTrigger: true,
            triggerPx: '56666',
            isPositionTpsl: false,
            reduceOnly: false,
          },
          {
            oid: 10,
            coin: 'BTC',
            side: 'A',
            sz: '0.0',
            limitPx: '110000',
            orderType: 'Take Profit Market',
            isTrigger: true,
            triggerPx: '100000',
            isPositionTpsl: true,
            reduceOnly: true,
          },
          {
            oid: 11,
            coin: 'ETH',
            side: 'B',
            sz: '1',
            limitPx: '3100',
            orderType: 'Stop Limit',
            isTrigger: true,
            triggerPx: '3000',
            isPositionTpsl: false,
            reduceOnly: true,
          },
        ]
      },
    })

    const orders = await listUserPerpOpenOrders(info as any, '0x123')

    expect(orders).toEqual([
      {
        coin: 'BTC',
        isMarket: true,
        oid: 9,
        orderType: 'Stop Market',
        price: '50999',
        reduceOnly: false,
        side: 'Sell',
        size: '0.5',
        tpsl: 'sl',
        triggerPx: '56666',
      },
      {
        coin: 'BTC',
        isMarket: true,
        oid: 10,
        orderType: 'Take Profit Market',
        price: '110000',
        reduceOnly: true,
        side: 'Sell',
        size: 'full position',
        tpsl: 'tp',
        triggerPx: '100000',
      },
      {
        coin: 'ETH',
        isMarket: false,
        oid: 11,
        orderType: 'Stop Limit',
        price: '3100',
        reduceOnly: true,
        side: 'Buy',
        size: '1',
        tpsl: 'sl',
        triggerPx: '3000',
      },
    ])
  })
})
