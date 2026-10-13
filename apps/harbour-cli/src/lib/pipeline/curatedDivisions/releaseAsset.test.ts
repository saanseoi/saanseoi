import { saanseoiSourcePayload } from '@repo/core/pipeline/services/sources/sourcePayload'
import { normaliseOvertureAttribution } from '@repo/core/pipeline/services/sources/sourceAttribution'
import { groupCuratedUpstreamAttribution } from './recordContract'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { prepareCuratedReleaseAsset } from './releaseAsset'
import { normaliseCuratedDivision } from '@repo/core/pipeline/services/divisions/curatedDivision'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true })))
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'curated-asset-'))
  directories.push(directory)
  return {
    directory,
    datasetCode: 'ds-hk-saanseoi-division',
    releaseCode: 'dr-hk-saanseoi-division-area-2026-09-01.0',
    resourceType: 'divisionArea' as const,
    sourceVersion: '2026-09-01.0',
    provenance: { baseline: { publisher: 'overture', cohortKey: '2026-08-19.0' } },
    rows: [
      { id: 'area', geometry: { coordinates: [[[1.23456789, 2]]] }, snapshotId: 'old' },
    ],
  }
}

test('archive preserves geometry and provenance and is stable across snapshot replay', async () => {
  const input = await fixture()
  const first = await prepareCuratedReleaseAsset(input)
  const zip = unzipSync(await readFile(first.filePath))
  expect(JSON.parse(strFromU8(zip['records.json']!))).toEqual({
    rows: [{ id: 'area', geometry: input.rows[0]!.geometry, sources: [] }],
  })
  expect(JSON.parse(strFromU8(zip['manifest.json']!)).provenance).toEqual(
    input.provenance,
  )
  const replay = await prepareCuratedReleaseAsset({
    ...input,
    rows: [
      {
        ...input.rows[0],
        snapshotId: 'new',
        createdAt: 'today',
        updatedAt: 'today',
        versionHash: 'history-hash',
        sourceReleaseId: 'upstream',
        validFromRelease: 'old',
        validToRelease: null,
        isCurrent: true,
      },
    ],
  })
  expect(replay.assetKey).toBe(first.assetKey)
  expect(replay.contentHash).toBe(first.contentHash)
  const changed = await prepareCuratedReleaseAsset({
    ...input,
    rows: [{ id: 'changed' }],
  })
  expect(changed.assetKey).not.toBe(first.assetKey)
})

test('division archive retains multilingual names', async () => {
  const input = await fixture()
  const asset = await prepareCuratedReleaseAsset({
    ...input,
    resourceType: 'division',
    names: [{ divisionId: 'area', locale: 'zh-hant', name: '香港' }],
  })
  const zip = unzipSync(await readFile(asset.filePath))
  expect(
    JSON.parse(strFromU8(zip['records.json']!)).rows[0].names['zh-hant'].name,
  ).toBe('香港')
})

test('SaanSeoi archives camelCase inherited JSON and preserve internal containment on ingestion', async () => {
  const input = await fixture()
  const original = {
    id: 'division',
    class: 'neighbourhood',
    geometry: { type: 'Point', coordinates: [114, 22] },
    cartography: { min_zoom: 14, max_zoom: 24 },
    hierarchies: {
      full: [
        [
          {
            id: 'parent',
            name: 'Parent',
            class: 'district',
            full_containment: true,
            containment_geometry: { division: 'sha256:a', ancestor: 'sha256:b' },
          },
        ],
      ],
    },
    sources: {
      overture: [
        {
          dataset: 'ds-hk-overture-division',
          record_id: 'native-id',
          update_time: 'date',
          extra_data: { nested_key: 'value' },
        },
      ],
    },
    identifiers: { 'LANDSD:GEO_NAME_ID': '1' },
  }
  const asset = await prepareCuratedReleaseAsset({
    ...input,
    resourceType: 'division',
    sourceReleases: [
      {
        datasetCode: 'ds-hk-overture-division',
        releaseCode: 'dr-overture',
        sourceVersion: '2026-08-19.0',
        resourceType: 'division',
        rawObjectKey: 'input',
        contentHash: 'hash',
        releaseNotesUrl: null,
      },
    ],
    rows: [original],
    names: [{ divisionId: 'division', locale: 'zh-hant', name: '地方' }],
  })
  const zip = unzipSync(await readFile(asset.filePath))
  const published = JSON.parse(strFromU8(zip['records.json']!)).rows[0]
  expect(published.cartography).toEqual({ minZoom: 14, maxZoom: 24 })
  expect(published.sources).toEqual([
    {
      publisher: 'overture',
      dataset: 'ds-hk-overture-division',
      recordId: 'native-id',
    },
  ])
  expect(published.hierarchies.full[0][0]).toMatchObject({
    fullContainment: true,
    containmentGeometry: { division: 'sha256:a', ancestor: 'sha256:b' },
  })
  expect(published.identifiers).toEqual({ 'hkgov-landsd': { geoNameId: '1' } })
  expect(published.names['zh-hant'].name).toBe('地方')
  const ingested = normaliseCuratedDivision({
    id: 'division',
    record: JSON.stringify(published),
  })
  expect(ingested.base.hierarchies.full[0]![0]).toMatchObject({
    full_containment: true,
    containment_geometry: { division: 'sha256:a', ancestor: 'sha256:b' },
  })
  expect(original.sources.overture[0]).toHaveProperty('record_id', 'native-id')
})

