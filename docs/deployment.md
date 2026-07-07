# 部署文档

本项目部署为一个 Cloudflare Worker：

- `fetch` 处理 TanStack Start 状态页和 API
- `scheduled` 按 Cron Trigger 检查服务并写入 D1
- `RemoteChecker` Durable Object 处理 `worker://` 远程检查

这个 Worker 绑定一个 D1 数据库。

## 1. 创建 D1 数据库

```bash
wrangler d1 create uptime_flare
```

把返回的 `database_id` 写入：

- `wrangler.toml`

确保配置的 binding 是：

```toml
binding = "UPTIMEFLARE_D1"
```

## 2. 初始化 D1 表

```bash
wrangler d1 execute uptime_flare --remote --file=init.sql
```

`init.sql` 会在 D1 数据库中创建两张表：

- `monitor_state`：存储定时检查写入的压缩状态数据
- `monitors`：存储管理页维护的监控项配置

初始化后通过 `/admin/monitors` 创建或导入监控项。

当前初始化脚本面向新 schema，不迁移旧版本的 `uptimeflare` 状态表。升级已有实例时，需要重新导入监控项；历史状态会在后续 Cron 检查后重新生成。

本地开发使用：

```bash
bun run d1:init
```

等价的手动命令是：

```bash
wrangler d1 execute uptime_flare --local --file=init.sql --persist-to .wrangler-local/state
```

## 3. 部署状态页

构建需要 Node.js 22.18.0 或更高版本；Cloudflare Vite 插件依赖该版本后的 `node:module.registerHooks`。

在仓库根目录执行：

```bash
bun install
bun run build
wrangler deploy --config dist/server/wrangler.json
```

也可以直接使用：

```bash
bun run deploy
```

`wrangler.toml` 已包含 Cron Trigger：

```text
* * * * *
```

即每分钟检查一次。

管理页 `/admin/monitors` 和管理 API `/api/admin/*` 使用 Basic Auth，部署前配置 Worker secrets：

```bash
wrangler secret put BASIC_AUTH_USERNAME
wrangler secret put BASIC_AUTH_PASSWORD
```

如需故障通知到飞书自定义机器人，部署前配置 Worker secret：

```bash
wrangler secret put FEISHU_WEBHOOK_URL
```

未配置 `FEISHU_WEBHOOK_URL` 时不会发送飞书通知。

## 4. 本地开发

复制本地环境变量示例文件：

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` 只用于本地开发，已在 `.gitignore` 中忽略。不要提交真实账号、密码或 webhook。

本地 Basic Auth 和飞书通知可在 `.dev.vars` 中配置：

```dotenv
BASIC_AUTH_USERNAME="admin"
BASIC_AUTH_PASSWORD="change-me"
FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/..."
```

启动状态页和监控 Worker：

```bash
bun run dev
```

触发一次本地检查：

- 打开 `/admin/monitors`
- 点击“触发检查”

也可以直接调用受 admin 鉴权保护的 API：

```bash
curl -X POST "http://127.0.0.1:3000/api/admin/scheduled"
```

## 5. 验证

部署后先访问 `/admin/monitors` 创建或导入监控项。首次运行前状态页可能显示“暂无监控状态”。触发或等待 Cron 执行后，Worker 会写入 D1，状态页会开始展示监控结果。

常用检查：

```bash
curl https://<your-domain>/api/data
curl https://<your-domain>/api/badge?id=<monitor-id>
```

## 6. 常见问题

### 状态页一直显示暂无监控状态

检查：

- D1 是否执行了 `init.sql`
- `/admin/monitors` 是否已经创建监控项
- Worker 是否绑定了 `UPTIMEFLARE_D1`
- Worker 是否配置 Cron Trigger
- Worker 日志是否有检查结果

### 本地 D1 提示 no such table

执行：

```bash
bun run d1:init
```

### 修改监控配置后没有生效

监控项由 D1 管理。访问 `/admin/monitors` 修改监控项，保存后下次 Cron 检查自动生效。
