import { DurableObject } from 'cloudflare:workers'
import type { MonitorTarget } from '../../types/config'
import { workerConfig } from '../../uptime.config'
import { listEnabledMonitors } from '../lib/monitor-repository'
import { runCheckQueue } from './check-queue'
import { doMonitor, getStatus } from './monitor'
import { CompactedMonitorStateWrapper, getFromStore, setToStore } from './store'
import { formatAndNotify, getWorkerLocation } from './util'

export interface Env {
  REMOTE_CHECKER_DO: DurableObjectNamespace<RemoteChecker>
  UPTIMEFLARE_D1: D1Database
  FEISHU_WEBHOOK_URL?: string
  BASIC_AUTH_USERNAME?: string
  BASIC_AUTH_PASSWORD?: string
}

const Worker = {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const workerLocation = (await getWorkerLocation()) || 'ERROR'
    console.log(`Running scheduled event on ${workerLocation}...`)

    const state = new CompactedMonitorStateWrapper(await getFromStore(env, 'state'))
    state.data.overallDown = 0
    state.data.overallUp = 0

    const currentTimeSecond = Math.round(Date.now() / 1000)
    const monitors = await listEnabledMonitors(env)
    const checkResult = await runMonitorChecks(monitors, workerLocation, env)
    const statusChanged = await applyCheckResults(
      state,
      monitors,
      checkResult,
      currentTimeSecond,
      env
    )

    await persistStateIfNeeded(state, statusChanged, currentTimeSecond, env)
  },
}

type CheckResult = {
  id: string
  location: string
  status: { ping: number; up: boolean; err: string }
}

