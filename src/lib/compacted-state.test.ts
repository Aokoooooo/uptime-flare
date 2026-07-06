import { describe, expect, test } from 'bun:test'
import { CompactedMonitorStateWrapper } from '../monitoring/store'
import { filterCompactedState } from './compacted-state'

describe('compacted state filtering', () => {
  test('recalculates overall counts after filtering to public monitors', () => {
    const wrapper = new CompactedMonitorStateWrapper(null)
    wrapper.data.lastUpdate = 123
    wrapper.data.overallUp = 1
    wrapper.data.overallDown = 1
    wrapper.appendIncident('enabled-up', { start: [100], end: 120, error: ['dummy'] })
    wrapper.appendLatency('enabled-up', { time: 123, ping: 45, loc: 'SJC' })
    wrapper.appendIncident('disabled-down', { start: [100], end: null, error: ['failed'] })
    wrapper.appendLatency('disabled-down', { time: 123, ping: 0, loc: 'SJC' })

    const filtered = new CompactedMonitorStateWrapper(
      filterCompactedState(wrapper.getCompactedStateStr(), ['enabled-up'])
    )

    expect(filtered.data.overallUp).toBe(1)
    expect(filtered.data.overallDown).toBe(0)
    expect(Object.keys(filtered.data.incident)).toEqual(['enabled-up'])
    expect(Object.keys(filtered.data.latency)).toEqual(['enabled-up'])
  })
})
