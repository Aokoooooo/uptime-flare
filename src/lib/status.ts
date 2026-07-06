import type {
  IncidentRecord,
  MaintenanceConfig,
  MonitorState,
  MonitorTarget,
} from '../../types/config'

export type PublicMonitor = Pick<MonitorTarget, 'id' | 'name' | 'statusPageLink'>

export function publicMonitor(monitor: MonitorTarget): PublicMonitor {
  return {
    id: monitor.id,
    name: monitor.name,
    statusPageLink: monitor.statusPageLink,
  }
}

export function isMonitorUp(state: MonitorState, monitorId: string): boolean {
  const incidents = state.incident[monitorId]
  if (!incidents?.length) return false
  return incidents[incidents.length - 1].end !== null
}

export function monitorMessage(state: MonitorState, monitorId: string): string {
  const incidents = state.incident[monitorId]
  if (!incidents?.length) return '暂无数据'
  const lastIncident = incidents[incidents.length - 1]
  return lastIncident.end === null ? lastIncident.error[lastIncident.error.length - 1] : '运行正常'
}

export function publicOverallStatus(
  state: Pick<MonitorState, 'lastUpdate' | 'incident'>,
  monitors: PublicMonitor[]
): Pick<MonitorState, 'lastUpdate' | 'overallUp' | 'overallDown'> {
  let overallUp = 0
  let overallDown = 0

  for (const monitor of monitors) {
    const incidents = state.incident[monitor.id]
    if (!incidents?.length) continue

    if (incidents[incidents.length - 1].end === null) {
      overallDown++
    } else {
      overallUp++
    }
  }

  return {
    lastUpdate: state.lastUpdate,
    overallUp,
    overallDown,
  }
}

export function monitorUptimePercent(
  state: MonitorState,
  monitorId: string,
  now = Date.now() / 1000
): string {
  const incidents = state.incident[monitorId]
  if (!incidents?.length) return '0'

  const totalTime = now - incidents[0].start[0]
  if (totalTime <= 0) return '0'

  const downTime = incidents.reduce((sum, incident) => {
    return sum + (incident.end ?? now) - incident.start[0]
  }, 0)

  return (((totalTime - downTime) / totalTime) * 100).toPrecision(4)
}

export function overlapSeconds(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

export type DailyUptime = {
  dayStart: number
  percent: string
  downSeconds: number
  reasons: string[]
}

export function dailyUptimeBars(
  state: MonitorState,
  monitorId: string,
  now = Math.round(Date.now() / 1000)
): DailyUptime[] {
  const incidents = state.incident[monitorId] ?? []
  const monitorStart = incidents[0]?.start[0] ?? now
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = Math.round(today.getTime() / 1000)

  return Array.from({ length: 90 }, (_, index) => {
    const offset = 89 - index
    const dayStart = todayStart - offset * 86400
    const dayEnd = dayStart + 86400
    const monitorSeconds = overlapSeconds(dayStart, dayEnd, monitorStart, now)
    let downSeconds = 0
    const reasons: string[] = []

    for (const incident of incidents) {
      const incidentStart = incident.start[0]
      const incidentEnd = incident.end ?? now
      const overlap = overlapSeconds(dayStart, dayEnd, incidentStart, incidentEnd)
      downSeconds += overlap

      if (overlap > 0) {
        appendIncidentReasons(reasons, incident, dayStart, dayEnd, now)
      }
    }

    const percent =
      monitorSeconds <= 0
        ? 'NaN'
        : (((monitorSeconds - downSeconds) / monitorSeconds) * 100).toPrecision(4)

    return { dayStart, percent, downSeconds, reasons }
  })
}

function appendIncidentReasons(
  reasons: string[],
  incident: IncidentRecord,
  dayStart: number,
  dayEnd: number,
  now: number
) {
  for (let i = 0; i < incident.error.length; i++) {
    const partStart = Math.max(incident.start[i], dayStart)
    const nextStart =
      i === incident.error.length - 1 ? (incident.end ?? now) : incident.start[i + 1]
    const partEnd = Math.min(nextStart, dayEnd)

    if (overlapSeconds(dayStart, dayEnd, partStart, partEnd) > 0) {
      const start = new Date(partStart * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      const end = new Date(partEnd * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      reasons.push(`[${start}-${end}] ${incident.error[i]}`)
    }
  }
}

export function colorForPercent(percent: string, strong = false): string {
  const value = Number(percent)
  if (Number.isNaN(value)) return '#334155'
  if (value === 100) return strong ? '#34d399' : '#10b981'
  if (value >= 99) return strong ? '#fbbf24' : '#d97706'
  return strong ? '#fb7185' : '#e11d48'
}

export function activeMaintenanceFor(monitorId: string, list: MaintenanceConfig[] = []) {
  const now = new Date()
  return list.find((m) => {
    return isMaintenanceActive(m, now) && m.monitors?.includes(monitorId)
  })
}

export function maintenanceDate(value: number | string): Date {
  return typeof value === 'number' ? new Date(value * 1000) : new Date(value)
}

export function isMaintenanceActive(maintenance: MaintenanceConfig, now = new Date()): boolean {
  return (
    now >= maintenanceDate(maintenance.start) &&
    (!maintenance.end || now <= maintenanceDate(maintenance.end))
  )
}

export function resolveMaintenanceMonitors(
  maintenance: MaintenanceConfig,
  monitors: PublicMonitor[]
): Omit<MaintenanceConfig, 'monitors'> & { monitors?: PublicMonitor[] } {
  return {
    ...maintenance,
    monitors: maintenance.monitors
      ?.map((id) => monitors.find((monitor) => monitor.id === id))
      .filter(Boolean) as PublicMonitor[] | undefined,
  }
}
