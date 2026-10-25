import { expect, test } from 'bun:test'
import { historySchema } from '@repo/db'
import { exportFixture } from './fixtures.test-support'
import { prepareReleaseExports } from './prepare'
import { exportPrefix, type ExportManifest, type ExportSelection } from './contracts'
import { expireReleaseExports, listExportReleases } from './retention'

const selection: ExportSelection = {
  apiReleaseSetId: 'release',
  apiVersion: 'api-divisions-v0.2',
  family: 'divisions',
  region: 'hk',
  domain: 'geographic',
  snapshots: [
    { snapshotId: 'child', resourceType: 'division', variant: 'saanseoi' },
    { snapshotId: 'areas', resourceType: 'divisionArea', variant: 'saanseoi' },
  ],
}
const event = {
  operation: 'upsert' as const,
  versionHash: 'v1',
  createdAt: '2026-01-01T00:00:00.000Z',
}

test('prepares inherited names, branched hierarchies, points/bounds and canonical areas; retries verify files', async () => {
  const f = exportFixture()
  try {
    f.snapshot('base', 'division')
    f.snapshot('child', 'division', 'base')
    f.snapshot('areas', 'divisionArea')
    await f.historyDb.insert(historySchema.divisions).values([
      {
        ...event,
        id: 'parent',
        snapshotId: 'base',
        class: 'district',
        hierarchies: { full: [] },
        divisionCode: 'CW',
      },
      {
        ...event,
        id: 'child',
        snapshotId: 'child',
        class: 'neighbourhood',
        hierarchies: {
          full: [
            [
              {
                id: 'parent',
                class: 'district',
                name: 'Parent',
                full_containment: false,
              },
            ],
          ],
        },
        geometry: { type: 'Point', coordinates: [114, 22] },
      },
      {
        ...event,
        id: 'gone',
        snapshotId: 'base',
        class: 'district',
        hierarchies: { full: [] },
      },
      {
        ...event,
        operation: 'delete',
        versionHash: null,
        id: 'gone',
        snapshotId: 'child',
      },
    ])
    await f.historyDb.insert(historySchema.divisionsI18n).values([
      {
        ...event,
        divisionId: 'parent',
        snapshotId: 'base',
        locale: 'zh-hant',
        name: '中西區',
      },
      {
        ...event,
        divisionId: 'parent',
        snapshotId: 'base',
        locale: 'fr',
        name: 'excluded',
      },
    ])
    await f.historyDb.insert(historySchema.divisionAreas).values({
      ...event,
      id: 'area',
      divisionId: 'child',
      snapshotId: 'areas',
      variant: 'saanseoi',
      type: 'land',
      bbox: [113, 21, 115, 23],
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [113, 21],
            [115, 21],
            [115, 23],
            [113, 21],
          ],
        ],
      },
    })
    await prepareReleaseExports({
      metaDb: f.db,
      shards: f.shards,
      bucket: f.bucket,
      selection,
    })
    const manifest = JSON.parse(
      f.objects.get(`${exportPrefix(selection)}manifest.json`)!.body,
    ) as ExportManifest
    const rows = (projection: string) =>
      manifest.projections[projection]!.files.filter(
        file => file.format === 'json',
      ).flatMap(file => JSON.parse(f.objects.get(file.key)!.body))
    expect(rows('names')).toHaveLength(2)
    expect(rows('names').find(row => row.id === 'parent').names).toEqual({
      en: null,
      'zh-Hant': '中西區',
      'zh-Hans': null,
    })
    expect(
      rows('hierarchies').find(row => row.id === 'child').hierarchies.full,
    ).toEqual([[{ id: 'parent', fullContainment: false }]])
    expect(rows('points').find(row => row.id === 'child').bbox).toEqual([
      113, 21, 115, 23,
    ])
    expect(Object.keys(manifest.projections).sort()).toEqual([
      'geometry',
      'hierarchies',
      'names',
      'points',
    ])
    await prepareReleaseExports({
      metaDb: f.db,
      shards: f.shards,
      bucket: f.bucket,
      selection,
    })
    f.objects.delete(manifest.projections.names!.files[0]!.key)
    await expect(
      prepareReleaseExports({
        metaDb: f.db,
        shards: f.shards,
        bucket: f.bucket,
        selection,
      }),
    ).rejects.toThrow('Missing or corrupt')
  } finally {
    f.meta.close()
    f.history.close()
  }
})

test('street names use geographic codes and mark spatial projections unimplemented', async () => {
  const f = exportFixture()
  try {
    f.snapshot('streets', 'street')
    f.meta.exec(
      "INSERT INTO divisionCodes(domainCode,divisionCode,canonicalId,divisionClass,versionHash) VALUES('geographic','CW','district','district','fixture')",
    )
    await f.historyDb.insert(historySchema.streets).values({
      ...event,
      id: 'street',
      snapshotId: 'streets',
      status: 'active',
      version: 1,
      districtIds: ['district'],
    })
    await f.historyDb.insert(historySchema.streetsI18n).values({
      ...event,
      streetId: 'street',
      snapshotId: 'streets',
      locale: 'en',
      name: 'Street',
    })
    const street: ExportSelection = {
      ...selection,
      family: 'streets',
      domain: 'physical',
      apiVersion: 'api-streets-v0.1',
      snapshots: [
        { snapshotId: 'streets', resourceType: 'street', variant: 'hkgov-landsd' },
      ],
    }
    await prepareReleaseExports({
      metaDb: f.db,
      shards: f.shards,
      bucket: f.bucket,
      selection: street,
    })
    const manifest = JSON.parse(
      f.objects.get(`${exportPrefix(street)}manifest.json`)!.body,
    ) as ExportManifest
    expect(manifest.projections.points).toEqual({
      status: 'not_implemented',
      files: [],
    })
    const rows = JSON.parse(
      f.objects.get(manifest.projections.names!.files[0]!.key)!.body,
    )
    expect(rows[0].divisionCodes).toEqual(['CW'])
    expect(rows[0].names).toEqual({ en: 'Street', 'zh-Hant': null, 'zh-Hans': null })
  } finally {
    f.meta.close()
    f.history.close()
  }
})

test('retention keeps latest plus predecessor by cohort, excludes drafts and never deletes unrelated assets', async () => {
  const f = exportFixture()
  try {
    f.snapshot('child', 'division')
    f.snapshot('areas', 'divisionArea')
    for (const [id, cohort, status] of [
      ['old', '2024', 'archived'],
      ['previous', '2025', 'archived'],
      ['latest', '2026', 'current'],
      ['draft', '2027', 'draft'],
    ]) {
      const release = { ...selection, apiReleaseSetId: id! }
      f.release(release, cohort!, status!)
      f.objects.set(`${exportPrefix(release)}manifest.json`, { body: '{}' })
    }
    f.objects.set('sources/retained.parquet', { body: 'source' })
    expect((await listExportReleases(f.db, selection)).map(row => row.id)).toEqual([
      'latest',
      'previous',
      'old',
    ])
    await expireReleaseExports(f.db, f.bucket, selection)
    expect([...f.objects.keys()]).toHaveLength(4)
    expect(
      f.objects.has(
        `${exportPrefix({ ...selection, apiReleaseSetId: 'old' })}manifest.json`,
      ),
    ).toBe(false)
    expect(f.objects.has('sources/retained.parquet')).toBe(true)
  } finally {
    f.meta.close()
    f.history.close()
  }
})
