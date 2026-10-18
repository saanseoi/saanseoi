import { expect, test } from 'bun:test'
import { basemapManifestSchema, manifestChanges, manifestStats } from './basemapRelease'

const manifest = basemapManifestSchema.parse({
  createdAt: '2026-10-02T00:00:00Z',
  region: { code: 'hk', description: 'Hong Kong' },
  release: {
    version: '2026-10-01',
    schema: { version: 'protomaps-v4.0', base: 'Protomaps Basemaps v2' },
    archive: { tileset: 'hongkong.pmtiles', size: 100, sha256: 'old' },
  },
})
test('compares changed, added and removed manifest fields without timestamp churn', () => {
  const next = structuredClone(manifest)
  next.createdAt = '2026-11-02T00:00:00Z'
  next.release.version = '2026-11-01'
  next.release.archive.size = 120
  delete next.release.archive.sha256
  next.release.boundary = { source: 'source-pbf' }
  expect(manifestChanges(manifest, next)).toEqual([
    { label: 'Archive SHA-256', before: 'old', after: 'Not supplied' },
    { label: 'PMTiles archive', before: '100', after: '120' },
    { label: 'Boundary source', before: 'Not supplied', after: 'source-pbf' },
  ])
})
test('absent optional statistics are not reported as zero', () => {
  expect(manifestStats(manifest)).toEqual([{ label: 'PMTiles archive', value: '100' }])
  expect(manifestChanges(manifest, manifest)).toEqual([])
})
test('rejects invalid manifests and negative archive sizes', () => {
  expect(basemapManifestSchema.safeParse({}).success).toBe(false)
  expect(
    basemapManifestSchema.safeParse({
      ...manifest,
      release: { ...manifest.release, archive: { tileset: 'x', size: -1 } },
    }).success,
  ).toBe(false)
})

test('accepts historical provenance without a declared schema', () => {
  const historical = structuredClone(manifest)
  delete historical.release.schema
  const parsed = basemapManifestSchema.parse(historical)
  expect(parsed.release.version).toBe('2026-10-01')
  expect(parsed.release.schema).toBeUndefined()
})
