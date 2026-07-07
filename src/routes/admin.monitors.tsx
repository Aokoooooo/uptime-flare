import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { MonitorTarget } from '../../types/config'
import { AdminMonitorForm } from '../components/admin-monitor-form'
import { AdminMonitorList } from '../components/admin-monitor-list'
import { Header } from '../components/header'
import { monitorsToJson, parseMonitorsJson } from '../lib/admin-monitor-api'

export const Route = createFileRoute('/admin/monitors')({
  component: AdminMonitorsPage,
})

async function apiRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const data = (await response.json().catch(() => ({}))) as { errors?: string[] }
  if (!response.ok) throw new Error(data.errors?.join('\n') || `请求失败：${response.status}`)
  return data
}

function AdminMonitorsPage() {
  const [monitors, setMonitors] = useState<MonitorTarget[]>([])
  const [selected, setSelected] = useState<MonitorTarget | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [pendingAction, setPendingAction] = useState('')
  const [newDraftVersion, setNewDraftVersion] = useState(0)

  const refresh = async () => {
    const data = (await apiRequest('/api/admin/monitors')) as { monitors?: MonitorTarget[] }
    const nextMonitors = data.monitors ?? []
    setMonitors(nextMonitors)
    setSelected((current) => {
      if (current && nextMonitors.some((monitor) => monitor.id === current.id)) return current
      return nextMonitors[0] ?? null
    })
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : '加载监控项失败'))
      .finally(() => setLoading(false))
  }, [])

  const save = async (monitor: MonitorTarget) => {
    await runAction('save', async () => {
      const exists = monitors.some((item) => item.id === monitor.id)
      await apiRequest(exists ? `/api/admin/monitors/${monitor.id}` : '/api/admin/monitors', {
        method: exists ? 'PUT' : 'POST',
        body: JSON.stringify(monitor),
      })
      setSelected(monitor)
      await refresh()
    })
  }

  const remove = async (monitor: MonitorTarget) => {
    if (!window.confirm(`删除 ${monitor.name}？`)) return
    await runAction('delete', async () => {
      await apiRequest(`/api/admin/monitors/${monitor.id}`, { method: 'DELETE' })
      setSelected(null)
      await refresh()
    })
  }

  const move = async (monitor: MonitorTarget, direction: -1 | 1) => {
    await runAction('reorder', async () => {
      const ids = monitors.map((item) => item.id)
      const index = ids.indexOf(monitor.id)
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= ids.length) return
      ;[ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]]
      await apiRequest('/api/admin/monitors/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
      await refresh()
    })
  }

  const exportJson = async () => {
    await navigator.clipboard.writeText(monitorsToJson(monitors))
    window.alert('监控项 JSON 已复制到剪贴板')
  }

  const importJson = async () => {
    const input = window.prompt('粘贴监控项 JSON 数组。导入会按 ID 新建或覆盖。')
    if (input === null) return
    const parsed = parseMonitorsJson(input)
    if (!parsed.ok) {
      window.alert(parsed.errors.join('\n'))
      return
    }

    await runAction('import', async () => {
      await apiRequest('/api/admin/monitors/import', {
        method: 'POST',
        body: JSON.stringify(parsed.monitors),
      })
      setSelected(parsed.monitors[0] ?? null)
      await refresh()
    })
  }

  const triggerScheduledCheck = async () => {
    await runAction('scheduled', async () => {
      await apiRequest('/api/admin/scheduled', { method: 'POST' })
      setActionMessage('已触发一次监控检查')
    })
  }

  const runAction = async (name: string, action: () => Promise<void>) => {
    setActionError('')
    setActionMessage('')
    setPendingAction(name)
    try {
      await action()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setPendingAction('')
    }
  }

  const busy = pendingAction !== ''

  return (
    <main className="app-shell admin-shell">
      <Header />
      <section className="container admin-page">
        <div className="page-heading">
          <div>
            <h1>监控项管理</h1>
            <p className="status-subtitle">管理 D1 中的监控配置，保存后下次定时检查自动生效。</p>
          </div>
          <div className="page-actions">
            <button
              className="button primary"
              type="button"
              onClick={triggerScheduledCheck}
              disabled={busy}
            >
              {pendingAction === 'scheduled' ? '触发中...' : '触发检查'}
            </button>
            <button className="button" type="button" onClick={importJson} disabled={busy}>
              {pendingAction === 'import' ? '导入中...' : '导入 JSON'}
            </button>
            <button className="button" type="button" onClick={exportJson} disabled={busy}>
              导出 JSON
            </button>
          </div>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {actionError ? <p className="form-error">{actionError}</p> : null}
        {actionMessage ? <p className="form-success">{actionMessage}</p> : null}
        <div className="admin-grid" aria-busy={loading}>
          <AdminMonitorList
            monitors={monitors}
            selectedId={selected?.id ?? ''}
            onCreate={() => {
              setSelected(null)
              setNewDraftVersion((version) => version + 1)
            }}
            onSelect={setSelected}
            onDelete={remove}
            onMove={move}
            disabled={busy}
          />
          <section className="admin-editor panel">
            <AdminMonitorForm
              key={selected?.id ?? `new-${newDraftVersion}`}
              monitor={selected}
              onSubmit={save}
              onCancel={() => setSelected(monitors[0] ?? null)}
              saving={pendingAction === 'save'}
            />
          </section>
        </div>
      </section>
    </main>
  )
}
