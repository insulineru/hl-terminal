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
        cloid: undefined,
        isPositionTpsl: false,
        isTrigger: false,
        oid: 1,
        orderType: 'Limit',
        origSize: '0.01',
        price: '95000',
        reduceOnly: false,
        side: 'Buy',
        size: '0.01',
        sizeMode: 'explicit',
        tif: undefined,
        triggerCondition: undefined,
        triggerPx: undefined,
      },
      {
        coin: 'xyz:BRENTOIL',
        cloid: undefined,
        isPositionTpsl: false,
        isTrigger: false,
        oid: 2,
        orderType: 'Limit',
        origSize: '3',
        price: '71',
        reduceOnly: false,
        side: 'Sell',
        size: '3',
        sizeMode: 'explicit',
        tif: undefined,
        triggerCondition: undefined,
        triggerPx: undefined,
      },
    ])
  })

  test('marks zero-size position TP/SL trigger orders as dynamic position-size orders', async () => {
    const orders = await listUserPerpOpenOrders(
      createInfoMock({
        async frontendOpenOrders(params: { user: string; dex?: string }) {
          if (params.dex) return []

          return [
            {
              oid: 3,
              coin: 'BTC',
              side: 'A',
              sz: '0.0',
              origSz: '0.0',
              limitPx: '0',
              orderType: 'Stop Market',
              isTrigger: true,
              isPositionTpsl: true,
              reduceOnly: true,
              triggerPx: '90000',
              triggerCondition: 'Triggered below 90000',
              tif: 'FrontendMarket',
              cloid: '0xabc',
            },
          ]
        },
      }) as any,
      '0x123',
    )

    expect(orders).toEqual([
      {
        coin: 'BTC',
        cloid: '0xabc',
        currentPositionSize: '0.01',
        currentPositionSizeSource: 'derivedFromPosition',
        isPositionTpsl: true,
        isTrigger: true,
        oid: 3,
        orderType: 'Stop Market',
        origSize: '0.0',
        price: '0',
        reduceOnly: true,
        side: 'Sell',
        size: '0.0',
        sizeMode: 'position',
        tif: 'FrontendMarket',
        triggerCondition: 'Triggered below 90000',
        triggerPx: '90000',
      },
    ])
  })

  test('reports absolute current position size for short position TP/SL orders', async () => {
    const orders = await listUserPerpOpenOrders(
      createInfoMock({
        async clearinghouseState(params: { user: string; dex?: string }) {
          if (params.dex) return { assetPositions: [] }

          return {
            assetPositions: [
              {
                position: {
                  coin: 'BTC',
                  szi: '-0.01',
                  entryPx: '94000',
                  unrealizedPnl: '10',
                  leverage: { value: 3 },
                  liquidationPx: null,
                },
              },
            ],
          }
        },
        async frontendOpenOrders(params: { user: string; dex?: string }) {
          if (params.dex) return []

          return [
            {
              oid: 4,
              coin: 'BTC',
              side: 'B',
              sz: '0.0',
              origSz: '0.0',
              limitPx: '0',
              orderType: 'Stop Market',
              isTrigger: true,
              isPositionTpsl: true,
              reduceOnly: true,
              triggerPx: '100000',
              triggerCondition: 'Triggered above 100000',
            },
          ]
        },
      }) as any,
      '0x123',
    )

    expect(orders[0]).toMatchObject({
      currentPositionSize: '0.01',
      currentPositionSizeSource: 'derivedFromPosition',
      side: 'Buy',
      size: '0.0',
      sizeMode: 'position',
    })
  })

  test('keeps explicit size mode for non-zero position TP/SL orders', async () => {
    const orders = await listUserPerpOpenOrders(
      createInfoMock({
        async frontendOpenOrders(params: { user: string; dex?: string }) {
          if (params.dex) return []

          return [
            {
              oid: 5,
              coin: 'BTC',
              side: 'A',
              sz: '0.005',
              origSz: '0.005',
              limitPx: '0',
              orderType: 'Stop Market',
              isTrigger: true,
              isPositionTpsl: true,
              reduceOnly: true,
              triggerPx: '90000',
            },
          ]
        },
      }) as any,
      '0x123',
    )

    expect(orders[0]).toMatchObject({
      isPositionTpsl: true,
      size: '0.005',
      sizeMode: 'explicit',
    })
    expect(orders[0]?.currentPositionSize).toBeUndefined()
  })

  test('omits current position size when a position TP/SL order has no matching open position', async () => {
    const orders = await listUserPerpOpenOrders(
      createInfoMock({
        async clearinghouseState() {
          return { assetPositions: [] }
        },
        async frontendOpenOrders(params: { user: string; dex?: string }) {
          if (params.dex) return []

          return [
            {
              oid: 6,
              coin: 'BTC',
              side: 'A',
              sz: '0.0',
              origSz: '0.0',
              limitPx: '0',
              orderType: 'Stop Market',
              isTrigger: true,
              isPositionTpsl: true,
              reduceOnly: true,
              triggerPx: '90000',
            },
          ]
        },
      }) as any,
      '0x123',
    )

    expect(orders[0]).toMatchObject({
      size: '0.0',
      sizeMode: 'position',
    })
    expect(orders[0]?.currentPositionSize).toBeUndefined()
    expect(orders[0]?.currentPositionSizeSource).toBeUndefined()
  })
})
