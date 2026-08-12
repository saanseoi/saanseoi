import { describe, expect, it } from 'vitest'
import { LatestLoad } from '../src/lib/load-operation'

describe('latest load coordination', () => {
  it('aborts and supersedes the previous operation', () => {
    const loads = new LatestLoad()
    const first = loads.begin()
    const second = loads.begin()

    expect(first.abortController.signal.aborted).toBe(true)
    expect(first.generation).not.toBe(second.generation)
    expect(loads.isCurrent(first)).toBe(false)
    expect(loads.isCurrent(second)).toBe(true)
  })

  it('invalidates the current operation when cancelled', () => {
    const loads = new LatestLoad()
    const operation = loads.begin()

    loads.cancel()

    expect(operation.abortController.signal.aborted).toBe(true)
    expect(loads.isCurrent(operation)).toBe(false)
  })
})
