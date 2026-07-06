import { describe, expect, test } from 'bun:test'
import type { MonitorState } from '../../types/config'
import { buildMonitorGroups } from './monitor-list'

const state: MonitorState = {
  lastUpdate: 1,
  overallUp: 0,
  overallDown: 0,
  incident: {
    api: [{ start: [1], end: 2, error: ['dummy'] }],
    db: [{ start: [1], end: null, error: ['down'] }],
    worker: [{ start: [1], end: 2, error: ['dummy'] }],
  },
  latency: {},
}

describe('monitor list grouping', () => {
  test('keeps monitors not present in static groups visible', () => {
    const groups = buildMonitorGroups(
      [
        { id: 'api', name: 'API' },
        { id: 'db', name: 'DB' },
        { id: 'worker', name: 'Worker' },
      ],
      { Core: ['api', 'missing'] },
      state
    )

    expect(groups.map((group) => group.name)).toEqual(['Core', '未分组'])
    expect(groups[1].monitors.map((monitor) => monitor.id)).toEqual(['db', 'worker'])
  })

  test('counts group health using actual monitors instead of stale configured ids', () => {
    const groups = buildMonitorGroups(
      [
        { id: 'api', name: 'API' },
        { id: 'worker', name: 'Worker' },
      ],
      { Core: ['api', 'missing'] },
      state
    )

    expect(groups[0].up).toBe(1)
    expect(groups[0].down).toBe(0)
    expect(groups[0].total).toBe(1)
  })

  test('does not count monitors without state as down', () => {
    const groups = buildMonitorGroups(
      [
        { id: 'api', name: 'API' },
        { id: 'new-service', name: 'New Service' },
      ],
      { Core: ['api', 'new-service'] },
      state
    )

    expect(groups[0].up).toBe(1)
    expect(groups[0].down).toBe(0)
    expect(groups[0].total).toBe(2)
  })
})
