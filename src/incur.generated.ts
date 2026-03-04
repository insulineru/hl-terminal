declare module 'incur' {
  interface Register {
    commands: {
      'account add': { args: {}; options: { name: string } }
      'account ls': { args: {}; options: {} }
      'account rm': { args: { name: string }; options: {} }
      'account switch': { args: { name: string }; options: {} }
      'account watch': { args: { address: string }; options: { name: string } }
      balance: { args: {}; options: {} }
      fills: { args: { coin: string }; options: { limit: number; days: number } }
      funding: { args: { coin: string }; options: {} }
      markets: { args: {}; options: {} }
      'order cancel': { args: { oid: number }; options: { dryRun: boolean } }
      'order cancel-all': { args: {}; options: { coin: string; dryRun: boolean } }
      'order create': {
        args: { coin: string; side: 'buy' | 'sell'; size: string; price: string }
        options: {
          tif: 'GTC' | 'IOC' | 'ALO'
          slippage: number
          reduceOnly: boolean
          tp: string
          sl: string
          dryRun: boolean
        }
      }
      orders: { args: {}; options: {} }
      'position leverage': {
        args: { coin: string; leverage: number }
        options: { isolated: boolean; cross: boolean; dryRun: boolean }
      }
      'position sl': { args: { coin: string }; options: { price: string; dryRun: boolean } }
      'position tp': { args: { coin: string }; options: { price: string; dryRun: boolean } }
      positions: { args: {}; options: {} }
      price: { args: { coin: string }; options: {} }
    }
  }
}
