import { env } from 'cloudflare:workers'
import { maintenances } from '../../uptime.config'
import { listEnabledMonitors } from './monitor-repository'
import { CompactedMonitorStateWrapper, getFromStore } from '../monitoring/store'
import { filterCompactedState } from './compacted-state'
import { publicMonitor } from './status'
export { filterCompactedState } from './compacted-state'

export async function readCompactedStateString(): Promise<string | null> {
  try {
    return await getFromStore(env as unknown as { UPTIMEFLARE_D1: D1Database }, 'state')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Unable to read monitor state from D1: ${message}`)
    return null
  }
}

export async function readCompactedStateWrapper(): Promise<CompactedMonitorStateWrapper> {
  return new CompactedMonitorStateWrapper(await readCompactedStateString())
}

export async function readStatusPageData() {
  const monitors = await listEnabledMonitors(env as unknown as { UPTIMEFLARE_D1: D1Database })
  const compactedStateStr = await readCompactedStateString()

  return {
    compactedStateStr: filterCompactedState(
      compactedStateStr,
      monitors.map((monitor) => monitor.id)
    ),
    monitors: monitors.map(publicMonitor),
    maintenances,
  }
}
