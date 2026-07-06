import { describe, expect, test } from 'bun:test'
import { getNotificationWebhooks, redactWebhookUrl } from './util'

describe('notification webhook configuration', () => {
  test('does not notify when no webhook is configured', () => {
    expect(getNotificationWebhooks({})).toEqual([])
  })

  test('uses FEISHU_WEBHOOK_URL as a Feishu robot text webhook', () => {
    expect(
      getNotificationWebhooks({
        FEISHU_WEBHOOK_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/example',
      })
    ).toEqual([
      {
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/example',
        method: 'POST',
        payloadType: 'json',
        payload: {
          msg_type: 'text',
          content: {
            text: '$MSG',
          },
        },
      },
    ])
  })

  test('redacts webhook secrets in logs', () => {
    const redacted = redactWebhookUrl(
      'https://open.feishu.cn/open-apis/bot/v2/hook/secret-token?debug=true'
    )

    expect(redacted).toBe('https://open.feishu.cn/***')
    expect(redacted).not.toContain('secret-token')
    expect(redacted).not.toContain('debug=true')
  })
})
