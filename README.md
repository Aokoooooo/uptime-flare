# Uptime Flare

轻量、快速、现代化的 Cloudflare 服务状态页。核心监控逻辑运行在 Cloudflare Worker 定时任务中，持续检查你配置的服务，并把状态写入 D1；前端使用 TanStack Start 渲染状态页和 API。

## 技术栈

- 前端：TanStack Start、React、Vite
- 图表：uPlot
- 日期：dayjs
- 样式：自定义 CSS
- 运行环境：Cloudflare Workers
- 存储：Cloudflare D1
- 监控任务：同一个 Worker 内的 Cron Trigger

## 功能

- HTTP/HTTPS/TCP 监控
- 自定义 HTTP method 和 headers
- 自定义 HTTP 请求体
- 自定义状态码、响应关键字、禁用关键字
- 90 天可用率条形图
- 响应时间图表
- 维护窗口和事件记录
- D1 管理页维护监控项
- `/api/data` 状态 JSON API
- `/api/badge` Shields 兼容 badge API
- Webhook 通知
- 可选 Globalping 或自定义 proxy 检查

项目不包含多语言切换，界面默认中文。

## 快速开始

环境要求：

- Node.js 22.18.0 或更高版本
- Bun 1.3.14 或更高版本

安装依赖：

```bash
bun install
```

初始化本地 D1：

```bash
bun run d1:init
```

创建本地开发环境变量文件：

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` 只用于本地开发，已在 `.gitignore` 中忽略。不要提交真实账号、密码或 webhook。

启动状态页和监控 Worker：

```bash
bun run dev
```

本地触发 Worker 定时任务：

```bash
curl "http://127.0.0.1:3000/__scheduled"
```

## 配置监控项

监控项存储在 D1，通过管理页维护：

```text
/admin/monitors
```

管理页需要 Basic Auth。部署前设置 Worker secrets：

```bash
wrangler secret put BASIC_AUTH_USERNAME
wrangler secret put BASIC_AUTH_PASSWORD
```

页面展示配置写在 `public.config.ts`：

```ts
const pageConfig = {
  title: '服务状态',
  links: [{ link: 'https://example.com', label: '官网', highlight: true }],
}
```

维护窗口、通知和回调写在 server-only 的 `uptime.config.ts`：

```ts
const workerConfig = {
  stateWriteCooldownMinutes: 3,
}
```

更多配置见 [配置文档](docs/configuration.md)。

## 部署

状态页和监控任务部署为同一个 Cloudflare Worker：

1. 创建 D1 数据库并执行 `init.sql`
2. 在 `wrangler.toml` 写入 D1 `database_id`
3. 在根目录执行 `bun run deploy`
4. Cron Trigger 已在 `wrangler.toml` 配置为每分钟一次

详细步骤见 [部署文档](docs/deployment.md)。

## 常用命令

```bash
bun x tsc --noEmit
bun run build
bun test
```

## 项目结构

```text
src/                 TanStack Start 状态页
src/routes/          页面路由和 API 路由
src/components/      UI 组件
src/lib/             状态计算、日期格式化、服务端数据读取
src/monitoring/      定时监控、D1 读写、通知和远程检查
types/               共享类型
public.config.ts     页面展示配置
uptime.config.ts     维护、通知和回调配置
init.sql             D1 初始化 SQL
```

## API

状态数据：

```text
GET /api/data
```

Badge：

```text
GET /api/badge?id=<monitor-id>
```

可选参数：

- `label`
- `up`
- `down`
- `colorUp`
- `colorDown`
