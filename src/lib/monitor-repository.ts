import type { MonitorTarget } from '../../types/config'

export type MonitorRow = {
  id: string
  name: string
  method: string
  target: string
  config: string
  sort_order: number
  enabled: number
  created_at: number
  updated_at: number
}

type MonitorConfigFields = Omit<MonitorTarget, 'id' | 'name' | 'method' | 'target' | 'enabled'>

type MonitorDatabaseEnv = {
  UPTIMEFLARE_D1: D1Database
}

const configKeys: (keyof MonitorConfigFields)[] = [
  'statusPageLink',
  'expectedCodes',
  'timeout',
  'headers',
  'body',
  'responseKeyword',
  'responseForbiddenKeyword',
  'expectedJson',
  'checkProxy',
  'checkProxyFallback',
]

type MonitorRowTimestamps = {
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export function monitorToRow(
  monitor: MonitorTarget,
  timestamps: MonitorRowTimestamps
): MonitorRow {
  const config: Partial<MonitorConfigFields> = {}

  for (const key of configKeys) {
    const value = monitor[key]
    if (value !== undefined) {
      ;(config as Record<string, unknown>)[key] = value
    }
  }

  return {
    id: monitor.id,
    name: monitor.name,
    method: monitor.method,
    target: monitor.target,
    config: JSON.stringify(config),
    sort_order: timestamps.sortOrder,
    enabled: monitor.enabled === false ? 0 : 1,
    created_at: timestamps.createdAt,
    updated_at: timestamps.updatedAt,
  }
}

export function monitorFromRow(row: MonitorRow): MonitorTarget {
  const config = JSON.parse(row.config || '{}') as Partial<MonitorConfigFields>
  const monitor: MonitorTarget = {
    id: row.id,
    name: row.name,
    method: row.method,
    target: row.target,
    ...config,
  }

  if (row.enabled === 0) monitor.enabled = false
  return monitor
}

export function sortAndFilterEnabledMonitors(rows: MonitorRow[]): MonitorTarget[] {
  return rows
    .filter((row) => row.enabled !== 0)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map(monitorFromRow)
}

export async function listMonitorRows(env: MonitorDatabaseEnv): Promise<MonitorRow[]> {
  const result = await env.UPTIMEFLARE_D1.prepare(
    'SELECT id, name, method, target, config, sort_order, enabled, created_at, updated_at FROM monitors ORDER BY sort_order ASC, id ASC'
  ).all<MonitorRow>()

  return result.results ?? []
}

export async function listMonitors(env: MonitorDatabaseEnv): Promise<MonitorTarget[]> {
  return (await listMonitorRows(env)).map(monitorFromRow)
}

export async function listEnabledMonitors(env: MonitorDatabaseEnv): Promise<MonitorTarget[]> {
  return sortAndFilterEnabledMonitors(await listMonitorRows(env))
}

export async function getMonitor(
  env: MonitorDatabaseEnv,
  id: string
): Promise<MonitorTarget | null> {
  const row = await env.UPTIMEFLARE_D1.prepare(
    'SELECT id, name, method, target, config, sort_order, enabled, created_at, updated_at FROM monitors WHERE id = ?'
  )
    .bind(id)
    .first<MonitorRow>()

  return row ? monitorFromRow(row) : null
}

export async function upsertMonitor(
  env: MonitorDatabaseEnv,
  monitor: MonitorTarget,
  sortOrder?: number
): Promise<void> {
  const existing = await env.UPTIMEFLARE_D1.prepare(
    'SELECT sort_order, created_at FROM monitors WHERE id = ?'
  )
    .bind(monitor.id)
    .first<{ sort_order: number; created_at: number }>()
  const now = Math.round(Date.now() / 1000)
  const row = monitorToRow(monitor, {
    sortOrder: sortOrder ?? existing?.sort_order ?? now,
    createdAt: existing?.created_at ?? now,
    updatedAt: now,
  })

  await env.UPTIMEFLARE_D1.prepare(
    'INSERT INTO monitors (id, name, method, target, config, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, method = excluded.method, target = excluded.target, config = excluded.config, sort_order = excluded.sort_order, enabled = excluded.enabled, updated_at = excluded.updated_at'
  )
    .bind(
      row.id,
      row.name,
      row.method,
      row.target,
      row.config,
      row.sort_order,
      row.enabled,
      row.created_at,
      row.updated_at
    )
    .run()
}

export async function importMonitors(
  env: MonitorDatabaseEnv,
  monitors: MonitorTarget[]
): Promise<void> {
  if (monitors.length === 0) return

  const existingRows = await listMonitorRows(env)
  const now = Math.round(Date.now() / 1000)
  const rows = buildImportMonitorRows(existingRows, monitors, now)
  const statements = rows.map((row) =>
    env.UPTIMEFLARE_D1.prepare(
      'INSERT INTO monitors (id, name, method, target, config, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, method = excluded.method, target = excluded.target, config = excluded.config, sort_order = excluded.sort_order, enabled = excluded.enabled, updated_at = excluded.updated_at'
    ).bind(
      row.id,
      row.name,
      row.method,
      row.target,
      row.config,
      row.sort_order,
      row.enabled,
      row.created_at,
      row.updated_at
    )
  )

  await env.UPTIMEFLARE_D1.batch(statements)
}

export function buildImportMonitorRows(
  existingRows: MonitorRow[],
  monitors: MonitorTarget[],
  now: number
): MonitorRow[] {
  const existing = new Map(existingRows.map((row) => [row.id, row]))
  const importedIds = new Set(monitors.map((monitor) => monitor.id))
  const importedRows = monitors.map((monitor, index) => {
    const existingRow = existing.get(monitor.id)
    return monitorToRow(monitor, {
      sortOrder: index,
      createdAt: existingRow?.created_at ?? now,
      updatedAt: now,
    })
  })
  const omittedRows = existingRows
    .filter((row) => !importedIds.has(row.id))
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((row, index) => ({
      ...row,
      sort_order: importedRows.length + index,
      updated_at: now,
    }))

  return [...importedRows, ...omittedRows]
}

export async function deleteMonitor(env: MonitorDatabaseEnv, id: string): Promise<boolean> {
  const result = await env.UPTIMEFLARE_D1.prepare('DELETE FROM monitors WHERE id = ?')
    .bind(id)
    .run()
  return (result.meta.changes ?? 0) > 0
}

export async function reorderMonitors(env: MonitorDatabaseEnv, ids: string[]): Promise<void> {
  const statements = ids.map((id, index) =>
    env.UPTIMEFLARE_D1.prepare(
      'UPDATE monitors SET sort_order = ?, updated_at = ? WHERE id = ?'
    ).bind(index, Math.round(Date.now() / 1000), id)
  )

  if (statements.length > 0) {
    await env.UPTIMEFLARE_D1.batch(statements)
  }
}
