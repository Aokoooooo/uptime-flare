import type { MonitorTarget } from '../../types/config'

type Props = {
  monitors: MonitorTarget[]
  selectedId: string
  onSelect: (monitor: MonitorTarget) => void
  onCreate: () => void
  onDelete: (monitor: MonitorTarget) => Promise<void>
  onMove: (monitor: MonitorTarget, direction: -1 | 1) => Promise<void>
  disabled?: boolean
}

export function AdminMonitorList({
  monitors,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onMove,
  disabled = false,
}: Props) {
  return (
    <aside className="admin-list">
      <div className="admin-list-head">
        <h2>监控项</h2>
        <button className="button primary" type="button" onClick={onCreate} disabled={disabled}>
          新建
        </button>
      </div>

      {monitors.map((monitor, index) => (
        <div
          className="admin-monitor-row"
          data-selected={monitor.id === selectedId}
          key={monitor.id}
        >
          <button
            className="admin-monitor-main"
            type="button"
            disabled={disabled}
            onClick={() => onSelect(monitor)}
          >
            <strong>{monitor.name}</strong>
            <span>
              {monitor.method} · {monitor.target}
            </span>
            <em data-enabled={monitor.enabled !== false}>
              {monitor.enabled === false ? '已停用' : '启用中'}
            </em>
          </button>
          <div className="row-actions">
            <button
              className="button icon-button"
              type="button"
              disabled={disabled || index === 0}
              onClick={() => onMove(monitor, -1)}
            >
              ↑
            </button>
            <button
              className="button icon-button"
              type="button"
              disabled={disabled || index === monitors.length - 1}
              onClick={() => onMove(monitor, 1)}
            >
              ↓
            </button>
            <button
              className="button icon-button danger"
              type="button"
              disabled={disabled}
              onClick={() => onDelete(monitor)}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </aside>
  )
}
