import type { MaintenanceConfig } from '../../types/config'
import { formatDateTime } from '../lib/format'
import type { PublicMonitor } from '../lib/status'

export function MaintenanceAlert({
  maintenance,
  upcoming,
}: {
  maintenance: Omit<MaintenanceConfig, 'monitors'> & { monitors?: PublicMonitor[] }
  upcoming?: boolean
}) {
  return (
    <div className={`maintenance ${upcoming ? '' : 'active'}`}>
      <div className="maintenance-title">
        {maintenance.title ?? (upcoming ? '计划维护' : '维护中')}
      </div>
      <div>{maintenance.body}</div>
      <div className="maintenance-meta">
        {formatDateTime(maintenance.start)}
        {maintenance.end ? ` - ${formatDateTime(maintenance.end)}` : ''}
        {maintenance.monitors?.length
          ? ` · ${maintenance.monitors.map((m) => m.name).join(', ')}`
          : ''}
      </div>
    </div>
  )
}
