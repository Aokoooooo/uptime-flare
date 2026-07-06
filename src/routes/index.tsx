import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useEffect, useMemo, useState } from 'react'
import { Footer } from '../components/footer'
import { Header } from '../components/header'
import { MonitorDetail } from '../components/monitor-detail'
import { MonitorList } from '../components/monitor-list'
import { OverallStatus } from '../components/overall-status'
import { readStatusPageData } from '../lib/server-data'
import { publicOverallStatus } from '../lib/status'
import { CompactedMonitorStateWrapper } from '../monitoring/store'

const getStatusPageData = createServerFn({ method: 'GET' }).handler(() => readStatusPageData())

export const Route = createFileRoute('/')({
  loader: () => getStatusPageData(),
  component: Home,
})

function useHashMonitorId() {
  const [monitorId, setMonitorId] = useState('')

  useEffect(() => {
    const update = () => setMonitorId(window.location.hash.substring(1))
    update()
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  return monitorId
}

function Home() {
  const router = useRouter()
  const { compactedStateStr, monitors, maintenances } = Route.useLoaderData()
  const state = useMemo(
    () => new CompactedMonitorStateWrapper(compactedStateStr).uncompact(),
    [compactedStateStr]
  )
  const overallState = useMemo(() => publicOverallStatus(state, monitors), [state, monitors])
  const monitorId = useHashMonitorId()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await router.invalidate()
    } finally {
      setRefreshing(false)
    }
  }

  if (monitorId) {
    const monitor = monitors.find((item) => item.id === monitorId)
    return (
      <main className="app-shell">
        <div className="container" style={{ paddingTop: 24 }}>
          {monitor ? (
            <section className="panel">
              <MonitorDetail monitor={monitor} maintenances={maintenances} state={state} />
            </section>
          ) : (
            <strong>未找到监控项：{monitorId}</strong>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <Header />
      {state.lastUpdate === 0 ? (
        <section className="hero container">
          <h1 className="status-title">暂无监控状态</h1>
          <p className="status-subtitle">Worker 尚未写入状态数据。</p>
          <button
            className="button primary refresh-button hero-refresh-button"
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            {refreshing && <span className="spinner" aria-hidden="true" />}
            <span>{refreshing ? '刷新中...' : '刷新状态'}</span>
          </button>
        </section>
      ) : (
        <>
          <OverallStatus state={overallState} monitors={monitors} maintenances={maintenances} />
          <MonitorList monitors={monitors} maintenances={maintenances} state={state} />
        </>
      )}
      <Footer />
    </main>
  )
}
