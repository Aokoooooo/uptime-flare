import type { MonitorTarget } from '../../types/config'

type ValidationResult = { ok: true; monitor: MonitorTarget } | { ok: false; errors: string[] }

const optionalBooleanKeys = ['enabled', 'checkProxyFallback'] as const
const optionalStringKeys = [
  'statusPageLink',
  'responseKeyword',
  'responseForbiddenKeyword',
  'checkProxy',
  'body',
] as const
const monitorMethods = ['GET', 'POST', 'HEAD', 'OPTIONS', 'TCP_PING'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function validTcpTarget(value: string): boolean {
  const match = /^([^:]+):(\d+)$/.exec(value)
  if (!match) return false
  const port = Number(match[2])
  return port > 0 && port <= 65535
}

function hasOnlyStringOrNumberValues(value: Record<string, unknown>): boolean {
  return Object.values(value).every((item) => typeof item === 'string' || typeof item === 'number')
}

function hasOnlyJsonScalarValues(value: Record<string, unknown>): boolean {
  return Object.values(value).every(
    (item) =>
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      item === null
  )
}

export function validateMonitorInput(input: unknown): ValidationResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ['payload must be an object'] }

  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const method = typeof input.method === 'string' ? input.method.trim().toUpperCase() : ''
  const target = typeof input.target === 'string' ? input.target.trim() : ''

  if (!id) errors.push('id is required')
  if (id && !/^[A-Za-z0-9_-]+$/.test(id)) {
    errors.push('id must contain only letters, numbers, underscores, and hyphens')
  }
  if (!name) errors.push('name is required')
  if (!method) errors.push('method is required')
  if (method && !(monitorMethods as readonly string[]).includes(method)) {
    errors.push('method must be one of GET, POST, HEAD, OPTIONS, TCP_PING')
  }
  if (!target) errors.push('target is required')

  if (target) {
    if (method === 'TCP_PING') {
      if (!validTcpTarget(target)) errors.push('target must be host:port for TCP_PING')
    } else if (!validHttpUrl(target)) {
      errors.push('target must be an http(s) URL')
    }
  }

  const monitor: MonitorTarget = { id, name, method, target }

  for (const key of optionalStringKeys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim() !== '') {
      monitor[key] = value
    }
  }

  for (const key of optionalBooleanKeys) {
    const value = input[key]
    if (typeof value === 'boolean') {
      monitor[key] = value
    }
  }

  if (input.timeout !== undefined) {
    if (
      typeof input.timeout !== 'number' ||
      !Number.isFinite(input.timeout) ||
      input.timeout <= 0
    ) {
      errors.push('timeout must be a positive number')
    } else {
      monitor.timeout = input.timeout
    }
  }

  if (input.expectedCodes !== undefined) {
    if (
      !Array.isArray(input.expectedCodes) ||
      input.expectedCodes.some((item) => typeof item !== 'number')
    ) {
      errors.push('expectedCodes must be an array of numbers')
    } else if (
      input.expectedCodes.some(
        (item) => !Number.isInteger(item) || item < 100 || item > 599
      )
    ) {
      errors.push('expectedCodes must contain HTTP status codes between 100 and 599')
    } else {
      monitor.expectedCodes = input.expectedCodes
    }
  }

  if (input.headers !== undefined) {
    if (!isRecord(input.headers)) {
      errors.push('headers must be an object')
    } else if (!hasOnlyStringOrNumberValues(input.headers)) {
      errors.push('headers values must be strings or numbers')
    } else {
      monitor.headers = input.headers as Record<string, string | number>
    }
  }

  if (input.expectedJson !== undefined) {
    if (!isRecord(input.expectedJson)) {
      errors.push('expectedJson must be an object')
    } else if (!hasOnlyJsonScalarValues(input.expectedJson)) {
      errors.push('expectedJson values must be strings, numbers, booleans, or null')
    } else {
      monitor.expectedJson = input.expectedJson as Record<string, string | number | boolean | null>
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, monitor }
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function monitorsToJson(monitors: MonitorTarget[]): string {
  return JSON.stringify(monitors, null, 2)
}

export function parseMonitorsJson(
  json: string
): { ok: true; monitors: MonitorTarget[] } | { ok: false; errors: string[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, errors: ['JSON 格式无效'] }
  }

  return parseMonitorsValue(parsed)
}

export function parseMonitorsValue(
  value: unknown
): { ok: true; monitors: MonitorTarget[] } | { ok: false; errors: string[] } {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['JSON 必须是监控项数组'] }
  }

  const monitors: MonitorTarget[] = []
  const errors: string[] = []
  const seenIds = new Map<string, number>()

  value.forEach((item, index) => {
    const validation = validateMonitorInput(item)
    if (validation.ok) {
      const firstIndex = seenIds.get(validation.monitor.id)
      if (firstIndex !== undefined) {
        errors.push(`第 ${index + 1} 项：id 与第 ${firstIndex + 1} 项重复`)
        return
      }
      seenIds.set(validation.monitor.id, index)
      monitors.push(validation.monitor)
    } else {
      errors.push(`第 ${index + 1} 项：${validation.errors.join('；')}`)
    }
  })

  return errors.length > 0 ? { ok: false, errors } : { ok: true, monitors }
}

export function validateReorderIds(
  currentIds: string[],
  nextIds: string[]
): { ok: true } | { ok: false; errors: string[] } {
  if (currentIds.length !== nextIds.length) {
    return { ok: false, errors: ['ids must include each existing monitor exactly once'] }
  }

  const current = new Set(currentIds)
  const next = new Set(nextIds)
  if (current.size !== currentIds.length || next.size !== nextIds.length) {
    return { ok: false, errors: ['ids must include each existing monitor exactly once'] }
  }

  for (const id of current) {
    if (!next.has(id)) {
      return { ok: false, errors: ['ids must include each existing monitor exactly once'] }
    }
  }

  return { ok: true }
}
