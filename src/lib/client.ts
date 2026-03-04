import { HttpTransport, InfoClient, ExchangeClient } from '@nktkas/hyperliquid'
import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'

/**
 * Create an InfoClient configured for the correct network.
 * Each CLI invocation is a fresh process, so no caching/singleton needed.
 */
export function createInfoClient(isTestnet: boolean = false): InfoClient {
  const transport = new HttpTransport({ isTestnet })
  return new InfoClient({ transport })
}

/**
 * Create an ExchangeClient configured for the correct network.
 * Requires a private key for signing trade transactions.
 */
export function createExchangeClient(
  privateKey: string,
  isTestnet: boolean = false,
): ExchangeClient {
  const transport = new HttpTransport({ isTestnet })
  const wallet = privateKeyToAccount(privateKey as Hex)
  return new ExchangeClient({ transport, wallet })
}
