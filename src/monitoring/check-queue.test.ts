import { describe, expect, test } from 'bun:test'
import pLimit from 'p-limit'
import { runCheckQueue, runWithRetry } from './check-queue'

type Result = { id: string; status: { up: boolean; ping: number; err: string } }

describe('monitor check queue', () => {
  test('returns the first successful result without retrying', async () => {
    let attempts = 0
    const waits: number[] = []

    const result = await runWithRetry(
      async () => {
        attempts++
        return { up: true, value: 'first' }
      },
      (value) => value.up,
      async (ms) => {
        waits.push(ms)
      }
    )

    expect(result.value).toBe('first')
    expect(attempts).toBe(1)
    expect(waits).toEqual([])
  })

  test('returns only the retry result after waiting three seconds', async () => {
    let attempts = 0
    const waits: number[] = []
    const retryResult = { up: false, ping: 25, err: 'second failure' }

    const result = await runWithRetry(
      async () => {
        attempts++
        return attempts === 1 ? { up: false, ping: 9000, err: 'first failure' } : retryResult
      },
      (value) => value.up,
      async (ms) => {
        waits.push(ms)
      }
    )

    expect(result).toBe(retryResult)
    expect(attempts).toBe(2)
    expect(waits).toEqual([3000])
  })

  test('retries when the first queued check rejects', async () => {
    let attempts = 0
    const waits: number[] = []
    const retryResult = { up: true, ping: 12, err: '' }

    const result = await runWithRetry(
      async () => {
        attempts++
        if (attempts === 1) throw new Error('first check crashed')
        return retryResult
      },
      (value) => value.up,
      async (ms) => {
        waits.push(ms)
      }
    )

    expect(result).toBe(retryResult)
    expect(attempts).toBe(2)
    expect(waits).toEqual([3000])
  })

  test('releases the concurrency slot while waiting to enqueue the retry', async () => {
    const limit = pLimit(1)
    const events: string[] = []
    let attempts = 0
    let waitStarted!: () => void
    let finishWait!: () => void
    const started = new Promise<void>((resolve) => {
      waitStarted = resolve
    })
    const waiting = new Promise<void>((resolve) => {
      finishWait = resolve
    })

    const retrying = runWithRetry(
      () =>
        limit(async () => {
          attempts++
          events.push(`check-${attempts}`)
          return { up: attempts === 2 }
        }),
      (value) => value.up,
      async () => {
        waitStarted()
        await waiting
      }
    )

    await started
    await limit(async () => {
      events.push('other')
    })
    expect(events).toEqual(['check-1', 'other'])

    finishWait()
    await retrying
    expect(events).toEqual(['check-1', 'other', 'check-2'])
  })

  test('isolates a second rejection as the failed monitor result', async () => {
    const attempts = new Map<string, number>()

    const results = await runCheckQueue(
      ['broken', 'healthy'],
      async (id): Promise<Result> => {
        attempts.set(id, (attempts.get(id) ?? 0) + 1)
        if (id === 'broken') throw new Error(`failure-${attempts.get(id)}`)
        return { id, status: { up: true, ping: 8, err: '' } }
      },
      (result) => result.status.up,
      (id, error) => ({
        id,
        status: { up: false, ping: 0, err: error instanceof Error ? error.message : String(error) },
      }),
      { retryWait: async () => {} }
    )

    expect(results).toEqual([
      { id: 'broken', status: { up: false, ping: 0, err: 'failure-2' } },
      { id: 'healthy', status: { up: true, ping: 8, err: '' } },
    ])
    expect(attempts.get('broken')).toBe(2)
  })

  test('queues every first attempt before a retry', async () => {
    const attempts = new Map<string, number>()
    const events: string[] = []

    await runCheckQueue(
      ['a', 'b'],
      async (id): Promise<Result> => {
        const attempt = (attempts.get(id) ?? 0) + 1
        attempts.set(id, attempt)
        events.push(`${id}-${attempt}`)
        return { id, status: { up: id === 'b' || attempt === 2, ping: 1, err: '' } }
      },
      (result) => result.status.up,
      (id, error) => ({
        id,
        status: { up: false, ping: 0, err: String(error) },
      }),
      { concurrency: 1, retryWait: async () => {} }
    )

    expect(events).toEqual(['a-1', 'b-1', 'a-2'])
  })

  test('never exceeds the configured concurrency', async () => {
    let active = 0
    let peak = 0

    await runCheckQueue(
      [1, 2, 3, 4, 5, 6],
      async (id): Promise<Result> => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 0))
        active--
        return { id: String(id), status: { up: true, ping: 1, err: '' } }
      },
      (result) => result.status.up,
      (id, error) => ({
        id: String(id),
        status: { up: false, ping: 0, err: String(error) },
      }),
      { concurrency: 2 }
    )

    expect(peak).toBe(2)
  })
})
