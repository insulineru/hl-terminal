import { describe, expect, test } from 'bun:test'
import { Cli } from 'incur'
import { order } from '../commands/order.js'
import { orders } from '../commands/orders.js'
import { position } from '../commands/position.js'
import { positions } from '../commands/positions.js'
import { commandError } from './errors.js'
import { buildPerpMarketRegistry, listUserPerpOpenOrders, listUserPerpPositions } from './perps.js'

function rateLimit(message = '429') {
  return Object.assign(new Error(message), {
    response: { status: 429, statusText: '', headers: { get: () => null } },
  })
}

function infoThat429s(extra: Record<string, unknown> = {}) {
  return {
    async meta() {
      throw rateLimit('429')
    },
    async perpDexs() {
      return [null, { name: 'xyz' }]
    },
    async clearinghouseState() {
      throw rateLimit('429 - null')
    },
    async allMids() {
      throw rateLimit('429')
    },
    async frontendOpenOrders() {
      throw rateLimit('429')
    },
    async openOrders() {
      throw new Error('openOrders should not run after a 429')
    },
    ...extra,
  }
}

function commandRun(cli: object, name: string) {
  const map = Cli.toCommands.get(cli as never) as
    | Map<string, { run?: (c: any) => Promise<any> }>
    | undefined
  const command = map?.get(name)
  if (!command?.run) throw new Error(`missing ${name}`)
  return command.run
}

describe('rate limits are not swallowed', () => {
  test('a builder-dex 429 fails the market registry instead of skipping that dex', async () => {
    const info = {
      async meta(params?: { dex?: string }) {
        if (params?.dex) throw rateLimit('429')
        return { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 50 }] }
      },
      async perpDexs() {
        return [{ name: 'xyz' }]
      },
    }
    await expect(buildPerpMarketRegistry(info as any)).rejects.toThrow()

    const tolerated = {
      async meta(params?: { dex?: string }) {
        if (params?.dex) throw new Error('dex offline')
        return { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 50 }] }
      },
      async perpDexs() {
        return [{ name: 'xyz' }]
      },
    }
    const registry = await buildPerpMarketRegistry(tolerated as any)
    expect(registry.has('BTC')).toBe(true)
  })

  test('positions throws a 429 instead of returning an empty list', async () => {
    await expect(listUserPerpPositions(infoThat429s() as any, '0xabc')).rejects.toThrow()
    try {
      await positions.run({
        var: { info: infoThat429s(), address: '0xabc' },
        ok(data: unknown) {
          return data
        },
        error(err: unknown) {
          return err
        },
      })
      throw new Error('expected positions to throw')
    } catch (err) {
      expect(commandError(err, 'UNKNOWN')).toMatchObject({
        code: 'RATE_LIMITED',
        retryable: true,
      })
    }
  })

  test('orders throws a 429 and does not fall back to openOrders', async () => {
    let openOrdersCalled = false
    const info = infoThat429s({
      async openOrders() {
        openOrdersCalled = true
        return []
      },
    })
    await expect(listUserPerpOpenOrders(info as any, '0xabc')).rejects.toThrow()
    expect(openOrdersCalled).toBe(false)

    try {
      await orders.run({
        var: { info, address: '0xabc' },
        ok(data: unknown) {
          return data
        },
        error(err: unknown) {
          return err
        },
      })
      throw new Error('expected orders to throw')
    } catch (err) {
      expect(commandError(err, 'UNKNOWN')).toMatchObject({ code: 'RATE_LIMITED' })
    }
  })

  test('order cancel reports RATE_LIMITED', async () => {
    const seen: { code?: string; retryable?: boolean }[] = []
    await commandRun(
      order,
      'cancel',
    )({
      args: { oid: 1 },
      options: { dryRun: true },
      var: { info: infoThat429s(), address: '0xabc', exchange: {} },
      error(err: { code: string; retryable?: boolean }) {
        seen.push(err)
        return err
      },
      ok(data: unknown) {
        return data
      },
    })
    expect(seen[0]).toMatchObject({ code: 'RATE_LIMITED', retryable: true })
  })

  test('position sl reports RATE_LIMITED instead of NO_POSITION', async () => {
    const seen: { code?: string }[] = []
    await commandRun(
      position,
      'sl',
    )({
      args: { coin: 'BTC' },
      options: { price: '90000', dryRun: true },
      var: { info: infoThat429s(), address: '0xabc', exchange: {} },
      error(err: { code: string }) {
        seen.push(err)
        return err
      },
      ok(data: unknown) {
        return data
      },
    })
    expect(seen.map((err) => err.code)).toContain('RATE_LIMITED')
    expect(seen.map((err) => err.code)).not.toContain('NO_POSITION')
  })
})
