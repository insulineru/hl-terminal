import { describe, expect, test } from 'bun:test'
import {
  buildPerpMarketRegistry,
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

describe('listUserPerpOpenOrders', () => {
  test('aggregates orders across dexs and falls back to openOrders when frontend endpoint fails', async () => {
    const orders = await listUserPerpOpenOrders(createInfoMock() as any, '0x123')

    expect(orders).toEqual([
      {
        coin: 'BTC',
        oid: 1,
        orderType: 'Limit',
        price: '95000',
        side: 'Buy',
        size: '0.01',
      },
      {
        coin: 'xyz:BRENTOIL',
        oid: 2,
        orderType: 'Limit',
        price: '71',
        side: 'Sell',
        size: '3',
      },
    ])
  })
})
