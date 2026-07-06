import { describe, expect, test } from 'bun:test'
import type { MonitorTarget } from '../../types/config'
import { checkHttpResponse, getStatus } from './monitor'

const monitor: MonitorTarget = {
  id: 'api',
  name: 'API',
  method: 'GET',
  target: 'https://example.com/api',
  expectedCodes: [200],
  expectedJson: {
    code: 0,
  },
}

describe('HTTP monitor response checks', () => {
  test('accepts JSON response when configured fields match', async () => {
    const result = await checkHttpResponse(monitor, 200, async () => '{"code":0,"data":[]}')

    expect(result).toBeNull()
  })

  test('rejects JSON response when configured fields do not match', async () => {
    const result = await checkHttpResponse(monitor, 200, async () => '{"code":500}')

    expect(result).toBe('Expected JSON field code to be 0, got 500')
  })

  test('rejects invalid JSON when JSON fields are configured', async () => {
    const result = await checkHttpResponse(monitor, 200, async () => 'OK')

    expect(result).toBe('HTTP response is not valid JSON')
  })

  test('sends configured request body for HTTP monitors', async () => {
    const originalFetch = globalThis.fetch
    let init: RequestInit | undefined
    globalThis.fetch = (async (_input: RequestInfo | URL, requestInit?: RequestInit) => {
      init = requestInit
      return new Response('ok', { status: 200 })
    }) as typeof fetch

    try {
      const result = await getStatus({
        id: 'webhook',
        name: 'Webhook',
        method: 'POST',
        target: 'https://example.com/health',
        body: '{"ping":true}',
      })

      expect(result.up).toBe(true)
      expect(init?.body).toBe('{"ping":true}')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
