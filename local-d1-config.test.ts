import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function tomlValue(toml: string, key: string) {
  const match = toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))
  return match?.[1]
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return path
  })
}

describe('local D1 configuration', () => {
  test('single worker serves the status page and scheduled monitor', () => {
    const wrangler = read('wrangler.toml')
    const initSql = read('init.sql')
    const rootPackage = JSON.parse(read('package.json'))

    expect(tomlValue(wrangler, 'main')).toBe('src/worker.ts')
    expect(tomlValue(wrangler, 'binding')).toBe('UPTIMEFLARE_D1')
    expect(tomlValue(wrangler, 'database_name')).toBe('uptime_flare')
    expect(wrangler).toContain('[triggers]')
    expect(wrangler).toContain('crons = ["* * * * *"]')
    expect(wrangler).toContain('name = "REMOTE_CHECKER_DO"')
    expect(wrangler).toContain('class_name = "RemoteChecker"')
    expect(initSql).toContain('CREATE TABLE IF NOT EXISTS monitor_state')
    expect(rootPackage.scripts['d1:list']).toContain('FROM monitor_state')
    expect(rootPackage.dependencies['p-limit']).toBeDefined()
  })

  test('local D1 state stays outside Wrangler deploy metadata', () => {
    const rootPackage = JSON.parse(read('package.json'))
    const viteConfig = read('vite.config.ts')
    const deploymentDoc = read('docs/deployment.md')

    expect(rootPackage.scripts['d1:init']).toContain('--local')
    expect(rootPackage.scripts['d1:init']).toContain('uptime_flare')
    expect(rootPackage.scripts['d1:init']).toContain('--persist-to .wrangler-local/state')
    expect(rootPackage.scripts.dev).toContain('vite dev')
    expect(viteConfig).toContain("persistState: { path: '.wrangler-local/state' }")
    expect(deploymentDoc).toContain(
      'wrangler d1 execute uptime_flare --local --file=init.sql --persist-to .wrangler-local/state'
    )
  })

  test('runtime monitors live in D1 instead of uptime config', () => {
    const uptimeConfig = read('uptime.config.ts')
    const configTypes = read('types/config.ts')
    const repository = read('src/lib/monitor-repository.ts')

    expect(uptimeConfig).not.toContain('monitors:')
    expect(configTypes).not.toContain('monitors: MonitorTarget[]')
    expect(configTypes).not.toContain('kvWriteCooldownMinutes')
    expect(repository).not.toContain('workerConfig')
  })

  test('monitor config keeps only fields supported by current admin and runtime UX', () => {
    const configTypes = read('types/config.ts')
    const adminApi = read('src/lib/admin-monitor-api.ts')
    const repository = read('src/lib/monitor-repository.ts')
    const configurationDoc = read('docs/configuration.md')

    for (const removedField of ['tooltip', 'hideLatencyChart']) {
      expect(configTypes).not.toContain(`${removedField}?`)
      expect(adminApi).not.toContain(`'${removedField}'`)
      expect(repository).not.toContain(`'${removedField}'`)
      expect(configurationDoc).not.toContain(removedField)
    }

    expect(configTypes).toContain('  body?: string')
    expect(adminApi).toContain("'body'")
    expect(repository).toContain("'body'")
    expect(configurationDoc).toContain('- `body`')
  })

  test('public status loader filters compacted state to enabled monitors', () => {
    const serverData = read('src/lib/server-data.ts')

    expect(serverData).toContain('filterCompactedState')
    expect(serverData).toContain('monitors.map((monitor) => monitor.id)')
  })

  test('admin monitor list disables selection while an action is pending', () => {
    const adminList = read('src/components/admin-monitor-list.tsx')

    expect(adminList).toMatch(
      /className="admin-monitor-main"[\s\S]*disabled=\{disabled\}[\s\S]*onClick=\{\(\) => onSelect\(monitor\)\}/
    )
  })

  test('local scheduled trigger docs use the protected admin trigger', () => {
    const readme = read('README.md')
    const deploymentDoc = read('docs/deployment.md')
    const viteConfig = read('vite.config.ts')

    expect(viteConfig).toContain('port: 3000')
    expect(readme).toContain('/admin/monitors')
    expect(readme).toContain('/api/admin/scheduled')
    expect(deploymentDoc).toContain('/admin/monitors')
    expect(deploymentDoc).toContain('/api/admin/scheduled')
  })

  test('route tests are ignored by the file route generator', () => {
    const viteConfig = read('vite.config.ts')

    expect(viteConfig).toContain('routeFileIgnorePattern')
    expect(viteConfig).toContain('test')
  })

  test('empty status state exposes a manual refresh action', () => {
    const indexRoute = read('src/routes/index.tsx')

    expect(indexRoute).toContain('暂无监控状态')
    expect(indexRoute).toContain('刷新状态')
    expect(indexRoute).toContain('router.invalidate()')
  })

  test('maintenance summary recalculates as client time changes', () => {
    const overallStatus = read('src/components/overall-status.tsx')

    expect(overallStatus).toMatch(/useMemo\([\s\S]*currentTime[\s\S]*\[maintenances, monitors, currentTime\]/)
  })

  test('status APIs reuse the compacted state wrapper helper', () => {
    const serverData = read('src/lib/server-data.ts')
    const dataApi = read('src/routes/api.data.ts')
    const badgeApi = read('src/routes/api.badge.ts')

    expect(serverData).toContain('readCompactedStateWrapper')
    expect(dataApi).toContain('readCompactedStateWrapper')
    expect(dataApi).not.toContain('JSON.stringify(compactedState)')
    expect(dataApi).not.toContain('await import')
    expect(badgeApi).toContain('readCompactedStateWrapper')
    expect(badgeApi).not.toContain('JSON.stringify(compactedState)')
  })

  test('badge API uses the shared complete-state guard', () => {
    const badgeApi = read('src/routes/api.badge.ts')

    expect(badgeApi).toContain('hasCompleteMonitorState')
    expect(badgeApi.indexOf('hasCompleteMonitorState(wrapper, monitorId)')).toBeLessThan(
      badgeApi.indexOf('const incidentCount = wrapper.incidentLen(monitorId)')
    )
  })

  test('public status surfaces only expose enabled monitors', () => {
    const serverData = read('src/lib/server-data.ts')
    const dataApi = read('src/routes/api.data.ts')
    const badgeApi = read('src/routes/api.badge.ts')

    expect(serverData).toContain('listEnabledMonitors')
    expect(dataApi).toContain('listEnabledMonitors')
    expect(badgeApi).toContain('listEnabledMonitors')
  })

  test('local secret file is ignored and documented with an example', () => {
    const gitignore = read('.gitignore')
    const deploymentDoc = read('docs/deployment.md')
    const configurationDoc = read('docs/configuration.md')
    const example = read('.dev.vars.example')

    expect(gitignore).toContain('.dev.vars')
    expect(gitignore).toContain('.dev.vars.*')
    expect(example).toContain('BASIC_AUTH_USERNAME')
    expect(example).toContain('BASIC_AUTH_PASSWORD')
    expect(example).toContain('FEISHU_WEBHOOK_URL')
    expect(deploymentDoc).toContain('cp .dev.vars.example .dev.vars')
    expect(configurationDoc).toContain('.dev.vars.example')
  })

  test('production build output scrubs local secret files', () => {
    const rootPackage = JSON.parse(read('package.json'))

    expect(rootPackage.scripts.build).toContain('vite build')
    expect(rootPackage.scripts.build).toContain('rm -f dist/server/.dev.vars')
  })

  test('local development docs prepare secrets before starting the dev server', () => {
    const deploymentDoc = read('docs/deployment.md')

    expect(deploymentDoc.indexOf('cp .dev.vars.example .dev.vars')).toBeGreaterThan(-1)
    expect(deploymentDoc.indexOf('cp .dev.vars.example .dev.vars')).toBeLessThan(
      deploymentDoc.indexOf('bun run dev')
    )
  })

  test('admin monitor page uses protected admin APIs instead of server functions', () => {
    const adminPage = read('src/routes/admin.monitors.tsx')

    expect(adminPage).not.toContain('createServerFn')
    expect(adminPage).not.toContain('monitor-repository')
    expect(adminPage).toContain("apiRequest('/api/admin/monitors')")
  })

  test('admin JSON import uses one server-side batch API', () => {
    const adminPage = read('src/routes/admin.monitors.tsx')
    const importRoute = read('src/routes/api.admin.monitors.import.ts')

    expect(adminPage).toContain("apiRequest('/api/admin/monitors/import'")
    expect(adminPage).not.toContain('for (const monitor of parsed.monitors)')
    expect(importRoute).toContain('importMonitors')
  })

  test('admin page can trigger one scheduled check through a protected API', () => {
    const adminPage = read('src/routes/admin.monitors.tsx')
    const scheduledRoute = read('src/routes/api.admin.scheduled.ts')
    const routeTree = read('src/routeTree.gen.ts')

    expect(adminPage).toContain("apiRequest('/api/admin/scheduled'")
    expect(adminPage).toContain('触发检查')
    expect(scheduledRoute).toContain('monitorWorker.scheduled')
    expect(scheduledRoute).toContain('scheduledTime: Date.now()')
    expect(routeTree).toContain('/api/admin/scheduled')
  })

  test('admin monitor deletion clears stored incident and latency state', () => {
    const deleteRoute = read('src/routes/api.admin.monitors.$id.ts')

    expect(deleteRoute).toContain('deleteMonitorState')
    expect(deleteRoute).toContain("getFromStore(d1Env, 'state')")
    expect(deleteRoute).toContain("setToStore(d1Env, 'state'")
  })

  test('client-facing modules do not import server-only uptime config', () => {
    const clientFiles = [
      ...filesUnder('src/components'),
      ...filesUnder('src/routes').filter((file) => !file.includes('/api.')),
      'src/lib/status.ts',
    ].filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.test.ts'))

    for (const file of clientFiles) {
      expect(read(file)).not.toContain('uptime.config')
    }
  })
})
