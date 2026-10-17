import { expect, test } from 'bun:test'
import { PlaceSourcesSchema } from './places'

test('source attribution requires publisher and dataset identities', () => {
  for (const item of [
    {},
    { publisher: 'meta' },
    { dataset: 'meta' },
    { publisher: null, dataset: 'meta' },
  ])
    expect(PlaceSourcesSchema.safeParse([item]).success).toBe(false)
  expect(
    PlaceSourcesSchema.safeParse([
      { publisher: 'meta', dataset: 'meta', property: null, version: '4' },
    ]).success,
  ).toBe(true)
})
test('source attribution excludes release and processing evidence and validates dot paths', () => {
  for (const extra of [
    { release: '2026-09' },
    { versionHash: 'hash' },
    { divisionAssociation: {} },
    { property: 'name..primary' },
    { property: '/bad~token' },
  ])
    expect(
      PlaceSourcesSchema.safeParse([{ publisher: 'meta', dataset: 'meta', ...extra }])
        .success,
    ).toBe(false)
  expect(
    PlaceSourcesSchema.safeParse([
      { publisher: 'meta', dataset: 'meta', property: 'properties.names.common.lfn' },
    ]).success,
  ).toBe(true)
})
