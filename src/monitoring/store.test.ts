import { describe, expect, test } from 'bun:test'
import { CompactedMonitorStateWrapper } from './store'

describe('compacted monitor state store', () => {
  test('removes incident and latency history for a monitor id', () => {
    const wrapper = new CompactedMonitorStateWrapper(null)
    wrapper.data.lastUpdate = 123
    wrapper.data.overallUp = 2
    wrapper.appendIncident('removed', { start: [100], end: 120, error: ['dummy'] })
    wrapper.appendLatency('removed', { time: 123, ping: 10, loc: 'SJC' })
    wrapper.appendIncident('kept', { start: [100], end: 120, error: ['dummy'] })
    wrapper.appendLatency('kept', { time: 123, ping: 20, loc: 'SJC' })

    wrapper.deleteMonitorState('removed')

    expect(wrapper.data.incident.removed).toBeUndefined()
    expect(wrapper.data.latency.removed).toBeUndefined()
    expect(wrapper.data.incident.kept).toBeDefined()
    expect(wrapper.data.latency.kept).toBeDefined()
    expect(wrapper.data.lastUpdate).toBe(123)
  })
})
