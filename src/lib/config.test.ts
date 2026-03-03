import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { statSync, existsSync, rmSync } from 'fs'
import {
  normalizeKey,
  loadConfig,
  saveConfig,
  addAccount,
  listAccounts,
  removeAccount,
  switchDefault,
  loadActiveAccount,
  getConfigFile,
} from './config.js'

// Use a test-specific private key (not a real one)
// This is the standard viem test account private key
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const TEST_KEY_2 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

// We can't easily mock the config dir since it uses constants.
// Instead we test the utility functions directly and the CRUD functions
// will use the real config dir. We clean up after.

describe('normalizeKey', () => {
  test('prepends 0x if missing', () => {
    expect(normalizeKey('abc123')).toBe('0xabc123')
  })

  test('keeps 0x if already present', () => {
    expect(normalizeKey('0xabc123')).toBe('0xabc123')
  })

  test('trims whitespace', () => {
    expect(normalizeKey('  0xabc123  ')).toBe('0xabc123')
  })

  test('trims whitespace and prepends 0x', () => {
    expect(normalizeKey('  abc123  ')).toBe('0xabc123')
  })
})

describe('Config CRUD', () => {
  // These tests use the real config directory.
  // We back up and restore any existing config.
  let originalConfig: string | null = null
  const configFile = getConfigFile()

  beforeEach(() => {
    // Back up existing config
    if (existsSync(configFile)) {
      const { readFileSync } = require('fs')
      originalConfig = readFileSync(configFile, 'utf-8')
    }
    // Clean slate
    if (existsSync(configFile)) {
      rmSync(configFile)
    }
  })

  afterEach(() => {
    // Restore original config
    if (originalConfig !== null) {
      const { writeFileSync, chmodSync } = require('fs')
      writeFileSync(configFile, originalConfig)
      chmodSync(configFile, 0o600)
    } else if (existsSync(configFile)) {
      rmSync(configFile)
    }
  })

  test('loadConfig returns empty when no file', () => {
    const config = loadConfig()
    expect(config.accounts).toEqual([])
    expect(config.default).toBeNull()
  })

  test('saveConfig creates file with 600 permissions', () => {
    saveConfig({ accounts: [], default: null })
    expect(existsSync(configFile)).toBe(true)
    const stat = statSync(configFile)
    // Check file permissions (mode & 0o777 gives the rwx bits)
    expect(stat.mode & 0o777).toBe(0o600)
  })

  test('addAccount derives address and sets as default (first account)', () => {
    const account = addAccount('test-main', TEST_KEY)
    expect(account.name).toBe('test-main')
    expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(account.privateKey).toBe(TEST_KEY)

    // Verify it's the default
    const config = loadConfig()
    expect(config.default).toBe('test-main')
    expect(config.accounts).toHaveLength(1)
  })

  test('addAccount second account does NOT change default', () => {
    addAccount('test-first', TEST_KEY)
    addAccount('test-second', TEST_KEY_2)

    const config = loadConfig()
    expect(config.default).toBe('test-first')
    expect(config.accounts).toHaveLength(2)
  })

  test('addAccount throws if name already exists', () => {
    addAccount('test-dup', TEST_KEY)
    expect(() => addAccount('test-dup', TEST_KEY_2)).toThrow('already exists')
  })

  test('listAccounts returns masked keys', () => {
    addAccount('test-list', TEST_KEY)
    const list = listAccounts()
    expect(list).toHaveLength(1)
    expect(list[0]!.maskedKey).toMatch(/^0x\w{4}\.\.\.\w{4}$/)
    expect(list[0]!.isDefault).toBe(true)
  })

  test('removeAccount removes and reassigns default', () => {
    addAccount('test-rm1', TEST_KEY)
    addAccount('test-rm2', TEST_KEY_2)
    removeAccount('test-rm1')

    const config = loadConfig()
    expect(config.accounts).toHaveLength(1)
    expect(config.default).toBe('test-rm2')
  })

  test('removeAccount throws for nonexistent', () => {
    expect(() => removeAccount('nonexistent')).toThrow('not found')
  })

  test('switchDefault changes default', () => {
    addAccount('test-sw1', TEST_KEY)
    addAccount('test-sw2', TEST_KEY_2)
    switchDefault('test-sw2')

    const config = loadConfig()
    expect(config.default).toBe('test-sw2')
  })

  test('switchDefault throws for nonexistent', () => {
    expect(() => switchDefault('nonexistent')).toThrow('not found')
  })

  test('loadActiveAccount returns default account details', () => {
    addAccount('test-active', TEST_KEY)
    const active = loadActiveAccount()
    expect(active).not.toBeNull()
    expect(active!.name).toBe('test-active')
    expect(active!.privateKey).toBe(TEST_KEY)
  })

  test('loadActiveAccount returns null when no accounts', () => {
    const active = loadActiveAccount()
    expect(active).toBeNull()
  })
})
