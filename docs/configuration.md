# 配置文档

页面展示配置在 `public.config.ts` 中完成。维护窗口、通知和代码回调在 server-only 的 `uptime.config.ts` 中完成。监控项存储在 D1，通过 `/admin/monitors` 管理。

## 页面配置

页面配置会进入客户端 bundle，只放可以公开展示的字段。

```ts
const pageConfig = {
  title: '服务状态',
  favicon: '/favicon.png',
  logo: '/logo.svg',
  links: [{ link: 'https://example.com', label: '官网', highlight: true }],
  customFooter: '自定义页脚',
}
```

字段说明：

- `title`：页面标题和顶部品牌文字
- `favicon`：浏览器图标
- `logo`：顶部 logo
- `links`：顶部导航链接
- `group`：按组展示监控项
- `customFooter`：自定义页脚

## Worker 配置

Worker 配置写在 `uptime.config.ts`，不会被客户端组件直接引用。

```ts
const workerConfig = {
  stateWriteCooldownMinutes: 3,
}
```

`stateWriteCooldownMinutes` 控制状态写入 D1 的最短间隔，默认 3 分钟。监控项不再写在 `uptime.config.ts` 中。

## 监控配置

监控项通过 `/admin/monitors` 写入 D1。D1 中没有监控项时，状态页会显示空状态，定时任务不会执行检查。

管理页需要 Worker secrets：

```bash
wrangler secret put BASIC_AUTH_USERNAME
wrangler secret put BASIC_AUTH_PASSWORD
```

监控项字段：

- `id`：唯一 ID，用于状态存储、API 和 badge
- `name`：界面展示名称
- `method`：`GET`、`POST`、`HEAD`、`OPTIONS` 或 `TCP_PING`
- `target`：被检查的 URL；`TCP_PING` 使用 `host:port`
- `statusPageLink`：点击监控项时打开的链接
- `expectedCodes`：期望 HTTP 状态码，未配置时默认为 2xx
- `timeout`：超时时间，单位毫秒
- `headers`：HTTP 请求头
- `body`：HTTP 请求体，适用于需要 payload 的 `POST` 等检查
- `responseKeyword`：响应体必须包含的关键字
- `responseForbiddenKeyword`：响应体不能包含的关键字
- `expectedJson`：响应体 JSON 顶层字段必须匹配的值，例如 `{ code: 0 }`
- `checkProxy`：使用远程检查节点
- `checkProxyFallback`：proxy 失败时回退到本地检查

## TCP 端口监控

```ts
{
  id: 'database',
  name: '数据库端口',
  method: 'TCP_PING',
  target: 'db.example.com:5432',
  timeout: 10000,
}
```

## 分组展示

```ts
const pageConfig = {
  group: {
    核心服务: ['website', 'api'],
    后台服务: ['worker'],
  },
}
```

未写入 `group` 的 D1 监控项会自动显示在“未分组”中。分组状态统计只计算实际存在的监控项，避免静态分组里残留的旧 ID 影响展示。

## 维护窗口

```ts
const maintenances = [
  {
    title: '数据库升级',
    body: '计划维护期间服务可能短暂不可用。',
    monitors: ['api'],
    start: '2026-07-01T02:00:00+08:00',
    end: '2026-07-01T03:00:00+08:00',
  },
]
```

处于维护窗口的监控项不会发送故障通知。

## Webhook 通知

飞书自定义机器人可以直接通过 Worker 环境变量配置，不需要写进源码：

```bash
wrangler secret put FEISHU_WEBHOOK_URL
```

本地开发先复制示例文件：

```bash
cp .dev.vars.example .dev.vars
```

再在 `.dev.vars` 中设置真实值：

```dotenv
FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/..."
```

未配置 `FEISHU_WEBHOOK_URL` 且未配置 `workerConfig.notification.webhook` 时，Worker 只记录日志，不发送通知。

也可以在 `uptime.config.ts` 中配置通用 webhook：

```ts
const workerConfig = {
  notification: {
    timeZone: 'Asia/Shanghai',
    gracePeriod: 2,
    webhook: {
      url: 'https://example.com/webhook',
      payloadType: 'json',
      payload: {
        text: '$MSG',
      },
    },
  },
}
```

字段说明：

- `timeZone`：通知里使用的时区
- `gracePeriod`：故障持续多少分钟后再通知
- `skipNotificationIds`：不发送通知的监控项 ID
- `skipErrorChangeNotification`：错误原因变化时不重复通知
- `webhook`：一个 webhook 或 webhook 数组
- `FEISHU_WEBHOOK_URL`：可选环境变量；配置后会向飞书机器人发送文本消息

Webhook 支持：

- `payloadType: 'param'`
- `payloadType: 'json'`
- `payloadType: 'x-www-form-urlencoded'`

`payload` 中的 `$MSG` 会被替换为通知文本。

## Globalping 检查

```json
{
  "id": "website-global",
  "name": "官网海外检查",
  "method": "GET",
  "target": "https://example.com",
  "checkProxy": "globalping://<token>?magic=<location-magic>&ipVersion=4",
  "checkProxyFallback": true
}
```

Globalping 适合从指定地区检查服务可用性。

## 自定义检查 proxy

```json
{
  "id": "website-proxy",
  "name": "官网远程检查",
  "method": "GET",
  "target": "https://example.com",
  "checkProxy": "https://proxy.example.com/api",
  "checkProxyFallback": true
}
```

自定义 proxy 需要接收监控项 JSON，并返回：

```json
{
  "location": "remote",
  "status": {
    "ping": 123,
    "up": true,
    "err": ""
  }
}
```
