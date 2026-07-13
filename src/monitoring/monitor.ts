import type { MonitorTarget } from '../../types/config'
import type { Env } from '.'
import { fetchTimeout, withTimeout } from './util'

function isIpAddress(hostname: string): boolean {
  // `URL.hostname` strips brackets for IPv6, so a `:` reliably indicates an IPv6 literal here.
  if (hostname.includes(':')) return true

  const parts = hostname.split('.')
  if (parts.length !== 4) return false

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    const value = Number(part)
    return value >= 0 && value <= 255
  })
}

function getDomainOnlyIpVersionOption(hostname: string, gpUrl: URL): { ipVersion?: number } {
  // Globalping only allows `measurementOptions.ipVersion` when `target` is a domain (it controls DNS resolution).
  if (isIpAddress(hostname)) return {}

  // Keep the original behavior for domain targets.
  return { ipVersion: Number(gpUrl.searchParams.get('ipVersion') || 4) }
}

export async function checkHttpResponse(
  monitor: MonitorTarget,
  code: number,
  bodyReader: () => Promise<string>
): Promise<string | null> {
  if (monitor.expectedCodes) {
    if (!monitor.expectedCodes.includes(code)) {
      return `Expected codes: ${JSON.stringify(monitor.expectedCodes)}, Got: ${code}`
    }
  } else {
    if (code < 200 || code > 299) {
      return `Expected codes: 2xx, Got: ${code}`
    }
  }

  if (monitor.responseKeyword || monitor.responseForbiddenKeyword || monitor.expectedJson) {
    // Only read response body if we have a body-level check.
    const responseBody = await bodyReader()

    // MUST contain responseKeyword
    if (monitor.responseKeyword && !responseBody.includes(monitor.responseKeyword)) {
      console.log(
        `${monitor.name} expected keyword ${
          monitor.responseKeyword
        }, not found in response (truncated to 100 chars): ${responseBody.slice(0, 100)}`
      )
      return "HTTP response doesn't contain the configured keyword"
    }

    // MUST NOT contain responseForbiddenKeyword
    if (
      monitor.responseForbiddenKeyword &&
      responseBody.includes(monitor.responseForbiddenKeyword)
    ) {
      console.log(
        `${monitor.name} forbidden keyword ${
          monitor.responseForbiddenKeyword
        }, found in response (truncated to 100 chars): ${responseBody.slice(0, 100)}`
      )
      return 'HTTP response contains the configured forbidden keyword'
    }

    if (monitor.expectedJson) {
      let parsed: unknown
      try {
        parsed = JSON.parse(responseBody)
      } catch {
        return 'HTTP response is not valid JSON'
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return 'HTTP response JSON is not an object'
      }

      const parsedObject = parsed as Record<string, unknown>
      for (const [key, expected] of Object.entries(monitor.expectedJson)) {
        if (parsedObject[key] !== expected) {
          return `Expected JSON field ${key} to be ${String(expected)}, got ${String(parsedObject[key])}`
        }
      }
    }
  }

  return null
}

