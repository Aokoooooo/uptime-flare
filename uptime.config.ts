import { pageConfig } from './public.config'
import type { MaintenanceConfig, WorkerConfig } from './types/config'

const workerConfig: WorkerConfig = {
  stateWriteCooldownMinutes: 5,
  notification: {
    timeZone: 'Asia/Shanghai',
    gracePeriod: 5,
  }
}

const maintenances: MaintenanceConfig[] = []

export { maintenances, pageConfig, workerConfig }
