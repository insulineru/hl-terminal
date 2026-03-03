import { HttpTransport, InfoClient } from '@nktkas/hyperliquid'

/**
 * Create an InfoClient configured for the correct network.
 * Each CLI invocation is a fresh process, so no caching/singleton needed.
 */
export function createInfoClient(isTestnet: boolean = false): InfoClient {
  const transport = new HttpTransport({ isTestnet })
  return new InfoClient({ transport })
}