export async function getStatusWithGlobalPing(
  monitor: MonitorTarget
): Promise<{ location: string; status: { ping: number; up: boolean; err: string } }> {
  // TODO: should throw when there's error with globalping API
  try {
    if (monitor.checkProxy === undefined) {
      throw "empty check proxy for globalping, shouldn't call this method"
    }

    const gpUrl = new URL(monitor.checkProxy)
    if (gpUrl.protocol !== 'globalping:') {
      throw `incorrect check proxy protocol for globalping, got: ${gpUrl.protocol}`
    }

    const token = gpUrl.hostname
    let globalPingRequest = {}

    if (monitor.method === 'TCP_PING') {
      const targetUrl = new URL(`https://${monitor.target}`) // dummy https:// to parse hostname & port
      const ipVersionOption = getDomainOnlyIpVersionOption(targetUrl.hostname, gpUrl)
      globalPingRequest = {
        type: 'ping',
        target: targetUrl.hostname,
        locations:
          gpUrl.searchParams.get('magic') !== null
            ? [
                {
                  magic: gpUrl.searchParams.get('magic'),
                },
              ]
            : undefined,
        measurementOptions: {
          port: targetUrl.port,
          packets: 1,
          protocol: 'tcp', // TODO: icmp?
          ...ipVersionOption,
        },
      }
    } else {
      const targetUrl = new URL(monitor.target)
      const ipVersionOption = getDomainOnlyIpVersionOption(targetUrl.hostname, gpUrl)
      if (monitor.method && !['GET', 'HEAD', 'OPTIONS'].includes(monitor.method.toUpperCase())) {
        throw 'only GET, HEAD, OPTIONS methods are supported'
      }
      globalPingRequest = {
        type: 'http',
        target: targetUrl.hostname,
        locations:
          gpUrl.searchParams.get('magic') !== null
            ? [
                {
                  magic: gpUrl.searchParams.get('magic'),
                },
              ]
            : undefined,
        measurementOptions: {
          request: {
            method: monitor.method,
            path: targetUrl.pathname,
            query: targetUrl.search === '' ? undefined : targetUrl.search,
            headers: Object.fromEntries(
              Object.entries(monitor.headers ?? {}).map(([key, value]) => [key, String(value)])
            ), // TODO: host header?
          },
          port:
            targetUrl.port === ''
              ? targetUrl.protocol === 'http:'
                ? 80
                : 443
              : Number(targetUrl.port),
          protocol: targetUrl.protocol.replace(':', ''),
          ...ipVersionOption,
        },
      }
    }

    const startTime = Date.now()
    console.log(`Requesting the Global Ping API, payload: ${JSON.stringify(globalPingRequest)}`)
    const measurement = await fetchTimeout('https://api.globalping.io/v1/measurements', 5000, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(globalPingRequest),
    })
    const measurementResponse = (await measurement.json()) as any

    if (measurement.status !== 202) {
      throw measurementResponse.error.message
    }

    const measurementId = measurementResponse.id
    console.log(
      `Measurement created successfully, id: ${measurementId}, time elapsed: ${
        Date.now() - startTime
      }ms`
    )

    const pollStart = Date.now()
    let measurementResult: any
    while (true) {
      if (Date.now() - pollStart > (monitor.timeout ?? 10000) + 2000) {
        // 2s extra buffer
        throw 'api polling timeout'
      }

      measurementResult = (await (
        await fetchTimeout(`https://api.globalping.io/v1/measurements/${measurementId}`, 5000)
      ).json()) as any
      if (measurementResult.status !== 'in-progress') {
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    console.log(
      `Measurement ${measurementId} finished with response: ${JSON.stringify(
        measurementResult
      )}, time elapsed: ${Date.now() - pollStart}ms`
    )

    if (
      measurementResult.status !== 'finished' ||
      measurementResult.results[0].result.status !== 'finished'
    ) {
      console.log(
        `measurement failed with status: ${measurementResult.status}, result status: ${measurementResult.results[0].result.status}`
      )
      // Truncate raw output to avoid huge error messages
      throw `status [${measurementResult.status}|${
        measurementResult.results[0].result.status
      }]: ${measurementResult.results?.[0].result?.rawOutput?.slice(0, 64)}`
    }

    const country = measurementResult.results[0].probe.country
    const city = measurementResult.results[0].probe.city

    if (monitor.method === 'TCP_PING') {
      const time = Math.round(measurementResult.results[0].result.stats.avg)
      return {
        location: `${country}/${city}`,
        status: {
          ping: time,
          up: true,
          err: '',
        },
      }
    } else {
      const time = measurementResult.results[0].result.timings.total
      const code = measurementResult.results[0].result.statusCode
      const body = measurementResult.results[0].result.rawBody

      let err = await checkHttpResponse(monitor, code, async () => body ?? '')
      if (err !== null) {
        console.log(`${monitor.name} didn't pass response check: ${err}`)
      }

      if (
        monitor.target.toLowerCase().startsWith('https') &&
        !measurementResult.results[0].result.tls.authorized
      ) {
        console.log(
          `${monitor.name} TLS certificate not trusted: ${measurementResult.results[0].result.tls.error}`
        )
        err = `TLS certificate not trusted: ${measurementResult.results[0].result.tls.error}`
      }

      return {
        location: `${country}/${city}`,
        status: {
          ping: time,
          up: err === null,
          err: err ?? '',
        },
      }
    }
  } catch (e: any) {
    console.log(`Globalping ${monitor.name} errored with ${e}`)
    return {
      location: 'ERROR',
      status: {
        ping: e.toString().toLowerCase().includes('timeout') ? (monitor.timeout ?? 10000) : 0,
        up: false,
        err: `Globalping error: ${e.toString()}`,
      },
    }
  }
}

type TcpSocket = {
  opened: Promise<unknown>
  close(): Promise<void>
}

type TcpConnector = (address: { hostname: string; port: number }) => TcpSocket

export async function getTcpStatus(
  monitor: MonitorTarget,
  connector?: TcpConnector
): Promise<{ ping: number; up: boolean; err: string }> {
  const status = { ping: 0, up: false, err: 'Unknown' }
  const startTime = Date.now()
  let socket: TcpSocket | undefined

  try {
    const connectSocket =
      connector ??
      ((await import(/* webpackIgnore: true */ 'cloudflare:sockets')).connect as TcpConnector)
    const parsed = new URL(`https://${monitor.target}`)
    socket = connectSocket({ hostname: parsed.hostname, port: Number(parsed.port) })

    await withTimeout(monitor.timeout || 10000, socket.opened)

    console.log(`${monitor.name} connected to ${monitor.target}`)
    status.ping = Date.now() - startTime
    status.up = true
    status.err = ''
  } catch (thrown) {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown))
    console.log(`${monitor.name} errored with ${error.name}: ${error.message}`)
    if (error.message.includes('timed out')) {
      status.ping = monitor.timeout || 10000
    }
    status.up = false
    status.err = `${error.name}: ${error.message}`
  } finally {
    try {
      await socket?.close()
    } catch (error) {
      console.log(`${monitor.name} failed to close TCP socket`, error)
    }
  }

  return status
}

