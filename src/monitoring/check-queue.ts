import pLimit from 'p-limit'

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export async function runWithRetry<T>(
  enqueue: () => Promise<T>,
  succeeded: (result: T) => boolean,
  retryWait: (ms: number) => Promise<void> = wait,
  finalFailure?: (error: unknown) => T
): Promise<T> {
  try {
    const firstResult = await enqueue()
    if (succeeded(firstResult)) return firstResult
  } catch (error) {
    console.error('[check-queue] First check attempt failed, retrying:', error)
    // The retry result is authoritative, so the first error is intentionally discarded.
  }

  await retryWait(3000)
  try {
    return await enqueue()
  } catch (error) {
    console.error('[check-queue] Retry attempt failed:', error)
    if (finalFailure) return finalFailure(error)
    throw error
  }
}

type CheckQueueOptions = {
  concurrency?: number
  retryWait?: (ms: number) => Promise<void>
}

export function runCheckQueue<TItem, TResult>(
  items: readonly TItem[],
  check: (item: TItem) => Promise<TResult>,
  succeeded: (result: TResult) => boolean,
  finalFailure: (item: TItem, error: unknown) => TResult,
  options: CheckQueueOptions = {}
): Promise<TResult[]> {
  const limit = pLimit(options.concurrency ?? 5)

  return Promise.all(
    items.map((item) =>
      runWithRetry(
        () => limit(() => check(item)),
        succeeded,
        options.retryWait,
        (error) => finalFailure(item, error)
      )
    )
  )
}
