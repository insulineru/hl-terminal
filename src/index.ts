#!/usr/bin/env bun
import { Cli, z, middleware } from 'incur'
import { loadActiveAccount } from './lib/config.js'
import { createInfoClient } from './lib/client.js'
import { account } from './commands/account.js'
import { price } from './commands/price.js'
import { balance } from './commands/balance.js'
import { positions } from './commands/positions.js'
import { orders } from './commands/orders.js'
import { markets } from './commands/markets.js'
import { funding } from './commands/funding.js'
import { fills } from './commands/fills.js'

// Vars schema for middleware injection
const vars = z.object({
  info: z.any().optional(),
  address: z.string().optional(),
  account: z.any().optional(),
  testnet: z.boolean().default(false),
})

const cli = Cli.create('hl', {
  version: '0.2.0',
  description:
    'Hyperliquid DEX trading CLI — read market state, manage accounts, and execute trades from the terminal or via AI agent (MCP)',
  options: z.object({
    testnet: z.boolean().optional().describe('Use testnet network'),
  }),
  alias: { testnet: 't' },
  vars,
})

// Account middleware — loads active account and injects InfoClient
// Skips for 'account' commands (they manage accounts, don't need one loaded)
cli.use(
  middleware<typeof vars>(async (c, next) => {
    // Skip middleware for account management commands
    if (c.command.startsWith('account')) {
      await next()
      return
    }

    // Parse testnet from options (passed via argv)
    // incur may parse --testnet into the options before middleware runs
    const isTestnet = (c as any).options?.testnet === true

    c.set('testnet', isTestnet)

    // Load active account
    const acct = loadActiveAccount()
    if (!acct) {
      return c.error({
        code: 'NO_ACCOUNT',
        message: 'No active account configured',
        cta: {
          commands: [{ command: 'account add --name main', description: 'Add your first account' }],
          description: 'Get started:',
        },
      })
    }

    // Create InfoClient
    const info = createInfoClient(isTestnet)
    c.set('info', info)
    c.set('address', acct.address)
    c.set('account', acct)

    await next()
  }),
)

// Register commands
cli.command(account)
cli.command('price', price)
cli.command('balance', balance)
cli.command('positions', positions)
cli.command('orders', orders)
cli.command('markets', markets)
cli.command('funding', funding)
cli.command('fills', fills)

cli.serve()

export default cli
