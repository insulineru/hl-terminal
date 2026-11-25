import { z } from 'incur'
import { listUserPerpOpenOrders } from '../lib/perps.js'

export const orders = {
  description:
    'View open perpetual orders. Trigger orders include triggerPx (the activation price), separate from the limit price.',
  examples: [{ description: 'View all open orders' }],
  output: z.object({
    orders: z.array(
      z.object({
        oid: z.number(),
        coin: z.string(),
        side: z.string(),
        size: z
          .string()
          .describe('Base size, or "full position" for a position-wide TP/SL (exchange size 0)'),
        price: z
          .string()
          .describe(
            'Limit price. Stop-market orders show the slippage bound here, not the trigger',
          ),
        orderType: z.string(),
        triggerPx: z
          .string()
          .nullable()
          .describe('Trigger price. Null for orders that are not triggers'),
        isMarket: z
          .boolean()
          .describe('True when the order executes as a market order once active'),
        reduceOnly: z.boolean(),
        tpsl: z
          .enum(['tp', 'sl'])
          .nullable()
          .describe('tp for take-profit, sl for stop, null for plain limit/market orders'),
      }),
    ),
  }),
  async run(c: any) {
    const address = c.var.address
    const openOrders = await listUserPerpOpenOrders(c.var.info, address)

    return c.ok({ orders: openOrders })
  },
}
