import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { jsonResponse, parseMonitorsValue } from '../lib/admin-monitor-api'
import { importMonitors } from '../lib/monitor-repository'

const d1Env = env as unknown as { UPTIMEFLARE_D1: D1Database }

export const Route = createFileRoute('/api/admin/monitors/import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        const validation = parseMonitorsValue(body)
        if (!validation.ok) return jsonResponse({ errors: validation.errors }, 400)

        await importMonitors(d1Env, validation.monitors)
        return jsonResponse({ monitors: validation.monitors })
      },
    },
  },
})
