/**
 * incur treats boolean flags as presence-only, so `--reduce-only true` leaves
 * the word `true` as the next positional (the limit price on `order create`).
 * Fold a following true/false into the flag before incur parses argv.
 */

const BOOLEAN_LONG_FLAGS = new Set([
  'reduce-only',
  'reduceOnly',
  'dry-run',
  'dryRun',
  'force',
  'isolated',
  'cross',
  'testnet',
  'verbose',
  'llms',
  'llms-full',
  'mcp',
  'help',
  'version',
  'schema',
  'json',
  'token-count',
])

/** Short flags whose long name is a boolean. Stacked shorts are left alone. */
const SHORT_TO_LONG: Record<string, string> = {
  r: 'reduce-only',
  d: 'dry-run',
  t: 'testnet',
  h: 'help',
}

function booleanWord(token: string | undefined): 'true' | 'false' | undefined {
  if (!token) return undefined
  const lower = token.toLowerCase()
  if (lower === 'true' || lower === 'false') return lower
  return undefined
}

export function isBooleanWord(value: string): boolean {
  return booleanWord(value) !== undefined
}

/** Message when true/false reached a price field instead of a flag. */
export function booleanPriceError(value: string): string {
  return `"${value}" is not a price. true and false set boolean flags (--reduce-only true, --dry-run false); they are never a price.`
}

function kebab(name: string): string {
  if (name === 'reduceOnly') return 'reduce-only'
  if (name === 'dryRun') return 'dry-run'
  return name
}

function positiveFlag(name: string): string {
  return `--${kebab(name)}`
}

function negativeFlag(name: string): string {
  return `--no-${kebab(name)}`
}

export function normalizeBooleanFlagValues(argv: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!
    if (token.startsWith('--') && token.includes('=')) {
      out.push(token)
      continue
    }

    const word = booleanWord(argv[i + 1])
    if (!word) {
      out.push(token)
      continue
    }

    if (token.startsWith('--no-') && token.length > 5 && BOOLEAN_LONG_FLAGS.has(token.slice(5))) {
      i++
      out.push(word === 'true' ? token : positiveFlag(token.slice(5)))
      continue
    }

    if (token.startsWith('--') && BOOLEAN_LONG_FLAGS.has(token.slice(2))) {
      i++
      out.push(word === 'true' ? positiveFlag(token.slice(2)) : negativeFlag(token.slice(2)))
      continue
    }

    const short = /^-[A-Za-z]$/.test(token) ? SHORT_TO_LONG[token.slice(1)] : undefined
    if (short) {
      i++
      out.push(word === 'true' ? token : negativeFlag(short))
      continue
    }

    out.push(token)
  }
  return out
}
