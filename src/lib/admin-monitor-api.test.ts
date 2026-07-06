import { describe, expect, test } from 'bun:test'
import {
  monitorsToJson,
  parseMonitorsJson,
  parseMonitorsValue,
  validateMonitorInput,
  validateReorderIds,
} from './admin-monitor-api'

describe('admin monitor validation', () => {
  test('accepts a valid HTTP monitor payload', () => {
    expect(
      validateMonitorInput({
        id: 'api',
        name: 'API',
        method: 'GET',
        target: 'https://example.com/health',
        expectedCodes: [200],
        expectedJson: { code: 0 },
        enabled: true,
      })
    ).toEqual({
      ok: true,
      monitor: {
        id: 'api',
        name: 'API',
        method: 'GET',
        target: 'https://example.com/health',
        expectedCodes: [200],
        expectedJson: { code: 0 },
        enabled: true,
      },
    })
  })

  test('accepts request body for HTTP monitors', () => {
    expect(
      validateMonitorInput({
        id: 'webhook',
        name: 'Webhook',
        method: 'POST',
        target: 'https://example.com/health',
        body: '{"ping":true}',
      })
    ).toEqual({
      ok: true,
      monitor: {
        id: 'webhook',
        name: 'Webhook',
        method: 'POST',
        target: 'https://example.com/health',
        body: '{"ping":true}',
      },
    })
  })

  test('rejects invalid HTTP target and malformed expected codes', () => {
    expect(
      validateMonitorInput({
        id: 'bad api',
        name: '',
        method: 'GET',
        target: 'example.com',
        expectedCodes: ['200'],
      })
    ).toEqual({
      ok: false,
      errors: [
        'id must contain only letters, numbers, underscores, and hyphens',
        'name is required',
        'target must be an http(s) URL',
        'expectedCodes must be an array of numbers',
      ],
    })
  })

  test('rejects unsupported methods and out-of-range status codes', () => {
    expect(
      validateMonitorInput({
        id: 'api',
        name: 'API',
        method: 'TRACE',
        target: 'https://example.com',
        expectedCodes: [99, 200, 600],
      })
    ).toEqual({
      ok: false,
      errors: [
        'method must be one of GET, POST, HEAD, OPTIONS, TCP_PING',
        'expectedCodes must contain HTTP status codes between 100 and 599',
      ],
    })
  })

  test('rejects invalid headers and expected JSON leaf values', () => {
    expect(
      validateMonitorInput({
        id: 'api',
        name: 'API',
        method: 'GET',
        target: 'https://example.com',
        headers: {
          ok: 'yes',
          nested: { bad: true },
        },
        expectedJson: {
          code: 0,
          nested: { bad: true },
        },
      })
    ).toEqual({
      ok: false,
      errors: [
        'headers values must be strings or numbers',
        'expectedJson values must be strings, numbers, booleans, or null',
      ],
    })
  })

  test('accepts TCP target host and port', () => {
    expect(
      validateMonitorInput({
        id: 'db',
        name: 'Database',
        method: 'TCP_PING',
        target: 'db.example.com:5432',
      })
    ).toEqual({
      ok: true,
      monitor: {
        id: 'db',
        name: 'Database',
        method: 'TCP_PING',
        target: 'db.example.com:5432',
      },
    })
  })

  test('imports and exports monitor JSON arrays', () => {
    const json = monitorsToJson([
      {
        id: 'api',
        name: 'API',
        method: 'GET',
        target: 'https://example.com',
        enabled: false,
      },
    ])

    expect(parseMonitorsJson(json)).toEqual({
      ok: true,
      monitors: [
        {
          id: 'api',
          name: 'API',
          method: 'GET',
          target: 'https://example.com',
          enabled: false,
        },
      ],
    })
  })

  test('parses monitor arrays from an already decoded API body', () => {
    expect(
      parseMonitorsValue([
        {
          id: 'api',
          name: 'API',
          method: 'GET',
          target: 'https://example.com',
        },
      ])
    ).toEqual({
      ok: true,
      monitors: [
        {
          id: 'api',
          name: 'API',
          method: 'GET',
          target: 'https://example.com',
        },
      ],
    })
  })

  test('rejects duplicate monitor ids during JSON import', () => {
    const json = JSON.stringify([
      { id: 'api', name: 'API', method: 'GET', target: 'https://example.com' },
      { id: 'api', name: 'API copy', method: 'GET', target: 'https://example.com/copy' },
    ])

    expect(parseMonitorsJson(json)).toEqual({
      ok: false,
      errors: ['第 2 项：id 与第 1 项重复'],
    })
  })

  test('requires reorder ids to match current monitors exactly once', () => {
    expect(validateReorderIds(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual({ ok: true })
    expect(validateReorderIds(['a', 'b', 'c'], ['a', 'a', 'b'])).toEqual({
      ok: false,
      errors: ['ids must include each existing monitor exactly once'],
    })
    expect(validateReorderIds(['a', 'b', 'c'], ['a', 'b'])).toEqual({
      ok: false,
      errors: ['ids must include each existing monitor exactly once'],
    })
    expect(validateReorderIds(['a', 'b', 'c'], ['a', 'b', 'x'])).toEqual({
      ok: false,
      errors: ['ids must include each existing monitor exactly once'],
    })
  })
})
