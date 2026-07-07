import { useState } from 'react'
import type { MaintenanceConfig, MonitorState } from '../../types/config'
import { formatDate, formatDuration } from '../lib/format'
import {
  activeMaintenanceFor,
  colorForPercent,
  dailyUptimeBars,
  isMonitorUp,
  monitorMessage,
  monitorUptimePercent,
  type PublicMonitor,
} from '../lib/status'
import { LatencyChart } from './latency-chart'

function uptimeBarLabel(bar: ReturnType<typeof dailyUptimeBars>[number]) {
  if (Number.isNaN(Number(bar.percent))) return `${formatDate(bar.dayStart)} 暂无数据`

  return `${formatDate(bar.dayStart)} · 可用率 ${bar.percent}%${
    bar.downSeconds > 0 ? ` · 故障 ${formatDuration(bar.downSeconds)}` : ''
  }`
}

export function MonitorDetail({
  monitor,
  maintenances,
  state,
}: {
  monitor: PublicMonitor
  maintenances: MaintenanceConfig[]
  state: MonitorState
}) {
  const [modal, setModal] = useState<{ title: string; reasons: string[] } | null>(null)
  const latencies = state.latency[monitor.id] ?? []
  const hasData = latencies.length > 0 && state.incident[monitor.id]?.length > 0

  if (!hasData) {
    return (
      <article className="monitor-card">
        <div className="monitor-head">
          <strong>{monitor.name}</strong>
          <span className="empty">暂无数据</span>
        </div>
      </article>
    )
  }

  const maintenance = activeMaintenanceFor(monitor.id, maintenances)
  const up = isMonitorUp(state, monitor.id)
  const percent = monitorUptimePercent(state, monitor.id)
  const bars = dailyUptimeBars(state, monitor.id)

  return (
    <article className="monitor-card">
      <div className="monitor-head">
        <a
          className="monitor-name"
          href={monitor.statusPageLink}
          target={monitor.statusPageLink ? '_blank' : undefined}
          rel={monitor.statusPageLink ? 'noreferrer' : undefined}
        >
          <span className={`status-dot ${maintenance ? 'maintenance' : up ? '' : 'down'}`} />
          <span>{monitor.name}</span>
        </a>
        <span className="uptime-percent" style={{ color: colorForPercent(percent, true) }}>
          总可用率 {percent}%
        </span>
      </div>

      <div className="bars" aria-label={`${monitor.name} 90 天可用率`}>
        {bars.map((bar) => {
          const label = uptimeBarLabel(bar)

          return (
            <button
              type="button"
              className="bar"
              key={bar.dayStart}
              aria-label={label}
              data-tooltip={label}
              style={{ background: colorForPercent(bar.percent) }}
              onClick={() => {
                if (bar.reasons.length > 0) {
                  setModal({
                    title: `${monitor.name} 在 ${formatDate(bar.dayStart)} 的事件`,
                    reasons: bar.reasons,
                  })
                }
              }}
            />
          )
        })}
      </div>

      <div className="status-subtitle">{monitorMessage(state, monitor.id)}</div>
      <LatencyChart points={latencies} />

      {modal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="modal-title">{modal.title}</h2>
            <div className="modal-body">
              {modal.reasons.map((reason) => (
                <div className="incident-reason" key={reason}>
                  {reason}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="button" type="button" onClick={() => setModal(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
