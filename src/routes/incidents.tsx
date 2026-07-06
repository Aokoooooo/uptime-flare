import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useEffect, useMemo, useState } from 'react'
import { CompactedMonitorStateWrapper } from '../monitoring/store'
import { Footer } from '../components/footer'
import { Header } from '../components/header'
import { addMonths, formatDateTime, formatDuration, monthKey } from '../lib/format'
import { readStatusPageData } from '../lib/server-data'
import { maintenanceDate } from '../lib/status'

const getIncidentsData = createServerFn({ method: 'GET' }).handler(() => readStatusPageData())

export const Route = createFileRoute('/incidents')({
  loader: () => getIncidentsData(),
  component: IncidentsPage,
})

function selectedMonthFromHash() {
  if (typeof window === 'undefined') return monthKey()
  const hash = window.location.hash.replace('#', '')
  return hash ? hash.split('-').slice(0, 2).join('-') : monthKey()
}

type IncidentRow = {
  id: string
  type: 'incident' | 'maintenance'
  monitorIds?: string[]
  monitorNames: string[]
  title: string
  body: string
  start: number | string
  end: number | string | null
  sortTime: number
}

function IncidentsPage() {
  const router = useRouter()
  const { compactedStateStr, monitors, maintenances: allMaintenances } = Route.useLoaderData()
  const [selectedMonitor, setSelectedMonitor] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(selectedMonthFromHash)
  const [refreshing, setRefreshing] = useState(false)
  const state = useMemo(
    () => new CompactedMonitorStateWrapper(compactedStateStr).uncompact(),
    [compactedStateStr]
  )

  useEffect(() => {
    const update = () => setSelectedMonth(selectedMonthFromHash())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  const incidents = useMemo<IncidentRow[]>(() => {
    const monitorMap = new Map(monitors.map((monitor) => [monitor.id, monitor]))
    const monitorIncidents = Object.entries(state.incident).flatMap(([monitorId, records]) => {
      const monitor = monitorMap.get(monitorId)
      if (!monitor) return []

      return records
        .filter((record) => record.error[0] !== 'dummy')
        .map((record, index): IncidentRow => {
          const start = record.start[0]
          const latestReason = record.error[record.error.length - 1] ?? '服务不可用'
          const duration = formatDuration((record.end ?? Math.round(Date.now() / 1000)) - start)

          return {
            id: `incident-${monitorId}-${start}-${index}`,
            type: 'incident',
            monitorIds: [monitorId],
            monitorNames: [monitor.name],
            title: record.end === null ? '故障中' : '故障已恢复',
            body: `${latestReason} · 持续 ${duration}`,
            start,
            end: record.end,
            sortTime: start,
          }
        })
    })

    const maintenanceIncidents = allMaintenances.map((maintenance, index): IncidentRow => {
      const monitorIds = maintenance.monitors
      const monitorNames = monitorIds
        ?.map((id) => monitorMap.get(id)?.name)
        .filter((name): name is string => Boolean(name)) ?? ['全部监控项']
      const start = maintenanceDate(maintenance.start).getTime() / 1000

      return {
        id: `maintenance-${start}-${index}`,
        type: 'maintenance',
        monitorIds,
        monitorNames,
        title: maintenance.title ?? '计划维护',
        body: maintenance.body,
        start: maintenance.start,
        end: maintenance.end ?? null,
        sortTime: start,
      }
    })

    return [...monitorIncidents, ...maintenanceIncidents]
      .filter((incident) => monthKey(maintenanceDate(incident.start)) === selectedMonth)
      .filter(
        (incident) =>
          !selectedMonitor || !incident.monitorIds || incident.monitorIds.includes(selectedMonitor)
      )
      .sort((a, b) => b.sortTime - a.sortTime)
  }, [allMaintenances, monitors, selectedMonth, selectedMonitor, state.incident])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await router.invalidate()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <main className="app-shell">
      <Header />
      <section className="container incidents-page">
        <div className="page-heading">
          <div>
            <h1>事件记录</h1>
            <p className="status-subtitle">查看真实故障和计划维护记录。</p>
          </div>
          <div className="page-actions">
            <strong>{selectedMonth}</strong>
            <button
              className="button primary refresh-button"
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              {refreshing && <span className="spinner" aria-hidden="true" />}
              <span>{refreshing ? '刷新中...' : '刷新记录'}</span>
            </button>
          </div>
        </div>

        <div className="controls incident-controls">
          <select
            className="select"
            value={selectedMonitor}
            onChange={(event) => setSelectedMonitor(event.target.value)}
          >
            <option value="">全部监控项</option>
            {monitors.map((monitor) => (
              <option key={monitor.id} value={monitor.id}>
                {monitor.name}
              </option>
            ))}
          </select>
        </div>

        {incidents.length === 0 ? (
          <div className="empty-state">
            <strong>本月暂无事件</strong>
            <span>没有匹配当前筛选条件的故障或维护记录。</span>
          </div>
        ) : (
          <div className="incident-list">
            {incidents.map((incident) => (
              <article className={`incident-card ${incident.type}`} key={incident.id}>
                <div className="incident-marker" />
                <div className="incident-content">
                  <div className="incident-head">
                    <strong>{incident.title}</strong>
                    <span>{incident.type === 'incident' ? '故障' : '维护'}</span>
                  </div>
                  <div className="incident-body">{incident.body}</div>
                  <div className="incident-meta">
                    {formatDateTime(incident.start)}
                    {incident.end ? ` - ${formatDateTime(incident.end)}` : ' - 进行中'}
                    {' · '}
                    {incident.monitorNames.join(', ')}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="month-pager">
          <button
            className="button"
            type="button"
            onClick={() => (window.location.hash = addMonths(selectedMonth, -1))}
          >
            上一月
          </button>
          <strong>{selectedMonth}</strong>
          <button
            className="button"
            type="button"
            onClick={() => (window.location.hash = addMonths(selectedMonth, 1))}
          >
            下一月
          </button>
        </div>
      </section>
      <Footer />
    </main>
  )
}
