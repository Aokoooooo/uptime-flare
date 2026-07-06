type BasicAuthEnv = {
  BASIC_AUTH_USERNAME?: string
  BASIC_AUTH_PASSWORD?: string
}

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/')
  )
}

function challenge(): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Uptime Flare Admin"',
    },
  })
}

function parseBasicAuth(header: string | null): { username: string; password: string } | null {
  if (!header?.startsWith('Basic ')) return null

  try {
    const decoded = atob(header.slice('Basic '.length))
    const separator = decoded.indexOf(':')
    if (separator === -1) return null

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    }
  } catch {
    return null
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false

  let mismatch = 0
  for (let index = 0; index < left.length; index++) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

export function authorizeAdminRequest(request: Request, env: BasicAuthEnv): Response | null {
  const url = new URL(request.url)
  if (!isProtectedPath(url.pathname)) return null

  if (!env.BASIC_AUTH_USERNAME || !env.BASIC_AUTH_PASSWORD) {
    return new Response('Basic Auth is not configured', { status: 503 })
  }

  const credentials = parseBasicAuth(request.headers.get('Authorization'))
  if (!credentials) return challenge()

  const valid =
    constantTimeEqual(credentials.username, env.BASIC_AUTH_USERNAME) &&
    constantTimeEqual(credentials.password, env.BASIC_AUTH_PASSWORD)

  return valid ? null : challenge()
}
