import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { hasCompleteMonitorState } from '../lib/compacted-state'
import { listEnabledMonitors } from '../lib/monitor-repository'
import { readCompactedStateWrapper } from '../lib/server-data'

type BadgePayload = {
  schemaVersion: 1
  label: string
  message: string
  color: string
  isError?: boolean
}

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
}

function errorBadge(label: string, message: string): BadgePayload {
  return {
    schemaVersion: 1,
    label,
    message,
    color: 'lightgrey',
    isError: true,
  }
}

export const Route = createFileRoute('/api/badge')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const monitorId = url.searchParams.get('id')
          const label = url.searchParams.get('label') ?? monitorId ?? 'UptimeFlare'
          const upMsg = url.searchParams.get('up') ?? 'UP'
          const downMsg = url.searchParams.get('down') ?? 'DOWN'
          const colorUp = url.searchParams.get('colorUp') ?? 'brightgreen'
          const colorDown = url.searchParams.get('colorDown') ?? 'red'
          const configuredMonitors = await listEnabledMonitors(
            env as unknown as { UPTIMEFLARE_D1: D1Database }
          )
          const monitorExists = configuredMonitors.some((monitor) => monitor.id === monitorId)

          if (!monitorId) {
            return new Response(JSON.stringify(errorBadge(label, 'no-monitor')), {
              headers: jsonHeaders,
              status: 400,
            })
          }

          if (!monitorExists) {
            return new Response(JSON.stringify(errorBadge(label, 'unknown-monitor')), {
              headers: jsonHeaders,
              status: 404,
            })
          }

          const wrapper = await readCompactedStateWrapper()
          if (!hasCompleteMonitorState(wrapper, monitorId)) {
            return new Response(JSON.stringify(errorBadge(label, 'no-data')), {
              headers: jsonHeaders,
              status: 404,
            })
          }

          const incidentCount = wrapper.incidentLen(monitorId)
          const lastIncident = wrapper.getIncident(monitorId, incidentCount - 1)
          const isUp = lastIncident.end !== null

          return new Response(
            JSON.stringify({
              schemaVersion: 1,
              label,
              message: isUp ? upMsg : downMsg,
              color: isUp ? colorUp : colorDown,
            } satisfies BadgePayload),
            { headers: jsonHeaders }
          )
        } catch (err) {
          console.error('Error rendering badge API:', err)
          return new Response(JSON.stringify(errorBadge('status', 'error')), {
            headers: jsonHeaders,
            status: 500,
          })
        }
      },
    },
  },
})
