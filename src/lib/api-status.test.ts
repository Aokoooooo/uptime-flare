import { describe, expect, test } from 'bun:test'
import { CompactedMonitorStateWrapper } from '../monitoring/store'
import { buildStatusApiMonitors, buildStatusApiSummary } from './api-status'
import type { PublicMonitor } from './status'

const monitors: PublicMonitor[] = [
  { id: 'ready', name: 'Ready' },
  { id: 'missing', name: 'Missing' },
]

describe('status API monitor payloads', () => {
  test('keeps monitors without stored state as empty instead of throwing', () => {
    const wrapper = new CompactedMonitorStateWrapper(null)
    wrapper.data.lastUpdate = 123
    wrapper.appendIncident('ready', { start: [100], end: 120, error: ['dummy'] })
    wrapper.appendLatency('ready', { time: 123, ping: 45, loc: 'SJC' })

    expect(buildStatusApiMonitors(wrapper, monitors)).toEqual({
      ready: {
        up: true,
        latency: 45,
        location: 'SJC',
        message: 'OK',
      },
      missing: {
        up: false,
        latency: null,
        location: '',
        message: '暂无数据',
      },
    })
  })

  test('summarizes only currently public monitors', () => {
    const wrapper = new CompactedMonitorStateWrapper(null)
    wrapper.appendIncident('enabled-up', { start: [100], end: 120, error: ['dummy'] })
    wrapper.appendLatency('enabled-up', { time: 123, ping: 45, loc: 'SJC' })
    wrapper.appendIncident('disabled-down', { start: [100], end: null, error: ['failed'] })

    expect(buildStatusApiSummary(wrapper, [{ id: 'enabled-up', name: 'Enabled' }])).toEqual({
      up: 1,
      down: 0,
    })
  })

  test('summary ignores monitors with incomplete stored state', () => {
    const wrapper = new CompactedMonitorStateWrapper(null)
    wrapper.appendIncident('missing-latency', { start: [100], end: 120, error: ['dummy'] })

    expect(buildStatusApiSummary(wrapper, [{ id: 'missing-latency', name: 'Partial' }])).toEqual({
      up: 0,
      down: 0,
    })
  })
})