export async function getStatus(
  monitor: MonitorTarget
): Promise<{ ping: number; up: boolean; err: string }> {
  if (monitor.method === 'TCP_PING') return getTcpStatus(monitor)

  const status = {
    ping: 0,
    up: false,
    err: 'Unknown',
  }

  const startTime = Date.now()

  // HTTP endpoint monitor
  try {
    const headers = new Headers(monitor.headers as any)
    if (!headers.has('user-agent')) {
      headers.set('user-agent', 'UptimeFlare/1.0 (+https://github.com/lyc8503/UptimeFlare)')
    }

    const response = await fetchTimeout(monitor.target, monitor.timeout || 10000, {
      method: monitor.method,
      headers: headers,
      body: monitor.body,
      cf: {
        cacheTtlByStatus: {
          '100-599': -1, // Don't cache any status code, from https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties
        },
      },
    })

    console.log(`${monitor.name} responded with ${response.status}`)
    status.ping = Date.now() - startTime

    const err = await checkHttpResponse(monitor, response.status, response.text.bind(response))
    try {
      await response.body?.cancel()
    } catch (_e) {} // Always try to cancel body, see issue #166

    if (err !== null) {
      console.log(`${monitor.name} didn't pass response check: ${err}`)
    }
    status.up = err === null
    status.err = err ?? ''
  } catch (e: any) {
    console.log(`${monitor.name} errored with ${e.name}: ${e.message}`)
    if (e.name === 'AbortError') {
      status.ping = monitor.timeout || 10000
      status.up = false
      status.err = `Timeout after ${status.ping}ms`
    } else {
      status.up = false
      status.err = `${e.name}: ${e.message}`
    }
  }

  return status
}

export async function doMonitor(monitor: MonitorTarget, defaultLocation: string, env: Env) {
  let checkLocation = defaultLocation
  let status

  if (monitor.checkProxy) {
    // Initiate a check using proxy (Geo-specific monitoring)
    try {
      console.log(`[${monitor.id}] Calling check proxy: ${monitor.checkProxy}`)
      let resp
      if (monitor.checkProxy.startsWith('worker://')) {
        const doLoc = monitor.checkProxy.replace('worker://', '')
        const doId = env.REMOTE_CHECKER_DO.idFromName(monitor.id)
        const doStub = env.REMOTE_CHECKER_DO.get(doId, {
          locationHint: doLoc as DurableObjectLocationHint,
        })
        resp = await doStub.getLocationAndStatus(monitor)
        try {
          // Kill the DO instance after use, to avoid extra resource usage
          await doStub.kill()
        } catch (_err) {
          // An error here is expected, ignore it
        }
      } else if (monitor.checkProxy.startsWith('globalping://')) {
        resp = await getStatusWithGlobalPing(monitor)
      } else {
        resp = await (
          await fetch(monitor.checkProxy, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(monitor),
          })
        ).json<{ location: string; status: { ping: number; up: boolean; err: string } }>()
      }
      checkLocation = resp.location
      status = resp.status
    } catch (err) {
      console.log(`[${monitor.id}] Error calling proxy: ${err}`)
      if (monitor.checkProxyFallback) {
        console.log('Falling back to local check...')
        status = await getStatus(monitor)
      } else {
        // TODO: more consistent error handling (throw or return?)
        status = { ping: 0, up: false, err: 'Unknown check proxy error' }
      }
    }
  } else {
    // Initiate a check from the current location
    status = await getStatus(monitor)
  }

  console.log(
    `[${monitor.id}] Check result from ${checkLocation}: up=${status.up}, ping=${status.ping}, err=${status.err}`
  )

  return {
    location: checkLocation,
    status,
    id: monitor.id,
  }
}
