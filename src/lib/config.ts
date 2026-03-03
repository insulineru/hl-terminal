import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'

// --- Types ---

interface Account {
  name: string
  address: string
  privateKey: string | null // null for read-only (watch) accounts
}

interface Config {
  accounts: Account[]
  default: string | null
}

// --- Constants ---

const CONFIG_DIR = join(homedir(), '.hyperliquid')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

// --- Core Utilities ---

export function getConfigFile(): string {
  return CONFIG_FILE
}

/**
 * Normalize a private key: trim whitespace, prepend 0x if missing.
 */
export function normalizeKey(raw: string): `0x${string}` {
  const trimmed = raw.trim()
  const key = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
  return key as `0x${string}`
}

/**
 * Ensure ~/.hyperliquid/ directory exists with 700 permissions.
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true })
  }
}

/**
 * Load config from disk. Returns empty config if file doesn't exist.
 */
export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    return { accounts: [], default: null }
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8')
  return JSON.parse(raw) as Config
}

/**
 * Save config to disk with atomic chmod 600 enforcement.
 * CRITICAL SECURITY: Every write MUST end with chmodSync(CONFIG_FILE, 0o600).
 */
export function saveConfig(config: Config): void {
  ensureConfigDir()
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
  chmodSync(CONFIG_FILE, 0o600)
}

// --- Account CRUD ---

/**
 * Add an account. Derives address from private key.
 * First account added becomes default automatically.
 * @throws if account name already exists
 */
export function addAccount(name: string, privateKeyRaw: string): Account {
  const config = loadConfig()

  if (config.accounts.some((a) => a.name === name)) {
    throw new Error(`Account "${name}" already exists`)
  }

  const key = normalizeKey(privateKeyRaw)
  const wallet = privateKeyToAccount(key as Hex)
  const address = wallet.address

  const account: Account = { name, address, privateKey: key }
  config.accounts.push(account)

  if (config.accounts.length === 1) {
    config.default = name
  }

  saveConfig(config)
  return account
}

/**
 * Add a read-only (watch) account — address only, no private key.
 * Can use all read commands but cannot trade.
 * @throws if account name already exists
 */
export function addWatchAccount(name: string, address: string): Account {
  const config = loadConfig()

  if (config.accounts.some((a) => a.name === name)) {
    throw new Error(`Account "${name}" already exists`)
  }

  const account: Account = { name, address, privateKey: null }
  config.accounts.push(account)

  if (config.accounts.length === 1) {
    config.default = name
  }

  saveConfig(config)
  return account
}

/**
 * List all accounts with masked keys.
 */
export function listAccounts(): Array<{
  name: string
  address: string
  maskedKey: string
  isDefault: boolean
}> {
  const config = loadConfig()
  return config.accounts.map((a) => ({
    name: a.name,
    address: a.address,
    maskedKey: a.privateKey
      ? `${a.privateKey.slice(0, 6)}...${a.privateKey.slice(-4)}`
      : '(read-only)',
    isDefault: a.name === config.default,
  }))
}

/**
 * Remove an account by name.
 * If removed account was default, switches default to next available.
 * @throws if account not found
 */
export function removeAccount(name: string): void {
  const config = loadConfig()
  const index = config.accounts.findIndex((a) => a.name === name)

  if (index === -1) {
    const available = config.accounts.map((a) => a.name).join(', ')
    throw new Error(`Account "${name}" not found${available ? `. Available: ${available}` : ''}`)
  }

  config.accounts.splice(index, 1)

  // Reassign default if needed
  if (config.default === name) {
    config.default = config.accounts.length > 0 ? config.accounts[0]!.name : null
  }

  saveConfig(config)
}

/**
 * Switch the default account.
 * @throws if account not found
 */
export function switchDefault(name: string): void {
  const config = loadConfig()
  const account = config.accounts.find((a) => a.name === name)

  if (!account) {
    const available = config.accounts.map((a) => a.name).join(', ')
    throw new Error(`Account "${name}" not found${available ? `. Available: ${available}` : ''}`)
  }

  config.default = name
  saveConfig(config)
}

/**
 * Load the active (default) account with full details.
 * Returns null if no accounts exist or no default is set.
 */
export function loadActiveAccount(): Account | null {
  const config = loadConfig()

  if (!config.default || config.accounts.length === 0) {
    return null
  }

  return config.accounts.find((a) => a.name === config.default) ?? null
}
