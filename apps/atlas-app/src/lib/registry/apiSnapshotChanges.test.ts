import { describe, expect, test } from 'bun:test'
import { compareSnapshotRecords, snapshotContent } from './apiSnapshotChanges'

describe('assembled snapshot changes', () => {
  test('ignores storage metadata and compares translations by locale', () => {
    const before = snapshotContent({
      id: 'a',
      name: 'Hill',
      versionHash: 'old',
      snapshotId: 'old',
      updatedAt: 'old',
    })
    const after = snapshotContent({
      id: 'a',
      name: 'Hill',
      versionHash: 'new',
      snapshotId: 'new',
      updatedAt: 'new',
    })
    expect(
      compareSnapshotRecords(new Map([['a', before]]), new Map([['a', after]])).counts
        .unchanged,
    ).toBe(1)
    const result = compareSnapshotRecords(
      new Map([['a', { ...before, translations: { en: { name: 'Hill' } } }]]),
      new Map([['a', { ...after, translations: { en: { name: 'Mountain' } } }]]),
    )
    expect(result.records[0]?.type).toBe('changed')
    expect(result.records[0]?.fields[0]?.path).toEqual(['translations', 'en', 'name'])
  })
  test('includes additions and deletions with deterministic pagination order', () => {
    const result = compareSnapshotRecords(
      new Map([
        ['z', { id: 'z' }],
        ['b', { id: 'b' }],
      ]),
      new Map([
        ['a', { id: 'a' }],
        ['b', { id: 'b' }],
      ]),
    )
    expect(result.counts).toEqual({ added: 1, changed: 0, removed: 1, unchanged: 1 })
    expect(result.records.map(record => record.id)).toEqual(['a', 'z'])
    expect(result.total).toBe(2)
  })
})