test('area archive serialises database flags as booleans and rejects invalid values', async () => {
  const input = await fixture()
  for (const [isLand, isTerritorial] of [
    [1, 0],
    [true, false],
    [null, null],
  ]) {
    const asset = await prepareCuratedReleaseAsset({
      ...input,
      rows: [{ ...input.rows[0], isLand, isTerritorial }],
    })
    const zip = unzipSync(await readFile(asset.filePath))
    expect(JSON.parse(strFromU8(zip['records.json']!)).rows[0]).toMatchObject({
      isLand: isLand == null ? null : true,
      isTerritorial: isTerritorial == null ? null : false,
    })
  }
  for (const field of ['isLand', 'isTerritorial'])
    for (const value of [2, -1, '0', 'false', [], {}])
      await expect(
        prepareCuratedReleaseAsset({
          ...input,
          rows: [{ ...input.rows[0], [field]: value }],
        }),
      ).rejects.toThrow(`requires boolean ${field}`)
})

test('archives omit Division bounds and retain selected area bounds', async () => {
  const input = await fixture()
  const bbox = [1, 2, 3, 4]
  for (const resourceType of ['division', 'divisionArea'] as const) {
    const asset = await prepareCuratedReleaseAsset({
      ...input,
      resourceType,
      rows: [{ id: 'record', geometry: { type: 'Point', coordinates: [1, 2] }, bbox }],
      names: [{ divisionId: 'record', locale: 'en', name: 'Record' }],
    })
    const zip = unzipSync(await readFile(asset.filePath))
    const row = JSON.parse(strFromU8(zip['records.json']!)).rows[0]
    if (resourceType === 'division') expect(row).not.toHaveProperty('bbox')
    else expect(row.bbox).toEqual(bbox)
  }
})

test('prepared archives retain GeoJSON member order despite deterministic record sorting', async () => {
  const input = await fixture()
  const asset = await prepareCuratedReleaseAsset({
    ...input,
    rows: [
      {
        id: 'area',
        geometry: { coordinates: [114, 22], bbox: [114, 22, 114, 22], type: 'Point' },
      },
    ],
  })
  const zip = unzipSync(await readFile(asset.filePath))
  const geometry = JSON.parse(strFromU8(zip['records.json']!)).rows[0].geometry
  expect(Object.keys(geometry)).toEqual(['type', 'bbox', 'coordinates'])
})

test('preprocessing carries inherited attribution and type order into the prepared archive', async () => {
  const input = await fixture()
  const sources = groupCuratedUpstreamAttribution(
    normaliseOvertureAttribution([
      {
        dataset: 'OpenStreetMap',
        property: '',
        record_id: 'n11402980091@2',
        license: 'ODbL-1.0',
      },
    ]),
  )
  sources.overture = [
    {
      publisher: 'overture',
      dataset: 'ds-hk-overture-division',
      recordId: 'division',
    },
  ]
  const asset = await prepareCuratedReleaseAsset({
    ...input,
    sourceReleases: [
      {
        datasetCode: 'ds-hk-overture-division',
        releaseCode: 'dr-overture',
        sourceVersion: '2026-08-19.0',
        resourceType: 'division',
        rawObjectKey: 'input',
        contentHash: 'hash',
        releaseNotesUrl: null,
      },
    ],
    rows: [{ id: 'division', sources }],
  })
  const zip = unzipSync(await readFile(asset.filePath))
  const [inherited, direct] = JSON.parse(strFromU8(zip['records.json']!)).rows[0]
    .sources
  expect(inherited.upstreamOf).toBe('overture')
  expect(Object.keys(inherited)).toEqual([
    'property',
    'publisher',
    'upstreamOf',
    'dataset',
    'recordId',
    'license',
  ])
  expect(Object.keys(direct)).toEqual(['publisher', 'dataset', 'recordId'])
  expect(direct).not.toHaveProperty('upstreamOf')
})

test('archive retains authored attribution and keeps selection evidence outside publisher records', async () => {
  const input = await fixture()
  const asset = await prepareCuratedReleaseAsset({
    ...input,
    rows: [
      {
        ...input.rows[0],
        geometrySource: { sourceRecordId: 'land', componentIndexes: [2] },
        sources: {
          saanseoi: [
            {
              dataset: input.datasetCode,
              recordId: 'drawing',
              curation: 'division-geometry',
              contributions: ['geometry'],
            },
          ],
        },
      },
    ],
  })
  const zip = unzipSync(await readFile(asset.filePath))
  const row = JSON.parse(strFromU8(zip['records.json']!)).rows[0]
  expect(row.sources).toEqual([
    { publisher: 'saanseoi', dataset: input.datasetCode, recordId: 'drawing' },
  ])
  expect(saanseoiSourcePayload({ id: row.id, record: row }).properties.sources).toEqual(
    row.sources,
  )
  expect(row).not.toHaveProperty('geometrySource')
  expect(JSON.stringify(row)).not.toContain('componentIndexes')
})
