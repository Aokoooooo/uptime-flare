import { useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import type { MaintenanceConfig } from '../../types/config'
import { formatDateTime, formatRelativeAge } from '../lib/format'
import {
  isMaintenanceActive,
  maintenanceDate,
  resolveMaintenanceMonitors,
  type PublicMonitor,
} from '../lib/status'
import { MaintenanceAlert } from './maintenance-alert'

function statusText(up: number, down: number) {
  if (up === 0 && down === 0) return '暂无监控数据'
  if (up === 0) return '所有服务均不可用'
  if (down === 0) return '所有服务运行正常'
  return `${up + down} 个服务中有 ${down} 个异常`
}

export function OverallStatus({
  state,
  maintenances,
  monitors,
}: {
  state: { overallUp: number; overallDown: number; lastUpdate: number }
  maintenances: MaintenanceConfig[]
  monitors: PublicMonitor[]
}) {
  const router = useRouter()
  const [currentTime, setCurrentTime] = useState(Math.round(Date.now() / 1000))
  const [showUpcoming, setShowUpcoming] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Math.round(Date.now() / 1000)), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const { active, upcoming } = useMemo(() => {
    const now = new Date(currentTime * 1000)
    return {
      active: maintenances
        .filter((m) => isMaintenanceActive(m, now))
        .map((m) => resolveMaintenanceMonitors(m, monitors)),
      upcoming: maintenances
        .filter((m) => now < maintenanceDate(m.start))
        .map((m) => resolveMaintenanceMonitors(m, monitors)),
    }
  }, [maintenances, monitors, currentTime])

  const allUp = state.overallDown === 0 && state.overallUp > 0

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await router.invalidate()
      setCurrentTime(Math.round(Date.now() / 1000))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section
      className={`status-summary container ${refreshing ? 'is-refreshing' : ''}`}
      aria-busy={refreshing}
    >
      <div className="status-main">
        <div className={`status-mark ${allUp ? 'up' : 'down'}`}>{allUp ? '✓' : '!'}</div>
        <div>
          <h1 className="status-title">{statusText(state.overallUp, state.overallDown)}</h1>
          <p className="status-subtitle">
            最后更新于 {formatDateTime(state.lastUpdate)} ·{' '}
            {formatRelativeAge(currentTime - state.lastUpdate)}
          </p>
        </div>
      </div>
      <button
        className="button primary refresh-button"
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-busy={refreshing}
      >
        {refreshing && <span className="spinner" aria-hidden="true" />}
        <span>{refreshing ? '刷新中...' : '刷新状态'}</span>
      </button>

      {upcoming.length > 0 && (
        <p className="status-subtitle">
          {upcoming.length} 个计划维护 ·{' '}
          <button
            className="button"
            type="button"
            onClick={() => setShowUpcoming((value) => !value)}
          >
            {showUpcoming ? '隐藏' : '查看'}
          </button>
        </p>
      )}

      {showUpcoming &&
        upcoming.map((maintenance, index) => (
          <MaintenanceAlert key={`upcoming-${index}`} maintenance={maintenance} upcoming />
        ))}

      {active.map((maintenance, index) => (
        <MaintenanceAlert key={`active-${index}`} maintenance={maintenance} />
      ))}
    </section>
  )
}
