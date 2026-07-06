import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { jsonResponse, validateMonitorInput } from '../lib/admin-monitor-api'
import { deleteMonitor, getMonitor, upsertMonitor } from '../lib/monitor-repository'
import { CompactedMonitorStateWrapper, getFromStore, setToStore } from '../monitoring/store'

const d1Env = env as unknown as { UPTIMEFLARE_D1: D1Database }

export const Route = createFileRoute('/api/admin/monitors/$id')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const body = await request.json().catch(() => null)
        const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
        const validation = validateMonitorInput({ ...payload, id: params.id })
        if (!validation.ok) return jsonResponse({ errors: validation.errors }, 400)
        if (!(await getMonitor(d1Env, params.id)))
          return jsonResponse({ errors: ['monitor not found'] }, 404)

        await upsertMonitor(d1Env, validation.monitor)
        return jsonResponse({ monitor: validation.monitor })
      },
      DELETE: async ({ params }) => {
        if (!(await deleteMonitor(d1Env, params.id)))
          return jsonResponse({ errors: ['monitor not found'] }, 404)
        const state = new CompactedMonitorStateWrapper(await getFromStore(d1Env, 'state'))
        state.deleteMonitorState(params.id)
        await setToStore(d1Env, 'state', state.getCompactedStateStr())
        return jsonResponse({ ok: true })
      },
    },
  },
})
