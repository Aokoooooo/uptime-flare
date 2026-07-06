import { describe, expect, test } from 'bun:test'
import { authorizeAdminRequest } from './basic-auth'

const secrets = {
  BASIC_AUTH_USERNAME: 'admin',
  BASIC_AUTH_PASSWORD: 'secret',
}

function request(path: string, authorization?: string) {
  return new Request(`https://status.example.com${path}`, {
    headers: authorization ? { Authorization: authorization } : undefined,
  })
}

function basic(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`
}

describe('admin Basic Auth', () => {
  test('allows public routes without credentials', () => {
    expect(authorizeAdminRequest(request('/'), {})).toBeNull()
    expect(authorizeAdminRequest(request('/api/data'), {})).toBeNull()
  })

  test('fails closed when admin secrets are missing', async () => {
    const response = authorizeAdminRequest(request('/admin/monitors'), {})

    expect(response?.status).toBe(503)
    expect(await response?.text()).toBe('Basic Auth is not configured')
  })

  test('challenges protected routes when credentials are invalid', () => {
    const response = authorizeAdminRequest(
      request('/api/admin/monitors', basic('admin', 'bad')),
      secrets
    )

    expect(response?.status).toBe(401)
    expect(response?.headers.get('WWW-Authenticate')).toBe('Basic realm="Uptime Flare Admin"')
  })

  test('allows protected routes when credentials match', () => {
    expect(
      authorizeAdminRequest(request('/admin/monitors', basic('admin', 'secret')), secrets)
    ).toBeNull()
  })
})
