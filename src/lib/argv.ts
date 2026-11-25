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

/** Accepted only after `=`. Digits and yes/no are real positionals when written after a space. */
const EQUALS_BOOLEAN_WORDS: Record<string, boolean> = {
  true: true,
  false: false,
  '1': true,
  '0': false,
  yes: true,
  no: false,
}

/** Global options that take a value, so that value is not a command word. */
const VALUED_GLOBAL_FLAGS = new Set(['format', 'filter-output', 'token-limit', 'token-offset'])

function equalsBooleanValue(token: string | undefined): boolean | undefined {
  if (token === undefined) return undefined
  const key = token.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(EQUALS_BOOLEAN_WORDS, key)) {
    return EQUALS_BOOLEAN_WORDS[key]
  }
  return undefined
}

/** Space-separated flag values. Only the words true and false, never 1/0/yes/no. */
function spacedBooleanValue(token: string | undefined): boolean | undefined {
  if (token === undefined) return undefined
  const key = token.toLowerCase()
  if (key === 'true') return true
  if (key === 'false') return false
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

/** A later `--testnet false` must turn off an earlier `--testnet` or `-t`. */
function clearPresence(out: string[], name: string) {
  const drop = new Set<string>([positiveFlag(name), `--${name}`])
  for (const [letter, spec] of Object.entries(GLOBAL_SHORTS)) {
    if (spec.name === name) drop.add(`-${letter}`)
  }
  for (let index = out.length - 1; index >= 0; index--) {
    if (drop.has(out[index]!)) out.splice(index, 1)
  }
}

function emitBoolean(
  out: string[],
  name: string,
  enabled: boolean,
  negatable: boolean,
  enabledToken?: string,
) {
  if (enabled) {
    out.push(enabledToken ?? positiveFlag(name))
    return
  }
  if (negatable) {
    out.push(negativeFlag(name))
    return
  }
  clearPresence(out, name)
}

function detectCommand(argv: readonly string[]): string | undefined {
  const words: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!
    if (token === '--') break

    if (token.startsWith('--')) {
      const eq = token.indexOf('=')
      const body = eq === -1 ? token : token.slice(0, eq)
      const name = body.startsWith('--no-') ? body.slice(5) : body.slice(2)
      if (eq === -1 && VALUED_GLOBAL_FLAGS.has(name)) {
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('-')) i++
        continue
      }
      if (eq === -1 && PRESENCE_FLAGS.has(name) && spacedBooleanValue(argv[i + 1]) !== undefined) {
        i++
      }
      continue
    }

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
      const value = equalsBooleanValue(rawValue)
      if (value === undefined) invalidBoolean(rawName, rawValue)
      const negatable = NEGATABLE_FLAGS.has(rawName)
      emitBoolean(out, rawName, negated ? !value : value, negatable)
      continue
    }

    const value = spacedBooleanValue(argv[i + 1])
    if (value === undefined) {
      out.push(token)
      continue
    }

    if (token.startsWith('--no-') && isKnownBoolean(token.slice(5))) {
      i++
      const name = token.slice(5)
      emitBoolean(out, name, !value, NEGATABLE_FLAGS.has(name))
      continue
    }

    if (token.startsWith('--') && isKnownBoolean(token.slice(2))) {
      i++
      const name = token.slice(2)
      emitBoolean(out, name, value, NEGATABLE_FLAGS.has(name))
      continue
    }

    const letter = /^-[A-Za-z]$/.test(token) ? token.slice(1) : undefined
    const short = letter ? shortFlag(command, letter) : undefined
    if (short) {
      i++
      emitBoolean(out, short.name, value, short.negatable, value ? token : undefined)
      continue
    }

    out.push(token)
  }

  return out
}