async function runMonitorChecks(
  monitors: MonitorTarget[],
  workerLocation: string,
  env: Env
): Promise<Record<string, CheckResult>> {
  // Max concurrent connection is 6 limited by Cloudflare Workers, we use 5 here to be safe.
  const results = await runCheckQueue(
    monitors,
    (monitor) => doMonitor(monitor, workerLocation, env),
    (result) => result.status.up,
    (monitor, error): CheckResult => ({
      id: monitor.id,
      location: workerLocation,
      status: {
        ping: 0,
        up: false,
        err: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
    })
  )
  return Object.fromEntries(results.map((result) => [result.id, result]))
}

async function applyCheckResults(
  state: CompactedMonitorStateWrapper,
  monitors: MonitorTarget[],
  checkResult: Record<string, CheckResult>,
  currentTimeSecond: number,
  env: Env
): Promise<boolean> {
  let statusChanged = false

  for (const monitor of monitors) {
    console.log(`Processing monitor result: ${monitor.name} (${monitor.id})`)

    const { location: checkLocation, status } = checkResult[monitor.id]
    status.up ? state.data.overallUp++ : state.data.overallDown++

    const monitorStatusChanged = await applyMonitorStatus(
      state,
      monitor,
      status,
      currentTimeSecond,
      env
    )

    state.appendLatency(monitor.id, {
      loc: checkLocation,
      ping: status.ping,
      time: currentTimeSecond,
    })
    pruneMonitorState(state, monitor.id, currentTimeSecond)

    statusChanged ||= monitorStatusChanged
  }

  return statusChanged
}

async function applyMonitorStatus(
  state: CompactedMonitorStateWrapper,
  monitor: MonitorTarget,
  status: { ping: number; up: boolean; err: string },
  currentTimeSecond: number,
  env: Env
): Promise<boolean> {
  if (state.incidentLen(monitor.id) === 0) {
    state.appendIncident(monitor.id, {
      start: [currentTimeSecond],
      end: currentTimeSecond,
      error: ['dummy'],
    })
  }

  const lastIncident = state.getIncident(monitor.id, state.incidentLen(monitor.id) - 1)
  let monitorStatusChanged = false

  if (status.up) {
    if (lastIncident.end === null) {
      lastIncident.end = currentTimeSecond
      state.setIncident(monitor.id, state.incidentLen(monitor.id) - 1, lastIncident)
      monitorStatusChanged = true

      try {
        if (
          workerConfig.notification?.gracePeriod === undefined ||
          currentTimeSecond - lastIncident.start[0] >=
            (workerConfig.notification.gracePeriod + 1) * 60 - 30
        ) {
          await formatAndNotify(env, monitor, true, lastIncident.start[0], currentTimeSecond, 'OK')
        } else {
          console.log(
            `grace period (${workerConfig.notification?.gracePeriod}m) not met, skipping webhook UP notification for ${monitor.name}`
          )
        }

        console.log('Calling config onStatusChange callback...')
        await workerConfig.callbacks?.onStatusChange?.(
          env,
          monitor,
          true,
          lastIncident.start[0],
          currentTimeSecond,
          'OK'
        )
      } catch (e) {
        console.log('Error calling callback: ')
        console.log(e)
      }
    }
    return monitorStatusChanged
  }

  if (lastIncident.end !== null) {
    state.appendIncident(monitor.id, {
      start: [currentTimeSecond],
      end: null,
      error: [status.err],
    })
    monitorStatusChanged = true
  } else if (lastIncident.error.slice(-1)[0] !== status.err) {
    lastIncident.start.push(currentTimeSecond)
    lastIncident.error.push(status.err)
    state.setIncident(monitor.id, state.incidentLen(monitor.id) - 1, lastIncident)
    monitorStatusChanged = true
  }

  const currentIncident = state.getIncident(monitor.id, state.incidentLen(monitor.id) - 1)
  try {
    if (shouldSendDownNotification(monitorStatusChanged, currentIncident.start[0], currentTimeSecond)) {
      if (
        currentIncident.start[0] !== currentTimeSecond &&
        workerConfig.notification?.skipErrorChangeNotification
      ) {
        console.log('Skipping notification for following error reason change due to user config')
      } else {
        await formatAndNotify(
          env,
          monitor,
          false,
          currentIncident.start[0],
          currentTimeSecond,
          status.err
        )
      }
    } else {
      console.log(
        `Grace period (${workerConfig.notification?.gracePeriod}m) not met or no change (currently down for ${
          currentTimeSecond - currentIncident.start[0]
        }s, changed ${monitorStatusChanged}), skipping webhook DOWN notification for ${monitor.name}`
      )
    }

    if (monitorStatusChanged) {
      console.log('Calling config onStatusChange callback...')
      await workerConfig.callbacks?.onStatusChange?.(
        env,
        monitor,
        false,
        currentIncident.start[0],
        currentTimeSecond,
        status.err
      )
    }
  } catch (e) {
    console.log('Error calling callback: ')
    console.log(e)
  }

  try {
    console.log('Calling config onIncident callback...')
    await workerConfig.callbacks?.onIncident?.(
      env,
      monitor,
      currentIncident.start[0],
      currentTimeSecond,
      status.err
    )
  } catch (e) {
    console.log('Error calling callback: ')
    console.log(e)
  }

  return monitorStatusChanged
}

function shouldSendDownNotification(
  monitorStatusChanged: boolean,
  incidentStart: number,
  currentTimeSecond: number
): boolean {
  return (
    (monitorStatusChanged &&
      (workerConfig.notification?.gracePeriod === undefined ||
        currentTimeSecond - incidentStart >=
          (workerConfig.notification.gracePeriod + 1) * 60 - 30)) ||
    (workerConfig.notification?.gracePeriod !== undefined &&
      currentTimeSecond - incidentStart >= workerConfig.notification.gracePeriod * 60 - 30 &&
      currentTimeSecond - incidentStart < workerConfig.notification.gracePeriod * 60 + 30)
  )
}

function pruneMonitorState(
  state: CompactedMonitorStateWrapper,
  monitorId: string,
  currentTimeSecond: number
) {
  while (state.getFirstLatency(monitorId).time < currentTimeSecond - 12 * 60 * 60) {
    state.unshiftLatency(monitorId)
  }

  while (
    state.incidentLen(monitorId) > 0 &&
    state.getIncident(monitorId, 0).end &&
    state.getIncident(monitorId, 0).end! < currentTimeSecond - 90 * 24 * 60 * 60
  ) {
    state.shiftIncident(monitorId)
  }

  if (
    state.incidentLen(monitorId) === 0 ||
    (state.getIncident(monitorId, 0).start[0] > currentTimeSecond - 90 * 24 * 60 * 60 &&
      state.getIncident(monitorId, 0).error[0] != 'dummy')
  ) {
    state.unshiftIncident(monitorId, {
      start: [currentTimeSecond - 90 * 24 * 60 * 60],
      end: currentTimeSecond - 90 * 24 * 60 * 60,
      error: ['dummy'],
    })
  }
}

async function persistStateIfNeeded(
  state: CompactedMonitorStateWrapper,
  statusChanged: boolean,
  currentTimeSecond: number,
  env: Env
) {
  console.log(
    `statusChanged: ${statusChanged}, lastUpdate: ${state.data.lastUpdate}, currentTime: ${currentTimeSecond}`
  )
  if (
    statusChanged ||
    currentTimeSecond - state.data.lastUpdate >=
      (workerConfig.stateWriteCooldownMinutes ?? 3) * 60 - 10
  ) {
    console.log('Updating state...')
    state.data.lastUpdate = currentTimeSecond
    await setToStore(env, 'state', state.getCompactedStateStr())
  } else {
    console.log('Skipping state update due to cooldown period.')
  }
}

export default Worker

export class RemoteChecker extends DurableObject {
  async getLocationAndStatus(
    monitor: MonitorTarget
  ): Promise<{ location: string; status: { ping: number; up: boolean; err: string } }> {
    const colo = (await getWorkerLocation()) as string
    console.log(`Running remote checker (DurableObject) at ${colo}...`)
    const status = await getStatus(monitor)
    return {
      location: colo,
      status: status,
    }
  }

  async kill() {
    // Throwing an error in `blockConcurrencyWhile` will terminate the Durable Object instance
    // https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile
    this.ctx.blockConcurrencyWhile(async () => {
      throw 'killed'
    })
  }
}
