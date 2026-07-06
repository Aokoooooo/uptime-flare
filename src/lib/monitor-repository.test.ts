import { describe, expect, test } from 'bun:test'
import {
  buildImportMonitorRows,
  monitorFromRow,
  monitorToRow,
  sortAndFilterEnabledMonitors,
  type MonitorRow,
} from './monitor-repository'
import type { MonitorTarget } from '../../types/config'

const monitor: MonitorTarget = {
  id: 'api',
  name: 'API',
  method: 'GET',
  target: 'https://example.com/health',
  statusPageLink: 'https://example.com',
  expectedCodes: [200],
  expectedJson: { code: 0 },
  timeout: 10000,
  headers: { 'x-test': '1' },
  body: '{"ping":true}',
}

describe('monitor repository mapping', () => {
  test('stores optional monitor fields in config JSON and restores them', () => {
    const row = monitorToRow(monitor, { sortOrder: 2, createdAt: 111, updatedAt: 123 })

    expect(row).toMatchObject({
      id: 'api',
      name: 'API',
      method: 'GET',
      target: 'https://example.com/health',
      sort_order: 2,
      enabled: 1,
      created_at: 111,
      updated_at: 123,
    })
    expect(JSON.parse(row.config)).toEqual({
      statusPageLink: 'https://example.com',
      expectedCodes: [200],
      expectedJson: { code: 0 },
      timeout: 10000,
      headers: { 'x-test': '1' },
      body: '{"ping":true}',
    })
    expect(monitorFromRow(row)).toEqual(monitor)
  })

  test('keeps disabled monitors out of runtime monitor lists', () => {
    const rows: MonitorRow[] = [
      monitorToRow({ ...monitor, id: 'b', name: 'B' }, { sortOrder: 2, createdAt: 1, updatedAt: 1 }),
      {
        ...monitorToRow(
          { ...monitor, id: 'a', name: 'A' },
          { sortOrder: 1, createdAt: 1, updatedAt: 1 }
        ),
        enabled: 0,
      },
      monitorToRow({ ...monitor, id: 'c', name: 'C' }, { sortOrder: 0, createdAt: 1, updatedAt: 1 }),
    ]

    expect(sortAndFilterEnabledMonitors(rows).map((item) => item.id)).toEqual(['c', 'b'])
  })

  test('builds imported rows in JSON order and keeps omitted monitors after them', () => {
    const existingRows: MonitorRow[] = [
      monitorToRow({ ...monitor, id: 'b', name: 'B' }, { sortOrder: 0, createdAt: 10, updatedAt: 10 }),
      monitorToRow(
        { ...monitor, id: 'a', name: 'A old' },
        { sortOrder: 1, createdAt: 11, updatedAt: 11 }
      ),
      monitorToRow(
        { ...monitor, id: 'c', name: 'C old' },
        { sortOrder: 2, createdAt: 12, updatedAt: 12 }
      ),
    ]

    const rows = buildImportMonitorRows(
      existingRows,
      [
        { ...monitor, id: 'c', name: 'C imported' },
        { ...monitor, id: 'a', name: 'A imported' },
      ],
      99
    )

    expect(rows.map((row) => [row.id, row.name, row.sort_order, row.created_at])).toEqual([
      ['c', 'C imported', 0, 12],
      ['a', 'A imported', 1, 11],
      ['b', 'B', 2, 10],
    ])
  })
})
