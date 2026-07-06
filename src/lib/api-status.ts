import type { CompactedMonitorStateWrapper } from '../monitoring/store'
import { hasCompleteMonitorState } from './compacted-state'
import type { PublicMonitor } from './status'

export type StatusApiMonitor = {
  up: boolean
  latency: number | null
  location: string
  message: string
}

export function buildStatusApiMonitors(
  wrapper: CompactedMonitorStateWrapper,
  monitors: PublicMonitor[]
): Record<string, StatusApiMonitor> {
  const payload: Record<string, StatusApiMonitor> = {}

  for (const monitor of monitors) {
    if (!hasCompleteMonitorState(wrapper, monitor.id)) {
      payload[monitor.id] = {
        up: false,
        latency: null,
        location: '',
        message: '暂无数据',
      }
      continue
    }

    const incidentCount = wrapper.incidentLen(monitor.id)
    const lastIncident = wrapper.getIncident(monitor.id, incidentCount - 1)
    const latency = wrapper.getLastLatency(monitor.id)
    const isUp = lastIncident.end !== null
    payload[monitor.id] = {
      up: isUp,
      latency: latency.ping,
      location: latency.loc,
      message: isUp ? 'OK' : lastIncident.error[lastIncident.error.length - 1],
    }
  }

  return payload
}

export function buildStatusApiSummary(
  wrapper: CompactedMonitorStateWrapper,
  monitors: PublicMonitor[]
): { up: number; down: number } {
  let up = 0
  let down = 0

  for (const monitor of monitors) {
    if (!hasCompleteMonitorState(wrapper, monitor.id)) continue

    const incidentCount = wrapper.incidentLen(monitor.id)
    const lastIncident = wrapper.getIncident(monitor.id, incidentCount - 1)
    if (lastIncident.end === null) {
      down++
    } else {
      up++
    }
  }

  return { up, down }
}
