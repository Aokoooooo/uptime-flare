import { useEffect, useState } from 'react'
import { pageConfig } from '../../public.config'
import type { MaintenanceConfig, MonitorState } from '../../types/config'
import { isMonitorUp, type PublicMonitor } from '../lib/status'
import { MonitorDetail } from './monitor-detail'

export type MonitorGroupView = {
  name: string
  monitors: PublicMonitor[]
  up: number
  down: number
  total: number
}

function summarizeGroup(state: MonitorState, monitors: PublicMonitor[]) {
  const up = monitors.filter((monitor) => {
    const incidents = state.incident[monitor.id]
    return incidents?.length ? isMonitorUp(state, monitor.id) : false
  }).length
  const down = monitors.filter((monitor) => {
    const incidents = state.incident[monitor.id]
    return incidents?.length ? !isMonitorUp(state, monitor.id) : false
  }).length
  return {
    up,
    down,
    total: monitors.length,
  }
}

export function buildMonitorGroups(
  monitors: PublicMonitor[],
  group: Record<string, string[]> | undefined,
  state: MonitorState
): MonitorGroupView[] {
  if (!group || Object.keys(group).length === 0) return []

  const groupedIds = new Set<string>()
  const groups = Object.entries(group).map(([name, ids]) => {
    const groupMonitors = monitors
      .filter((monitor) => ids.includes(monitor.id))
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))

    for (const monitor of groupMonitors) groupedIds.add(monitor.id)

    return {
      name,
      monitors: groupMonitors,
      ...summarizeGroup(state, groupMonitors),
    }
  })

  const ungrouped = monitors.filter((monitor) => !groupedIds.has(monitor.id))
  if (ungrouped.length > 0) {
    groups.push({
      name: '未分组',
      monitors: ungrouped,
      ...summarizeGroup(state, ungrouped),
    })
  }

  return groups
}

export function MonitorList({
  monitors,
  maintenances,
  state,
}: {
  monitors: PublicMonitor[]
  maintenances: MaintenanceConfig[]
  state: MonitorState
}) {
  const group = pageConfig.group
  const grouped = group && Object.keys(group).length > 0
  const groups = buildMonitorGroups(monitors, group, state)
  const groupNamesKey = groups.map((item) => item.name).join('\0')
  const [expanded, setExpanded] = useState<string[]>(() => groups.map((item) => item.name))

  useEffect(() => {
    const saved = window.localStorage.getItem('expandedGroups')
    if (saved) {
      setExpanded(JSON.parse(saved))
    } else {
      setExpanded(groups.map((item) => item.name))
    }
  }, [groupNamesKey])

  useEffect(() => {
    window.localStorage.setItem('expandedGroups', JSON.stringify(expanded))
  }, [expanded])

  if (!grouped) {
    return (
      <section className="container panel monitor-list">
        {monitors.map((monitor) => (
          <MonitorDetail
            key={monitor.id}
            monitor={monitor}
            maintenances={maintenances}
            state={state}
          />
        ))}
      </section>
    )
  }

  return (
    <section className="container panel monitor-list">
      {groups.map((groupView) => {
        const open = expanded.includes(groupView.name)
        const color =
          groupView.down === 0
            ? '#0f9f6e'
            : groupView.down === groupView.total
              ? '#d64545'
              : '#d9871f'

        return (
          <div className="group" key={groupView.name}>
            <button
              className="group-summary"
              type="button"
              onClick={() =>
                setExpanded((current) =>
                  current.includes(groupView.name)
                    ? current.filter((name) => name !== groupView.name)
                    : [...current, groupView.name]
                )
              }
            >
              <strong>{groupView.name}</strong>
              <span style={{ color }}>
                {groupView.up}/{groupView.total} 正常
              </span>
            </button>
            {open &&
              groupView.monitors.map((monitor) => (
                <MonitorDetail
                  key={monitor.id}
                  monitor={monitor}
                  maintenances={maintenances}
                  state={state}
                />
              ))}
          </div>
        )
      })}
    </section>
  )
}
