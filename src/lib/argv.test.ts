import { describe, expect, test } from 'bun:test'
import { Cli, Parser, z } from 'incur'
import { booleanPriceError, isBooleanWord, normalizeBooleanFlagValues } from './argv.js'

const createArgs = z.object({
  coin: z.string(),
  side: z.enum(['buy', 'sell']),
  size: z.string(),
  price: z.string().optional(),
})

const createOptions = z.object({
  tif: z.enum(['GTC', 'IOC', 'ALO']).default('GTC'),
  slippage: z.number().default(3),
  reduceOnly: z.boolean().default(false),
  tp: z.string().optional(),
  sl: z.string().optional(),
  dryRun: z.boolean().default(false),
  force: z.boolean().default(false),
})

const alias = { reduceOnly: 'r', dryRun: 'd' }

function parseCreate(argv: string[]) {
  return Parser.parse(normalizeBooleanFlagValues(argv), {
    args: createArgs,
    options: createOptions,
    alias,
  })
}

describe('normalizeBooleanFlagValues', () => {
  test('--reduce-only true is the flag, not the positional price', () => {
    const parsed = parseCreate(['BTC', 'buy', '0.001', '--reduce-only', 'true'])
    expect(parsed.args.price).toBeUndefined()
    expect(parsed.options.reduceOnly).toBe(true)
    expect(isBooleanWord('true')).toBe(true)
  })

  test('--reduce-only false stays false and does not consume a real price', () => {
    const parsed = parseCreate(['BTC', 'buy', '0.001', '95000', '--reduce-only', 'false'])
    expect(parsed.args.price).toBe('95000')
    expect(parsed.options.reduceOnly).toBe(false)
  })

  test('a spaced true before the price does not become the price', () => {
    const parsed = parseCreate([
      'BTC',
      'buy',
      '0.001',
      '--reduce-only',
      'true',
      '95000',
      '--dry-run',
    ])
    expect(parsed.args).toMatchObject({ coin: 'BTC', side: 'buy', size: '0.001', price: '95000' })
    expect(parsed.options.reduceOnly).toBe(true)
    expect(parsed.options.dryRun).toBe(true)
  })

  test('--dry-run false and --force true are boolean values', () => {
    const parsed = parseCreate(['ETH', 'sell', '1', '--dry-run', 'false', '--force', 'TRUE'])
    expect(parsed.options.dryRun).toBe(false)
    expect(parsed.options.force).toBe(true)
    expect(parsed.args.price).toBeUndefined()
  })

  test('equals form accepts true/false/1/0/yes/no in any case', () => {
    expect(parseCreate(['BTC', 'buy', '0.001', '--reduce-only=TRUE']).options.reduceOnly).toBe(true)
    expect(parseCreate(['BTC', 'buy', '0.001', '--reduce-only=FALSE']).options.reduceOnly).toBe(
      false,
    )
    expect(parseCreate(['BTC', 'buy', '0.001', '--reduce-only=yes']).options.reduceOnly).toBe(true)
    expect(parseCreate(['BTC', 'buy', '0.001', '--reduce-only=No']).options.reduceOnly).toBe(false)
    expect(parseCreate(['BTC', 'buy', '0.001', '--reduce-only=1']).options.reduceOnly).toBe(true)
    expect(parseCreate(['BTC', 'buy', '0.001', '--dry-run=0']).options.dryRun).toBe(false)

    const normalized = normalizeBooleanFlagValues([
      'order',
      'create',
      'BTC',
      'buy',
      '0.001',
      '-r',
      'false',
    ])
    expect(normalized).toContain('--no-reduce-only')
    const short = Parser.parse(
      normalized.filter((token) => token !== 'order' && token !== 'create'),
      { args: createArgs, options: createOptions, alias },
    )
    expect(short.options.reduceOnly).toBe(false)
    expect(short.args.price).toBeUndefined()
  })

  test('rejects an unknown boolean word after =', () => {
    expect(() => normalizeBooleanFlagValues(['--reduce-only=maybe'])).toThrow(/Invalid boolean/)
  })

  test('--no-reduce-only false means reduce-only', () => {
    const parsed = parseCreate(['BTC', 'buy', '0.001', '--no-reduce-only', 'false'])
    expect(parsed.options.reduceOnly).toBe(true)
    expect(parsed.args.price).toBeUndefined()
  })

  test('a bare true remains a positional so the command can reject it', () => {
    const parsed = parseCreate(['BTC', 'buy', '0.001', 'true'])
    expect(parsed.args.price).toBe('true')
    expect(booleanPriceError('true')).toContain('never a price')
  })

  test('does not steal the value of a non-boolean flag', () => {
    const argv = normalizeBooleanFlagValues(['--slippage', '10', '--trigger', '56666'])
    expect(argv).toEqual(['--slippage', '10', '--trigger', '56666'])
  })

  test('fills -d false stays --days, not --no-dry-run', () => {
    const argv = normalizeBooleanFlagValues(['fills', 'BTC', '-d', 'false'])
    expect(argv).toEqual(['fills', 'BTC', '-d', 'false'])
    expect(argv.join(' ')).not.toContain('--no-dry-run')

    let thrown: unknown
    try {
      Parser.parse(['BTC', '-d', 'false'], {
        args: z.object({ coin: z.string().optional() }),
        options: z.object({
          limit: z.number().optional(),
          days: z.number().optional(),
        }),
        alias: { limit: 'l', days: 'd' },
      })
    } catch (err) {
      thrown = err
    }
    expect(String(thrown)).not.toContain('--no-dry-run')
    expect(thrown).toBeDefined()
  })

  test('presence-only false is dropped so incur does not see --no-*', async () => {
    const argv = normalizeBooleanFlagValues([
      'price',
      'BTC',
      '--testnet',
      'false',
      '-t',
      'FALSE',
      '--verbose',
      'false',
      '--json=no',
      '--verbose=TRUE',
    ])
    expect(argv).toEqual(['price', 'BTC', '--verbose'])
    expect(argv.join(' ')).not.toContain('--no-')

    const lines: string[] = []
    let code = 0
    const cli = Cli.create('demo', {
      options: z.object({ testnet: z.boolean().optional() }),
      alias: { testnet: 't' },
    })
    cli.command('price', {
      args: z.object({ coin: z.string() }),
      output: z.object({ coin: z.string() }),
      run(c) {
        return c.ok({ coin: c.args.coin })
      },
    })
    await cli.serve(argv, {
      exit(status) {
        code = status
      },
      stdout(chunk) {
        lines.push(chunk)
      },
    })
    const text = lines.join('')
    expect(text).not.toContain('Unknown flag')
    expect(code).toBe(0)
    expect(text).toContain('BTC')
  })

  test('a space does not treat 1, 0, yes, or no as the flag value', () => {
    const marketSized = parseCreate(['ETH', 'buy', '--reduce-only', '1', '3000'])
    expect(marketSized.args).toMatchObject({ coin: 'ETH', side: 'buy', size: '1', price: '3000' })
    expect(marketSized.options.reduceOnly).toBe(true)

    const droppedPrice = parseCreate(['OP', 'buy', '10', '--reduce-only', '1'])
    expect(droppedPrice.args).toMatchObject({ coin: 'OP', side: 'buy', size: '10', price: '1' })
    expect(droppedPrice.options.reduceOnly).toBe(true)

    const flipped = parseCreate(['BTC', 'buy', '1', '--reduce-only', '0'])
    expect(flipped.args).toMatchObject({ coin: 'BTC', side: 'buy', size: '1', price: '0' })
    expect(flipped.options.reduceOnly).toBe(true)

    const testnet = Parser.parse(
      normalizeBooleanFlagValues(['BTC', 'buy', '--testnet', '1', '95000']),
      {
        args: createArgs,
        options: createOptions.extend({ testnet: z.boolean().optional() }),
        alias,
      },
    )
    expect(testnet.args).toMatchObject({ size: '1', price: '95000' })
    expect(testnet.options.reduceOnly).toBe(false)
    expect(testnet.options.testnet).toBe(true)

    const leverage = Parser.parse(
      normalizeBooleanFlagValues(['position', 'leverage', 'BTC', '--isolated', '1']).slice(2),
      {
        args: z.object({ coin: z.string(), leverage: z.coerce.number() }),
        options: z.object({
          isolated: z.boolean().default(false),
          cross: z.boolean().default(false),
          dryRun: z.boolean().default(false),
        }),
      },
    )
    expect(leverage.args).toMatchObject({ coin: 'BTC', leverage: 1 })
    expect(leverage.options.isolated).toBe(true)
  })

  test('finds the command after a valued global flag', () => {
    const argv = normalizeBooleanFlagValues([
      '--format',
      'json',
      'order',
      'create',
      'BTC',
      'buy',
      '0.001',
      '-r',
      'false',
    ])
    expect(argv).toContain('--no-reduce-only')
    expect(argv).toContain('json')
    const parsed = Parser.parse(['BTC', 'buy', '0.001', '--no-reduce-only'], {
      args: createArgs,
      options: createOptions,
      alias,
    })
    expect(parsed.args).toMatchObject({ coin: 'BTC', side: 'buy', size: '0.001' })
    expect(parsed.args.price).toBeUndefined()
    expect(parsed.options.reduceOnly).toBe(false)
  })

  test('the last presence flag wins', () => {
    expect(normalizeBooleanFlagValues(['--testnet', '--testnet', 'false'])).toEqual([])
    expect(normalizeBooleanFlagValues(['--testnet', 'false', '--testnet'])).toEqual(['--testnet'])
    expect(normalizeBooleanFlagValues(['-t', '--testnet', 'false'])).toEqual([])
    expect(normalizeBooleanFlagValues(['--verbose', '--verbose', 'FALSE'])).toEqual([])
    expect(normalizeBooleanFlagValues(['--testnet=true', '--testnet=false'])).toEqual([])
  })
})
