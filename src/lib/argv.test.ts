import { describe, expect, test } from 'bun:test'
import { Parser, z } from 'incur'
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

  test('equals form is left for incur, and -r false turns the flag off', () => {
    const equals = parseCreate(['BTC', 'buy', '0.001', '--reduce-only=false', '--dry-run=true'])
    expect(equals.options.reduceOnly).toBe(false)
    expect(equals.options.dryRun).toBe(true)

    const short = parseCreate(['BTC', 'buy', '0.001', '-r', 'false'])
    expect(short.options.reduceOnly).toBe(false)
    expect(short.args.price).toBeUndefined()
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
})
