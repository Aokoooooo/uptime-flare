import { CompactedMonitorStateWrapper } from '../monitoring/store'

export function hasCompleteMonitorState(
  wrapper: CompactedMonitorStateWrapper,
  monitorId: string
): boolean {
  return wrapper.incidentLen(monitorId) > 0 && wrapper.latencyLen(monitorId) > 0
}

export function filterCompactedState(
  compactedStateStr: string | null,
  monitorIds: string[]
): string | null {
  if (!compactedStateStr) return null

  const wrapper = new CompactedMonitorStateWrapper(compactedStateStr)
  const allowedIds = new Set(monitorIds)

  wrapper.data.incident = Object.fromEntries(
    Object.entries(wrapper.data.incident).filter(([monitorId]) => allowedIds.has(monitorId))
  )
  wrapper.data.latency = Object.fromEntries(
    Object.entries(wrapper.data.latency).filter(([monitorId]) => allowedIds.has(monitorId))
  )

  wrapper.data.overallUp = 0
  wrapper.data.overallDown = 0

  for (const monitorId of monitorIds) {
    if (!hasCompleteMonitorState(wrapper, monitorId)) continue

    const lastIncident = wrapper.getIncident(monitorId, wrapper.incidentLen(monitorId) - 1)
    if (lastIncident.end === null) {
      wrapper.data.overallDown++
    } else {
      wrapper.data.overallUp++
    }
  }

  return wrapper.getCompactedStateStr()
}
