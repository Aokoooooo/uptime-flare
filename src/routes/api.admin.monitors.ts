import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { jsonResponse, validateMonitorInput } from '../lib/admin-monitor-api'
import { listMonitors, upsertMonitor } from '../lib/monitor-repository'

const d1Env = env as unknown as { UPTIMEFLARE_D1: D1Database }

export const Route = createFileRoute('/api/admin/monitors')({
  server: {
    handlers: {
      GET: async () => jsonResponse({ monitors: await listMonitors(d1Env) }),
      POST: async ({ request }) => {
        const validation = validateMonitorInput(await request.json().catch(() => null))
        if (!validation.ok) return jsonResponse({ errors: validation.errors }, 400)

        const existing = await listMonitors(d1Env)
        if (existing.some((monitor) => monitor.id === validation.monitor.id)) {
          return jsonResponse({ errors: ['id already exists'] }, 409)
        }

        await upsertMonitor(d1Env, validation.monitor, existing.length)
        return jsonResponse({ monitor: validation.monitor }, 201)
      },
    },
  },
})
