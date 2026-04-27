import { z } from 'incur'
import { listUserPerpOpenOrders } from '../lib/perps.js'

export const orders = {
  description: 'View open perpetual orders across the main exchange and builder dexs',
  examples: [{ description: 'View all open orders' }],
  output: z.object({
    orders: z.array(
      z.object({
        oid: z.number(),
        coin: z.string(),
        side: z.string(),
        size: z.string(),
        origSize: z.string(),
        sizeMode: z.enum(['explicit', 'position']),
        price: z.string(),
        orderType: z.string(),
        reduceOnly: z.boolean(),
        isTrigger: z.boolean(),
        isPositionTpsl: z.boolean(),
        triggerPx: z.string().optional(),
        triggerCondition: z.string().optional(),
        tif: z.string().optional(),
        cloid: z.string().optional(),
        currentPositionSize: z.string().optional(),
        currentPositionSizeSource: z.enum(['derivedFromPosition']).optional(),
      }),
    ),
  }),
  async run(c: any) {
    const address = c.var.address
    const openOrders = await listUserPerpOpenOrders(c.var.info, address)

    return c.ok({ orders: openOrders })
  },
}
