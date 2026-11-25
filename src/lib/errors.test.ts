import { describe, expect, test } from 'bun:test'
import { commandError, isHyperliquidRateLimit } from './errors.js'

function rateLimitError(message = '429 Too Many Requests - null', retryAfter?: string) {
  return Object.assign(new Error(message), {
    response: {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { get: (name: string) => (name === 'retry-after' ? (retryAfter ?? null) : null) },
    },
  })
}

describe('commandError', () => {
  test('maps an HTTP 429 response to RATE_LIMITED with a retry hint', () => {
    const err = rateLimitError()
    expect(isHyperliquidRateLimit(err)).toBe(true)
    expect(commandError(err, 'ASSET_NOT_FOUND')).toEqual({
      code: 'RATE_LIMITED',
      message: 'Hyperliquid rate limited this request (HTTP 429). Retry after a short wait.',
      retryable: true,
    })
  })

  test('includes Retry-After when the response has one', () => {
    const mapped = commandError(rateLimitError('429 Too Many Requests - null', '2'), 'ORDER_FAILED')
    expect(mapped.code).toBe('RATE_LIMITED')
    expect(mapped.message).toBe(
      'Hyperliquid rate limited this request (HTTP 429). Retry after 2 seconds.',
    )
    expect(mapped.retryable).toBe(true)
  })

  test('recognizes the status line when the response object was dropped', () => {
    const err = new Error('429 Too Many Requests - null')
    expect(commandError(err, 'ASSET_NOT_FOUND')).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    })
  })

  test('treats status 429 as rate limited when statusText is empty', () => {
    const err = Object.assign(new Error('429 - null'), {
      response: { status: 429, statusText: '', headers: { get: () => '  2  ' } },
    })
    expect(isHyperliquidRateLimit(err)).toBe(true)
    expect(commandError(err, 'ASSET_NOT_FOUND').message).toContain('Retry after 2 seconds.')
  })

  test('recognizes a bare 429 status line with no status text', () => {
    expect(isHyperliquidRateLimit(new Error('429'))).toBe(true)
    expect(isHyperliquidRateLimit(new Error('429 - null'))).toBe(true)
  })

  test('leaves other failures on the caller code', () => {
    expect(commandError(new Error('Coin "NOPE" not found'), 'ASSET_NOT_FOUND')).toEqual({
      code: 'ASSET_NOT_FOUND',
      message: 'Coin "NOPE" not found',
    })
  })
})
