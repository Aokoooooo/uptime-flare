import { useEffect, useState } from 'react'
import type { MonitorTarget } from '../../types/config'

type Props = {
  monitor: MonitorTarget | null
  onSubmit: (monitor: MonitorTarget) => Promise<void>
  onCancel: () => void
  saving?: boolean
}

const emptyMonitor: MonitorTarget = {
  id: '',
  name: '',
  method: 'GET',
  target: '',
  enabled: true,
  expectedCodes: [200],
  timeout: 10000,
}

function stringifyJson(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2)
}

function parseJsonField(value: string, label: string): unknown {
  if (!value.trim()) return undefined
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${label} 不是有效 JSON`)
  }
}

export function AdminMonitorForm({ monitor, onSubmit, onCancel, saving = false }: Props) {
  const [draft, setDraft] = useState<MonitorTarget>(monitor ?? emptyMonitor)
  const [headersText, setHeadersText] = useState(stringifyJson(monitor?.headers))
  const [expectedJsonText, setExpectedJsonText] = useState(stringifyJson(monitor?.expectedJson))
  const [expectedCodesText, setExpectedCodesText] = useState(
    (monitor?.expectedCodes ?? [200]).join(', ')
  )
  const [error, setError] = useState('')
  const editing = Boolean(monitor?.id)

  useEffect(() => {
    const next = monitor ?? emptyMonitor
    setDraft(next)
    setHeadersText(stringifyJson(next.headers))
    setExpectedJsonText(stringifyJson(next.expectedJson))
    setExpectedCodesText((next.expectedCodes ?? [200]).join(', '))
    setError('')
  }, [monitor])

  const update = <TKey extends keyof MonitorTarget>(key: TKey, value: MonitorTarget[TKey]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    try {
      const expectedCodes = expectedCodesText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map(Number)

      if (expectedCodes.some((item) => Number.isNaN(item))) {
        throw new Error('状态码必须是数字，用英文逗号分隔')
      }

      const headers = parseJsonField(headersText, 'Headers')
      const expectedJson = parseJsonField(expectedJsonText, 'Expected JSON')

      await onSubmit({
        ...draft,
        expectedCodes: expectedCodes.length > 0 ? expectedCodes : undefined,
        headers: headers as MonitorTarget['headers'],
        expectedJson: expectedJson as MonitorTarget['expectedJson'],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="admin-form-head">
        <h2>{editing ? '编辑监控项' : '新建监控项'}</h2>
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={draft.enabled !== false}
            onChange={(event) => update('enabled', event.target.checked)}
          />
          启用
        </label>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="field-grid">
        <label>
          <span>ID</span>
          <input
            value={draft.id}
            disabled={editing}
            onChange={(event) => update('id', event.target.value)}
          />
        </label>
        <label>
          <span>名称</span>
          <input value={draft.name} onChange={(event) => update('name', event.target.value)} />
        </label>
        <label>
          <span>Method</span>
          <select value={draft.method} onChange={(event) => update('method', event.target.value)}>
            {['GET', 'POST', 'HEAD', 'OPTIONS', 'TCP_PING'].map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Timeout ms</span>
          <input
            type="number"
            value={draft.timeout ?? ''}
            onChange={(event) =>
              update('timeout', event.target.value ? Number(event.target.value) : undefined)
            }
          />
        </label>
      </div>

      <label>
        <span>Target</span>
        <input value={draft.target} onChange={(event) => update('target', event.target.value)} />
      </label>

      <label>
        <span>Status Page Link</span>
        <input
          value={draft.statusPageLink ?? ''}
          onChange={(event) => update('statusPageLink', event.target.value)}
        />
      </label>

      <label>
        <span>期望状态码</span>
        <input
          value={expectedCodesText}
          onChange={(event) => setExpectedCodesText(event.target.value)}
        />
      </label>

      <details className="advanced-fields">
        <summary>高级检查项</summary>
        <label>
          <span>Headers JSON</span>
          <textarea
            value={headersText}
            onChange={(event) => setHeadersText(event.target.value)}
            rows={5}
          />
        </label>
        <label>
          <span>Request Body</span>
          <textarea
            value={draft.body ?? ''}
            onChange={(event) => update('body', event.target.value)}
            rows={5}
          />
        </label>
        <label>
          <span>Expected JSON</span>
          <textarea
            value={expectedJsonText}
            onChange={(event) => setExpectedJsonText(event.target.value)}
            rows={5}
          />
        </label>
        <label>
          <span>必须包含关键字</span>
          <input
            value={draft.responseKeyword ?? ''}
            onChange={(event) => update('responseKeyword', event.target.value)}
          />
        </label>
        <label>
          <span>禁止包含关键字</span>
          <input
            value={draft.responseForbiddenKeyword ?? ''}
            onChange={(event) => update('responseForbiddenKeyword', event.target.value)}
          />
        </label>
        <label>
          <span>Check Proxy</span>
          <input
            value={draft.checkProxy ?? ''}
            onChange={(event) => update('checkProxy', event.target.value)}
          />
        </label>
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={draft.checkProxyFallback === true}
            onChange={(event) => update('checkProxyFallback', event.target.checked)}
          />
          Proxy 失败后回退本地检查
        </label>
      </details>

      <div className="form-actions">
        <button className="button primary" type="submit" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
        <button className="button" type="button" onClick={onCancel} disabled={saving}>
          取消
        </button>
      </div>
    </form>
  )
}
