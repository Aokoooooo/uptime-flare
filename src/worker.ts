import app from '@tanstack/react-start/server-entry'
import { authorizeAdminRequest } from './lib/basic-auth'
import monitorWorker, { RemoteChecker, type Env } from './monitoring'

export { RemoteChecker }

export default {
  fetch(request: Request, env: Env) {
    const authResponse = authorizeAdminRequest(request, env)
    if (authResponse) return authResponse

    return app.fetch(request)
  },

  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    return monitorWorker.scheduled(event, env, ctx)
  },
}
