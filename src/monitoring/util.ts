import type { MonitorTarget, SingleWebhook, WebhookConfig } from '../../types/config'
import { maintenances, workerConfig } from '../../uptime.config'
import { isMaintenanceActive } from '../lib/status'
import type { Env } from './index'

type NotificationEnv = Pick<Partial<Env>, 'FEISHU_WEBHOOK_URL'>

async function getWorkerLocation() {
  const res = await fetch('https://cloudflare.com/cdn-cgi/trace')
  const text = await res.text()

  const colo = /^colo=(.*)$/m.exec(text)?.[1]
  return colo
}

const fetchTimeout = (
  url: string,
  ms: number,
  { signal, ...options }: RequestInit<RequestInitCfProperties> | undefined = {}
): Promise<Response> => {
  const controller = new AbortController()
  const promise = fetch(url, { signal: controller.signal, ...options })
  if (signal) signal.addEventListener('abort', () => controller.abort())
  const timeout = setTimeout(() => controller.abort(), ms)
  return promise.finally(() => clearTimeout(timeout))
}

function withTimeout<T>(millis: number, promise: Promise<T>): Promise<T> {
  const timeout = new Promise<T>((_resolve, reject) =>
    setTimeout(() => reject(new Error(`Promise timed out after ${millis}ms`)), millis)
  )

  return Promise.race([promise, timeout])
}

function formatStatusChangeNotification(
  monitor: any,
  isUp: boolean,
  timeIncidentStart: number,
  timeNow: number,
  reason: string,
  timeZone: string
) {
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timeZone,
  })

  const downtimeDuration = Math.round((timeNow - timeIncidentStart) / 60)
  const timeNowFormatted = dateFormatter.format(new Date(timeNow * 1000))
  const timeIncidentStartFormatted = dateFormatter.format(new Date(timeIncidentStart * 1000))

  if (isUp) {
    return `✅ ${monitor.name} is up! \nThe service is up again after being down for ${downtimeDuration} minutes.`
  } else if (timeNow == timeIncidentStart) {
    return `🔴 ${
      monitor.name
    } is currently down. \nService is unavailable at ${timeNowFormatted}. \nIssue: ${
      reason || 'unspecified'
    }`
  } else {
    return `🔴 ${
      monitor.name
    } is still down. \nService is unavailable since ${timeIncidentStartFormatted} (${downtimeDuration} minutes). \nIssue: ${
      reason || 'unspecified'
    }`
  }
}

function templateWebhookPlayload(payload: any, message: string) {
  for (const key in payload) {
    if (Object.hasOwn(payload, key)) {
      if (payload[key] === '$MSG') {
        payload[key] = message
      } else if (typeof payload[key] === 'object' && payload[key] !== null) {
        templateWebhookPlayload(payload[key], message)
      }
    }
  }
}

function redactWebhookUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}/***`
  } catch {
    return '***'
  }
}

async function webhookNotify(webhook: WebhookConfig, message: string) {
  if (Array.isArray(webhook)) {
    for (const w of webhook) {
      await webhookNotify(w, message)
    }
    return
  }

  console.log(
    'Sending webhook notification: ' +
      JSON.stringify(message) +
      ' to webhook ' +
      redactWebhookUrl(webhook.url)
  )
  try {
    let url = webhook.url
    let method = webhook.method
    const headers = new Headers(webhook.headers as any)
    const payloadTemplated: { [key: string]: string | number } = JSON.parse(
      JSON.stringify(webhook.payload)
    )
    templateWebhookPlayload(payloadTemplated, message)
    let body

    switch (webhook.payloadType) {
      case 'param':
        method = method ?? 'GET'
        const urlTmp = new URL(url)
        for (const [k, v] of Object.entries(payloadTemplated)) {
          urlTmp.searchParams.append(k, v.toString())
        }
        url = urlTmp.toString()
        break
      case 'json':
        method = method ?? 'POST'
        if (headers.get('content-type') === null) {
          headers.set('content-type', 'application/json')
        }
        body = JSON.stringify(payloadTemplated)
        break
      case 'x-www-form-urlencoded':
        method = method ?? 'POST'
        if (headers.get('content-type') === null) {
          headers.set('content-type', 'application/x-www-form-urlencoded')
        }
        body = new URLSearchParams(payloadTemplated as any).toString()
        break
      default:
        throw `Unrecognized payload type: ${webhook.payloadType}`
    }

    console.log(
      `Webhook finalized parameters: ${method} ${redactWebhookUrl(url)}, headers ${JSON.stringify(
        Object.fromEntries(headers.entries())
      )}, body ${JSON.stringify(body)}`
    )
    const resp = await fetchTimeout(url, webhook.timeout ?? 5000, { method, headers, body })

    if (!resp.ok) {
      console.log(
        `Error calling webhook server, code: ${resp.status}, response: ${await resp.text()}`
      )
    } else {
      console.log(`Webhook notification sent successfully, code: ${resp.status}`)
    }
  } catch (e) {
    console.log(`Error calling webhook server: ${e}`)
  }
}

function getNotificationWebhooks(
  env: NotificationEnv,
  configuredWebhook: WebhookConfig | undefined = workerConfig.notification?.webhook
): SingleWebhook[] {
  const webhooks: SingleWebhook[] = []

  if (configuredWebhook) {
    webhooks.push(...(Array.isArray(configuredWebhook) ? configuredWebhook : [configuredWebhook]))
  }

  if (env.FEISHU_WEBHOOK_URL) {
    webhooks.push({
      url: env.FEISHU_WEBHOOK_URL,
      method: 'POST',
      payloadType: 'json',
      payload: {
        msg_type: 'text',
        content: {
          text: '$MSG',
        },
      },
    })
  }

  return webhooks
}

// Auxiliary function to format notification and send it via webhook
const formatAndNotify = async (
  env: NotificationEnv,
  monitor: MonitorTarget,
  isUp: boolean,
  timeIncidentStart: number,
  timeNow: number,
  reason: string
) => {
  // Skip notification if monitor is in the skip list
  const skipList = workerConfig.notification?.skipNotificationIds
  if (skipList?.includes(monitor.id)) {
    console.log(`Skipping notification for ${monitor.name} (${monitor.id} in skipNotificationIds)`)
    return
  }

  // Skip notification if monitor is in maintenance
  const maintenanceList = maintenances
    .filter((m) => isMaintenanceActive(m, new Date(timeNow * 1000)))
    .flatMap((e) => e.monitors || [])

  if (maintenanceList.includes(monitor.id)) {
    console.log(`Skipping notification for ${monitor.name} (in maintenance)`)
    return
  }

  const webhooks = getNotificationWebhooks(env)
  if (webhooks.length > 0) {
    const notification = formatStatusChangeNotification(
      monitor,
      isUp,
      timeIncidentStart,
      timeNow,
      reason,
      workerConfig.notification?.timeZone ?? 'Etc/GMT'
    )
    await webhookNotify(webhooks, notification)
  } else {
    console.log(`Webhook not set, skipping notification for ${monitor.name}`)
  }
}

export {
  getWorkerLocation,
  fetchTimeout,
  withTimeout,
  webhookNotify,
  redactWebhookUrl,
  getNotificationWebhooks,
  formatStatusChangeNotification,
  formatAndNotify,
}
