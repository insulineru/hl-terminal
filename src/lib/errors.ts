/**
 * Turn thrown Hyperliquid transport errors into CLI error objects.
 * HTTP 429 is RATE_LIMITED and retryable; every other error keeps the caller's code.
 */

export type CommandError = {
  code: string
  message: string
  retryable?: boolean
}

type HttpResponseLike = {
  status?: number
  headers?: { get?: (name: string) => string | null }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function causeChain(err: unknown): unknown[] {
  const chain: unknown[] = []
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = (current as { cause?: unknown }).cause
  }
  return chain
}

function responseOf(err: unknown): HttpResponseLike | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined
  const response = (err as { response?: unknown }).response
  if (!response || typeof response !== 'object') return undefined
  return response as HttpResponseLike
}

/** True when Hyperliquid (or a wrapper around its HTTP error) answered 429. */
export function isHyperliquidRateLimit(err: unknown): boolean {
  for (const item of causeChain(err)) {
    if (responseOf(item)?.status === 429) return true
    const message = errorMessage(item)
    if (/\b429\b/.test(message) && /too many requests/i.test(message)) return true
  }
  return false
}

function retryHint(err: unknown): string {
  for (const item of causeChain(err)) {
    const headers = responseOf(item)?.headers
    const raw = headers?.get?.('retry-after')
    if (!raw) continue
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return `Retry after ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`
    }
    return `Retry after ${raw}.`
  }
  return 'Retry after a short wait.'
}

export function commandError(err: unknown, fallbackCode: string): CommandError {
  if (!isHyperliquidRateLimit(err)) {
    return { code: fallbackCode, message: errorMessage(err) }
  }
  return {
    code: 'RATE_LIMITED',
    message: `Hyperliquid rate limited this request (HTTP 429). ${retryHint(err)}`,
    retryable: true,
  }
}
