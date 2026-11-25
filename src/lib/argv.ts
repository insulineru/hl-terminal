/**
 * incur treats boolean flags as presence-only, so `--reduce-only true` leaves
 * the word `true` as the next positional (the limit price on `order create`).
 * Fold a following boolean word into the flag before incur parses argv.
 *
 * Command booleans accept `--no-*`. Built-ins and `--testnet` do not, so a
 * false value drops that flag instead of emitting `--no-testnet`.
 */

/** Flags whose schema is a boolean and for which incur accepts `--no-*`. */
const NEGATABLE_FLAGS = new Set([
  'reduce-only',
  'reduceOnly',
  'dry-run',
  'dryRun',
  'force',
  'isolated',
  'cross',
])

/**
 * Presence-only flags. incur extracts these before command parsing and rejects
 * `--no-verbose`, `--no-testnet`, and the rest.
 */
const PRESENCE_FLAGS = new Set([
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

type ShortFlag = { name: string; negatable: boolean }

/** Short flags that are booleans on every command. `-d` is not one of them. */
const GLOBAL_SHORTS: Record<string, ShortFlag> = {
  t: { name: 'testnet', negatable: false },
  h: { name: 'help', negatable: false },
}

/**
 * Short flags whose meaning depends on the command.
 * `fills -d` is `--days`, not `--dry-run`.
 */
const COMMAND_SHORTS: Record<string, Record<string, ShortFlag>> = {
  'order create': {
    r: { name: 'reduce-only', negatable: true },
    d: { name: 'dry-run', negatable: true },
  },
  'order trigger': {
    r: { name: 'reduce-only', negatable: true },
    d: { name: 'dry-run', negatable: true },
  },
  'order cancel': { d: { name: 'dry-run', negatable: true } },
  'order cancel-all': { d: { name: 'dry-run', negatable: true } },
  'position leverage': { d: { name: 'dry-run', negatable: true } },
  'position tp': { d: { name: 'dry-run', negatable: true } },
  'position sl': { d: { name: 'dry-run', negatable: true } },
}

const COMMAND_PREFIXES = [
  'order cancel-all',
  'order create',
  'order trigger',
  'order cancel',
  'position leverage',
  'position tp',
  'position sl',
  'fills',
]

const BOOLEAN_WORDS: Record<string, boolean> = {
  true: true,
  false: false,
  '1': true,
  '0': false,
  yes: true,
  no: false,
}

function booleanValue(token: string | undefined): boolean | undefined {
  if (token === undefined) return undefined
  const key = token.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(BOOLEAN_WORDS, key)) return BOOLEAN_WORDS[key]
  return undefined
}

export function isBooleanWord(value: string): boolean {
  const key = value.toLowerCase()
  return key === 'true' || key === 'false'
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

function invalidBoolean(name: string, raw: string): never {
  throw new Error(
    `Invalid boolean value "${raw}" for --${kebab(name)}. Expected true, false, 1, 0, yes, or no.`,
  )
}

function flagFor(name: string, value: boolean, negatable: boolean): string | undefined {
  if (value) return positiveFlag(name)
  if (negatable) return negativeFlag(name)
  return undefined
}

function detectCommand(argv: readonly string[]): string | undefined {
  const words: string[] = []
  for (const token of argv) {
    if (token === '--') break
    if (token.startsWith('-')) continue
    words.push(token)
  }
  const joined = words.join(' ')
  for (const prefix of COMMAND_PREFIXES) {
    if (joined === prefix || joined.startsWith(`${prefix} `)) return prefix
  }
  return undefined
}

function shortFlag(command: string | undefined, letter: string): ShortFlag | undefined {
  const fromCommand = command ? COMMAND_SHORTS[command]?.[letter] : undefined
  if (fromCommand) return fromCommand
  return GLOBAL_SHORTS[letter]
}

function isKnownBoolean(name: string): boolean {
  return NEGATABLE_FLAGS.has(name) || PRESENCE_FLAGS.has(name)
}

export function normalizeBooleanFlagValues(argv: readonly string[]): string[] {
  const command = detectCommand(argv)
  const out: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!

    if (token.startsWith('--') && token.includes('=')) {
      const eq = token.indexOf('=')
      const negated = token.startsWith('--no-')
      const rawName = negated ? token.slice(5, eq) : token.slice(2, eq)
      const rawValue = token.slice(eq + 1)
      if (!isKnownBoolean(rawName)) {
        out.push(token)
        continue
      }
      const value = booleanValue(rawValue)
      if (value === undefined) invalidBoolean(rawName, rawValue)
      const negatable = NEGATABLE_FLAGS.has(rawName)
      const enabled = negated ? !value : value
      const flag = flagFor(rawName, enabled, negatable)
      if (flag) out.push(flag)
      continue
    }

    const value = booleanValue(argv[i + 1])
    if (value === undefined) {
      out.push(token)
      continue
    }

    if (token.startsWith('--no-') && isKnownBoolean(token.slice(5))) {
      i++
      const name = token.slice(5)
      const flag = flagFor(name, !value, NEGATABLE_FLAGS.has(name))
      if (flag) out.push(flag)
      continue
    }

    if (token.startsWith('--') && isKnownBoolean(token.slice(2))) {
      i++
      const name = token.slice(2)
      const flag = flagFor(name, value, NEGATABLE_FLAGS.has(name))
      if (flag) out.push(flag)
      continue
    }

    const letter = /^-[A-Za-z]$/.test(token) ? token.slice(1) : undefined
    const short = letter ? shortFlag(command, letter) : undefined
    if (short) {
      i++
      const flag = flagFor(short.name, value, short.negatable)
      if (flag) out.push(value ? token : flag)
      continue
    }

    out.push(token)
  }

  return out
}
