#!/usr/bin/env bun
import { createRequire } from 'node:module'
import { Cli, z, middleware } from 'incur'
import { normalizeBooleanFlagValues } from './lib/argv.js'
import { loadActiveAccount } from './lib/config.js'
import { createInfoClient, createExchangeClient } from './lib/client.js'
import { commandError } from './lib/errors.js'
import { account } from './commands/account.js'
import { price } from './commands/price.js'
import { balance } from './commands/balance.js'
import { positions } from './commands/positions.js'
import { orders } from './commands/orders.js'
import { markets } from './commands/markets.js'
import { funding } from './commands/funding.js'
import { fills } from './commands/fills.js'
import { candles } from './commands/candles.js'
import { order } from './commands/order.js'
import { position } from './commands/position.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

// Vars schema for middleware injection
const vars = z.object({
  info: z.any().optional(),
  exchange: z.any().optional(),
  address: z.string().optional(),
  account: z.any().optional(),
  testnet: z.boolean().default(false),
})

const cli = Cli.create('hl-terminal', {
  version,
  description:
    'Hyperliquid DEX trading CLI — read market state, manage accounts, and execute trades from the terminal or via AI agent (MCP)',
  options: z.object({
    testnet: z.boolean().optional().describe('Use testnet network'),
  }),
  alias: { testnet: 't' },
  vars,
  sync: {
    suggestions: [
      'Check BTC price: hl price BTC',
      'View account balance: hl balance',
      'Place a market buy: hl order create BTC buy 0.001',
      'Preview a sell stop: hl order trigger BTC sell 0.5 --trigger 56666 --dry-run',
    ],
    depth: 1,
  },
})

// Account middleware — loads active account and injects InfoClient
// Skips for 'account' commands (they manage accounts, don't need one loaded)
cli.use(
  middleware<typeof vars>(async (c, next) => {
    // Skip middleware for account management commands
    if (c.command.startsWith('account')) {
      await runCommand(c, next)
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

    // Lazily create ExchangeClient only when first accessed (avoids crypto overhead for read-only commands)
    if (acct.privateKey) {
      let _exchange: ReturnType<typeof createExchangeClient> | undefined
      const exchangeProxy = new Proxy({} as ReturnType<typeof createExchangeClient>, {
        get(_, prop) {
          if (!_exchange) _exchange = createExchangeClient(acct.privateKey!, isTestnet)
          return (_exchange as any)[prop]
        },
      })
      c.set('exchange', exchangeProxy)
    }

    await runCommand(c, next)
  }),
)

async function runCommand(
  c: { error: (options: { code: string; message: string; retryable?: boolean }) => never },
  next: () => Promise<void>,
) {
  try {
    await next()
  } catch (err) {
    const mapped = commandError(err, 'UNKNOWN')
    if (mapped.code === 'RATE_LIMITED') return c.error(mapped)
    throw err
  }
}

// Register commands
cli.command(account)
cli.command('price', price)
cli.command('balance', balance)
cli.command('positions', positions)
cli.command('orders', orders)
cli.command('markets', markets)
cli.command('funding', funding)
cli.command('fills', fills)
cli.command('candles', candles)
cli.command(order)
cli.command(position)

let argv: string[]
try {
  argv = normalizeBooleanFlagValues(process.argv.slice(2))
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

cli.serve(argv)
