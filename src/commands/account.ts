import { Cli, z } from 'incur'
import {
  addAccount,
  addWatchAccount,
  listAccounts,
  removeAccount,
  switchDefault,
} from '../lib/config.js'
import * as readline from 'readline'

/**
 * Read hidden input from stdin (key never visible in terminal).
 * Falls back to reading from piped stdin.
 */
async function readHiddenInput(prompt: string): Promise<string> {
  // If stdin is not a TTY (piped input), read directly
  if (!process.stdin.isTTY) {
    const text = await new Response(process.stdin as any).text()
    return text.trim()
  }

  // Interactive hidden input
  return new Promise((resolve, _reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // Write prompt to stderr (MCP safe)
      terminal: true,
    })

    // Disable echo for the question
    ;(rl as any)._writeToOutput = (s: string) => {
      if (s === prompt) {
        process.stderr.write(s)
      }
      // Suppress all other output (the typed characters)
    }

    rl.question(prompt, (answer) => {
      process.stderr.write('\n')
      rl.close()
      resolve(answer.trim())
    })
  })
}

export const account = Cli.create('account', {
  description: 'Manage Hyperliquid accounts',
})

account.command('add', {
  description: 'Add a new account',
  options: z.object({
    name: z.string().describe('Account label'),
  }),
  examples: [{ options: { name: 'main' }, description: 'Add a trading account' }],
  hint: 'Your private key is entered securely and never displayed. Pipe from a file: echo $KEY | hl account add --name main',
  alias: { name: 'n' },
  output: z.object({
    name: z.string(),
    address: z.string(),
    isDefault: z.boolean(),
  }),
  async run(c) {
    // Read private key with hidden input
    let key: string
    try {
      key = await readHiddenInput('Private key: ')
    } catch {
      return c.error({
        code: 'INPUT_ERROR',
        message: 'Failed to read private key input',
      })
    }

    if (!key || key.length === 0) {
      return c.error({
        code: 'EMPTY_KEY',
        message: 'Private key cannot be empty',
      })
    }

    try {
      const acct = addAccount(c.options.name, key)
      const list = listAccounts()
      const isDefault = list.find((a) => a.name === acct.name)?.isDefault ?? false

      return c.ok(
        {
          name: acct.name,
          address: acct.address,
          isDefault,
        },
        { cta: { commands: [{ command: 'balance', description: 'Check account balance' }] } },
      )
    } catch (err) {
      return c.error({
        code: 'ADD_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

account.command('watch', {
  description: 'Add a read-only account (address only, no private key needed)',
  args: z.object({
    address: z.string().describe('Wallet address (0x...)'),
  }),
  options: z.object({
    name: z.string().describe('Account label'),
  }),
  examples: [
    {
      args: { address: '0x...' },
      options: { name: 'whale' },
      description: 'Watch a wallet (read-only)',
    },
  ],
  alias: { name: 'n' },
  output: z.object({
    name: z.string(),
    address: z.string(),
    isDefault: z.boolean(),
  }),
  run(c) {
    try {
      const acct = addWatchAccount(c.options.name, c.args.address)
      const list = listAccounts()
      const isDefault = list.find((a) => a.name === acct.name)?.isDefault ?? false

      return c.ok(
        {
          name: acct.name,
          address: acct.address,
          isDefault,
        },
        { cta: { commands: [{ command: 'balance', description: 'Check wallet balance' }] } },
      )
    } catch (err) {
      return c.error({
        code: 'WATCH_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

account.command('ls', {
  description: 'List all accounts',
  examples: [{ description: 'List all configured accounts' }],
  output: z.object({
    accounts: z.array(
      z.object({
        name: z.string(),
        address: z.string(),
        maskedKey: z.string(),
        isDefault: z.boolean(),
      }),
    ),
  }),
  run(c) {
    const accounts = listAccounts()

    if (accounts.length === 0) {
      return c.error({
        code: 'NO_ACCOUNTS',
        message: 'No accounts configured',
        cta: {
          commands: [{ command: 'account add --name main', description: 'Add your first account' }],
          description: 'Get started:',
        },
      })
    }

    return c.ok({ accounts })
  },
})

account.command('rm', {
  description: 'Remove an account',
  args: z.object({
    name: z.string().describe('Account name to remove'),
  }),
  examples: [{ args: { name: 'old' }, description: 'Remove an account' }],
  output: z.object({
    removed: z.string(),
    newDefault: z.string().nullable(),
  }),
  run(c) {
    try {
      removeAccount(c.args.name)
      const accounts = listAccounts()
      const defaultAcct = accounts.find((a) => a.isDefault)

      return c.ok({
        removed: c.args.name,
        newDefault: defaultAcct?.name ?? null,
      })
    } catch (err) {
      return c.error({
        code: 'REMOVE_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

account.command('switch', {
  description: 'Switch default account',
  args: z.object({
    name: z.string().describe('Account name to set as default'),
  }),
  examples: [{ args: { name: 'main' }, description: 'Switch default account' }],
  output: z.object({
    name: z.string(),
    address: z.string(),
  }),
  run(c) {
    try {
      switchDefault(c.args.name)
      const accounts = listAccounts()
      const acct = accounts.find((a) => a.name === c.args.name)

      return c.ok(
        {
          name: c.args.name,
          address: acct?.address ?? '',
        },
        { cta: { commands: [{ command: 'balance', description: 'View new account balance' }] } },
      )
    } catch (err) {
      return c.error({
        code: 'SWITCH_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  },
})
