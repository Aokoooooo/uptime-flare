import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { maintenances } from '../../uptime.config'
import { buildStatusApiMonitors, buildStatusApiSummary } from '../lib/api-status'
import { listEnabledMonitors } from '../lib/monitor-repository'
import { readCompactedStateWrapper } from '../lib/server-data'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const Route = createFileRoute('/api/data')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers }),
      GET: async () => {
        const wrapper = await readCompactedStateWrapper()
        const { data: compactedState } = wrapper

        if (compactedState.lastUpdate === 0) {
          return new Response(JSON.stringify({ error: '暂无数据' }), {
            status: 500,
            headers,
          })
        }

        const configuredMonitors = await listEnabledMonitors(
          env as unknown as { UPTIMEFLARE_D1: D1Database }
        )
        const monitors = buildStatusApiMonitors(wrapper, configuredMonitors)
        const summary = buildStatusApiSummary(wrapper, configuredMonitors)

        return new Response(
          JSON.stringify({
            up: summary.up,
            down: summary.down,
            updatedAt: compactedState.lastUpdate,
            monitors,
            maintenances,
          }),
          { headers }
        )
      },
    },
  },
})
