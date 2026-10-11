import { expect, test } from 'bun:test'
import { assertStreetSourceHashes } from './streetProvenance.ts'

test('Street audit rejects missing and changed delivered source evidence', () => {
  const records = [{ base: { id: 'baseline' }, sourceHash: 'original' }]
  expect(() => assertStreetSourceHashes(records, [])).toThrow('baseline')
  expect(() =>
    assertStreetSourceHashes(records, [
      { sourceRecordId: 'baseline', versionHash: 'changed' },
    ]),
  ).toThrow('baseline')
  expect(() =>
    assertStreetSourceHashes(records, [
      { sourceRecordId: 'baseline', versionHash: 'original' },
    ]),
  ).not.toThrow()
})
