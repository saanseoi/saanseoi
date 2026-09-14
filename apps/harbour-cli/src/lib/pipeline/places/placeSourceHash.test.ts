import { expect, test } from 'bun:test'
import { hashPlaceSource } from './placeSourceHash.ts'

const row = {
  id: 'place',
  version: 5,
  names: { primary: 'Honey Cat Hotel' },
  confidence: 0.95,
  sources: [
    { dataset: 'meta', updateTime: '2026-01-01', confidence: 0.95 },
    { dataset: 'Overture', update_time: '2026-01-02', version: '2026-01-02' },
  ],
}

test('source timestamps are ignored without mutating retained publisher values', async () => {
  const original = structuredClone(row)
  const withoutTimestamps = {
    ...row,
    sources: row.sources.map(({ updateTime, update_time, ...source }) => source),
  }
  const refreshed = {
    ...row,
    version: 6,
    sources: row.sources.map(source => ({
      ...source,
      version: 7,
      updateTime: '2026-02-01',
      update_time: '2026-02-01',
    })),
  }
  expect(await hashPlaceSource(refreshed)).toBe(await hashPlaceSource(row))
  expect(await hashPlaceSource(withoutTimestamps)).toBe(await hashPlaceSource(row))
  expect(row).toEqual(original)
})

test('publisher content and other metadata remain hash-significant', async () => {
  const baseline = await hashPlaceSource(row)
  for (const changed of [
    { ...row, confidence: 0.96 },
    { ...row, names: { primary: 'Another name' } },
    ...['dataset', 'confidence', 'provider', 'resource', 'license'].map(field => ({
      ...row,
      sources: row.sources.map(source => ({ ...source, [field]: 'changed' })),
    })),
  ]) {
    expect(await hashPlaceSource(changed)).not.toBe(baseline)
  }
})
