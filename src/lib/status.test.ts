import { describe, expect, test } from 'bun:test'
import type { MonitorState } from '../../types/config'
import { activeMaintenanceFor, publicOverallStatus } from './status'

const state: MonitorState = {
  lastUpdate: 123,
  overallUp: 1,
  overallDown: 1,
  incident: {
    'enabled-up': [{ start: [100], end: 120, error: ['dummy'] }],
    'disabled-down': [{ start: [100], end: null, error: ['failed'] }],
  },
  latency: {},
}

describe('public status summary', () => {
  test('summarizes only currently public monitors', () => {
    expect(publicOverallStatus(state, [{ id: 'enabled-up', name: 'Enabled' }])).toEqual({
      overallUp: 1,
      overallDown: 0,
      lastUpdate: 123,
    })
  })
})

describe('maintenance windows', () => {
  test('treats numeric maintenance timestamps as seconds', () => {
    const now = Math.round(Date.now() / 1000)

    expect(
      activeMaintenanceFor('api', [
        {
          monitors: ['api'],
          body: 'maintenance',
          start: now - 60,
          end: now + 60,
        },
      ])
    ).toBeDefined()
  })
})
