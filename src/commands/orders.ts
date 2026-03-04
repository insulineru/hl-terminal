import { z } from 'incur'
import { formatSide } from '../lib/exchange.js'

export const orders = {
  description: 'View open orders with ID, side, size, price, type',
  examples: [{ description: 'View all open orders' }],
  output: z.object({
    orders: z.array(
      z.object({
        oid: z.number(),
        coin: z.string(),
        side: z.string(),
        size: z.string(),
        price: z.string(),
        orderType: z.string(),
      }),
    ),
  }),
  async run(c: any) {
    const address = c.var.address

    // Use frontendOpenOrders for richer data if available, fallback to openOrders
    let rawOrders: any[]
    try {
      rawOrders = await c.var.info.frontendOpenOrders({ user: address })
    } catch {
      rawOrders = await c.var.info.openOrders({ user: address })
    }

    const openOrders = (rawOrders ?? []).map((o: any) => ({
      oid: o.oid ?? 0,
      coin: o.coin ?? '',
      side: formatSide(o.side ?? ''),
      size: o.sz ?? '0',
      price: o.limitPx ?? o.px ?? '0',
      orderType: o.orderType ?? 'Limit',
    }))

    return c.ok({ orders: openOrders })
  },
}
