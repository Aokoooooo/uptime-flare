import { describe, expect, test } from 'bun:test'
import type { MonitorTarget } from '../../types/config'
import { checkHttpResponse, getStatus, getTcpStatus } from './monitor'

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

describe('TCP socket cleanup', () => {
  const tcpMonitor: MonitorTarget = {
    id: 'tcp',
    name: 'TCP',
    method: 'TCP_PING',
    target: 'example.com:443',
    timeout: 1,
  }

  test('closes the socket after a successful connection', async () => {
    let closes = 0
    const result = await getTcpStatus(tcpMonitor, () => ({
      opened: Promise.resolve({}),
      close: async () => {
        closes++
      },
    }))

    expect(result.up).toBe(true)
    expect(closes).toBe(1)
  })

  test('closes the socket after the connection rejects', async () => {
    let closes = 0
    const result = await getTcpStatus(tcpMonitor, () => ({
      opened: Promise.reject(new Error('connection refused')),
      close: async () => {
        closes++
      },
    }))

    expect(result.up).toBe(false)
    expect(result.err).toContain('connection refused')
    expect(closes).toBe(1)
  })

  test('closes the socket after a timeout', async () => {
    let closes = 0
    const result = await getTcpStatus(tcpMonitor, () => ({
      opened: new Promise(() => {}),
      close: async () => {
        closes++
      },
    }))

    expect(result.up).toBe(false)
    expect(result.ping).toBe(1)
    expect(closes).toBe(1)
  })

  test('keeps the check result when closing the socket rejects', async () => {
    const result = await getTcpStatus(tcpMonitor, () => ({
      opened: Promise.resolve({}),
      close: async () => {
        throw new Error('close failed')
      },
    }))

    expect(result.up).toBe(true)
    expect(result.err).toBe('')
  })
})
