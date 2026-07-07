import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { jsonResponse } from '../lib/admin-monitor-api'
import monitorWorker, { type Env } from '../monitoring'

const d1Env = env as unknown as Env

export const Route = createFileRoute('/api/admin/scheduled')({
  server: {
    handlers: {
      POST: async () => {
        await monitorWorker.scheduled(
          { scheduledTime: Date.now(), cron: '* * * * *' } as ScheduledEvent,
          d1Env,
          {
            waitUntil: (promise: Promise<unknown>) => {
              void promise
            },
            passThroughOnException: () => {},
          } as ExecutionContext
        )

        return jsonResponse({ ok: true })
      },
    },
  },
})
