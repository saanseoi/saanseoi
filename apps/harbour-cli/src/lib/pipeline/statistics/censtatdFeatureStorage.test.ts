import { censtatdGeometryRow } from '@repo/core/pipeline/services/sources/censtatdGeometry'
import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  normaliseDivisionAreaGeometryRow,
  hashDivisionGeometrySourceRow,
} from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { nativeSourcePayloadHashInput } from '@repo/core/pipeline/services/sources/sourcePayload'
import { decompressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson'
import { censtatdGenericSourceRule } from './processLocalHkgovCenstatdStatisticSqlUpload'
import { sourceStatisticAssertion } from './sourceStatisticAssertion'
import { buildStatisticSqlBatches } from './statisticSqlReplay'

const datasetCode = 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'
const nativeGeometry = {
  'gml:MultiSurface': { '@_srsName': 'EPSG:2326', 'gml:surfaceMember': [] },
}
const properties = { dc: '11', dc_class: 'A', sdu_pop: '100' }
const sourceRecordId = 'CENSTATD:DC_21C_SDU:publisher-11'
function statistic() {
  return censtatdGenericSourceRule.execute({
    resourceReleaseId: 'statistics-release',
    sourceVersion: '2021',
    row: {
      id: sourceRecordId,
      dataset_code: datasetCode,
      feature_id: 'publisher-11',
      layer_name: 'DC_21C_SDU',
      reference_period_code: '2021',
      reference_period_end_year: '2021',
      reference_period_granularity: 'year',
      properties,
      source_geometry: nativeGeometry,
      sources: [{ dataset: 'hkgov-censtatd' }],
    },
  })
}
function database() {
  const db = new Database(':memory:')
  const root = resolve(import.meta.dir, '../../../../../../libs/db/migrations/source')
  for (const dir of readdirSync(root))
    db.exec(readFileSync(resolve(root, dir, 'migration.sql'), 'utf8'))
  return db
}
test('statistics and geometry share native feature identity, payload and hash', async () => {
  const geometry = normaliseDivisionAreaGeometryRow(
    {
      id: 'CENSTATD:A',
      division_id: 'district',
      class: 'land',
      source_record_id: sourceRecordId,
      source_assertion_geometry: nativeGeometry,
      source_properties: properties,
      source_geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [1, 1],
            [2, 1],
            [2, 2],
            [1, 1],
          ],
        ],
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [1, 1],
            [2, 1],
            [2, 2],
            [1, 1],
          ],
        ],
      },
      sources: [{ dataset: 'hkgov-censtatd' }],
    },
    'hkgov-censtatd',
    { datasetCode },
  )!
  const row = statistic()
  expect(geometry.source.sourceRecordId).toBe(row.sourceRecordId)
  expect(
    await hashDivisionGeometrySourceRow(
      nativeSourcePayloadHashInput({
        properties: geometry.source.properties,
        sourceGeometry: geometry.source.sourceGeometry,
      }),
    ),
  ).toBe(row.versionHash)
  const stored = sourceStatisticAssertion(row, datasetCode)
  expect(stored.properties).toEqual(geometry.source.properties)
  expect(
    decompressJsonBrotli(censtatdGeometryRow(row.sourceGeometry).sourceGeometry),
  ).toEqual(geometry.source.sourceGeometry)
  const db = database()
  try {
    const replay = (record: typeof stored) => {
      for (const sql of buildStatisticSqlBatches({
        resourceReleaseId: record.resourceReleaseId,
        sourceVersion: '2021',
        source: {
          table: 'hkgovCenstatdStatistics',
          rows: [record],
          geometries: [censtatdGeometryRow(row.sourceGeometry)],
        },
      }).source)
        db.exec(sql)
    }
    replay(stored)
    replay({ ...stored, resourceReleaseId: 'geometry-release' })
    expect(
      db.query('SELECT count(*) AS count FROM hkgovCenstatdGeometry').get(),
    ).toEqual({ count: 1 })
    expect(
      db.query('SELECT count(*) AS count FROM hkgovCenstatdStatistics').get(),
    ).toEqual({ count: 2 })
    expect(
      db
        .query(
          'SELECT resourceReleaseId FROM hkgovCenstatdStatistics ORDER BY resourceReleaseId',
        )
        .all(),
    ).toEqual([
      { resourceReleaseId: 'geometry-release' },
      { resourceReleaseId: 'statistics-release' },
    ])
    replay({ ...stored, datasetCode: 'another-dataset' })
    replay({ ...stored, versionHash: 'revised', validFromRelease: '2022' })
    expect(
      db
        .query(
          'SELECT datasetCode, versionHash, isCurrent FROM hkgovCenstatdStatistics ORDER BY datasetCode, versionHash',
        )
        .all(),
    ).toEqual([
      { datasetCode: 'another-dataset', versionHash: stored.versionHash, isCurrent: 1 },
      ...[
        { versionHash: 'revised', isCurrent: 1 },
        { versionHash: stored.versionHash, isCurrent: 0 },
        { versionHash: stored.versionHash, isCurrent: 0 },
      ]
        .sort((a, b) => a.versionHash.localeCompare(b.versionHash))
        .map(row => ({ datasetCode, ...row })),
    ])
  } finally {
    db.close()
  }
})
