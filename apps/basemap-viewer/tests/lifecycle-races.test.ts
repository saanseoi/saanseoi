import { describe, expect, it } from 'vitest'
import { LatestLoad, type LoadOperation } from '../src/lib/load-operation'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(value => {
    resolve = value
  })
  return { promise, resolve }
}

async function publishLatest<T>(
  slot: LatestLoad,
  operation: LoadOperation,
  work: Promise<T>,
  publish: (value: T) => void,
): Promise<void> {
  const value = await work
  if (slot.isCurrent(operation)) publish(value)
}

describe('latest-load publication rules', () => {
  it('publishes only the current operation when an earlier fetch finishes late', async () => {
    const primary = new LatestLoad()
    const first = deferred<string>()
    const second = deferred<string>()
    const applied: string[] = []
    const firstOperation = primary.begin()
    const firstLoad = publishLatest(primary, firstOperation, first.promise, value =>
      applied.push(value),
    )
    const secondOperation = primary.begin()
    const secondLoad = publishLatest(primary, secondOperation, second.promise, value =>
      applied.push(value),
    )

    first.resolve('old-region')
    second.resolve('selected-region')
    await Promise.all([firstLoad, secondLoad])

    expect(applied).toEqual(['selected-region'])
  })

  it('does not publish an operation after it is cancelled', async () => {
    const comparison = new LatestLoad()
    const pending = deferred<string>()
    const applied: string[] = []
    const operation = comparison.begin()
    const load = publishLatest(comparison, operation, pending.promise, value =>
      applied.push(value),
    )

    comparison.cancel()
    pending.resolve('cleared-comparison')
    await load

    expect(applied).toEqual([])
  })

  it('publishes a current comparison operation', async () => {
    const comparison = new LatestLoad()
    const pending = deferred<string>()
    const applied: string[] = []
    const operation = comparison.begin()
    const load = publishLatest(comparison, operation, pending.promise, value =>
      applied.push(value),
    )

    pending.resolve('comparison-with-current-theme')
    await load

    expect(applied).toEqual(['comparison-with-current-theme'])
  })

  it('ignores a result from an operation superseded by a replacement', async () => {
    const primary = new LatestLoad()
    const first = deferred<string>()
    const second = deferred<string>()
    const errors: string[] = []
    const firstOperation = primary.begin()
    const firstLoad = publishLatest(primary, firstOperation, first.promise, value =>
      errors.push(value),
    )
    const secondOperation = primary.begin()
    const secondLoad = publishLatest(primary, secondOperation, second.promise, value =>
      errors.push(value),
    )

    first.resolve('stale-source-error')
    second.resolve('current-source-error')
    await Promise.all([firstLoad, secondLoad])

    expect(errors).toEqual(['current-source-error'])
  })
})
