import { describe, expect, test } from 'bun:test'

import { runDivisionSqlImportOperations } from './processLocalDivisionSqlUpload.ts'

describe('division SQL import scheduling', () => {
  test('serialises remote operations', async () => {
    let active = 0
    let maximumActive = 0
    const completed: number[] = []
    const operations = [0, 1, 2, 3].map(index => async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      completed.push(index)
      active -= 1
    })

    await runDivisionSqlImportOperations(operations, true)

    expect(maximumActive).toBe(1)
    expect(completed).toEqual([0, 1, 2, 3])
  })

  test('retains parallel local operations', async () => {
    let active = 0
    let maximumActive = 0
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const operations = [0, 1, 2, 3].map(() => async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await gate
      active -= 1
    })

    const running = runDivisionSqlImportOperations(operations, false)
    await Promise.resolve()
    release?.()
    await running

    expect(maximumActive).toBe(4)
  })
})
