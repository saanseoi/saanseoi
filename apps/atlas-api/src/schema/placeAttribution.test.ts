import { expect, test } from 'bun:test'
import { PlaceSourcesSchema } from './places'

test('source attribution requires publisher and dataset identities', () => {
  for (const item of [
    {},
    { publisherCode: 'meta' },
    { dataset: 'meta' },
    { publisherCode: null, dataset: 'meta' },
  ])
    expect(PlaceSourcesSchema.safeParse([item]).success).toBe(false)
  expect(
    PlaceSourcesSchema.safeParse([
      { publisherCode: 'meta', dataset: 'meta', property: null, version: '4' },
    ]).success,
  ).toBe(true)
})
test('source attribution excludes release and processing evidence and validates pointers', () => {
  for (const extra of [
    { release: '2026-09' },
    { versionHash: 'hash' },
    { divisionAssociation: {} },
    { property: 'name' },
    { property: '/bad~token' },
  ])
    expect(
      PlaceSourcesSchema.safeParse([
        { publisherCode: 'meta', dataset: 'meta', ...extra },
      ]).success,
    ).toBe(false)
  expect(
    PlaceSourcesSchema.safeParse([
      { publisherCode: 'meta', dataset: 'meta', property: '/a~1b/0' },
    ]).success,
  ).toBe(true)
})
