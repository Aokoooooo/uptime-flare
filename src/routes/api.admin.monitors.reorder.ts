import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { jsonResponse, validateReorderIds } from '../lib/admin-monitor-api'
import { listMonitors, reorderMonitors } from '../lib/monitor-repository'

const d1Env = env as unknown as { UPTIMEFLARE_D1: D1Database }

export const Route = createFileRoute('/api/admin/monitors/reorder')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body || typeof body !== 'object' || !Array.isArray((body as { ids?: unknown }).ids)) {
          return jsonResponse({ errors: ['ids must be an array'] }, 400)
        }

        const ids = (body as { ids: unknown[] }).ids
        if (ids.some((id) => typeof id !== 'string')) {
          return jsonResponse({ errors: ['ids must be an array of strings'] }, 400)
        }

        const monitors = await listMonitors(d1Env)
        const validation = validateReorderIds(
          monitors.map((monitor) => monitor.id),
          ids as string[]
        )
        if (!validation.ok) return jsonResponse({ errors: validation.errors }, 400)

        await reorderMonitors(d1Env, ids as string[])
        return jsonResponse({ ok: true })
      },
    },
  },
})
