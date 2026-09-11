import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { SourceDatabase } from '@repo/db'
import {
  normaliseAddressRowForPipeline,
  buildHkgovAlsSourceHashInput,
} from './normalisation'
import { correctHkgovAddressComponents } from './componentCorrections'
import { buildAddressSourceSqlImportFiles } from './sqlImport'
import { writeAddressSourceChunkStage } from './sourceStage'
import type { DatasetProcessingMessage } from '../../../types'
import type { NormalisedAddressChunkArtefact } from './types'

// Transcribed from the retained 20250903-1043 Islands district ALS record.
const source = {
  publisherSource: {
    sourceRecordId: 'source-theme-village',
    versionHash: 'source-hash',
    rawProperties: {
      enBuildingName: 'NGONG PING THEME VILLAGE',
      zhHantBuildingName: '昂平市集',
      hkgovCsuId: '0810113017T20060614',
    },
    sourceGeometry: { type: 'Point', coordinates: [113.90307, 22.25639] },
    sources: [
      {
        dataset: 'hkgov-dpo-als-2d',
        sourceFile: 'islands.geojson',
        sourceVersion: '2025-09-03.0',
        featureIndexOneBased: 1,
      },
    ],
  },
  id: 'source-theme-village',
  canonicalId: 'canonical-theme-village',
  divisionSnapshotId: 'divisions-2025-09',
  sourceVersion: '2025-09-03.0',
  geoAddress: '0804613094T20060724',
  hkgovCsuId: '0810113017T20060614',
  enBuildingName: 'NGONG PING THEME VILLAGE',
  zhHantBuildingName: '昂平市集',
  enEstateName: null,
  zhHantEstateName: null,
  enStreetName: 'NGONG PING ROAD',
  zhHantStreetName: '昂平路',
  enStreetNumberFrom: '111',
  zhHantStreetNumberFrom: '111',
  enFormattedAddress: 'NGONG PING THEME VILLAGE, 111 NGONG PING ROAD, LANTAU ISLAND',
  zhHantFormattedAddress: '大嶼山昂平路111號昂平市集',
  geometry: '{"type":"Point","coordinates":[113.90307,22.25639]}',
  sources:
    '{"hkgovAls":[{"dataset":"hkgov-dpo","sourceRecordId":"source-theme-village"}]}',
}

test('corrects bilingual Address2D components without changing identity, street number or publisher data', () => {
  const before = structuredClone(source)
  const hashInput = buildHkgovAlsSourceHashInput(source)
  const result = normaliseAddressRowForPipeline(source)
  expect(result.canonicalId).toBe(source.canonicalId)
  expect(result.sourceId).toBe(source.id)
  expect(result.base.granularity).toBe('complex')
  expect(result.base).not.toHaveProperty('granularityProvenance')
  expect(result.base.geometry).toEqual(JSON.parse(source.geometry))
  for (const locale of ['en', 'zh-hant']) {
    expect(result.i18n.find(row => row.locale === locale)).toMatchObject({
      buildingName: null,
      estateName: locale === 'en' ? source.enBuildingName : source.zhHantBuildingName,
      streetName: locale === 'en' ? source.enStreetName : source.zhHantStreetName,
      buildingNumberExpression: '111',
      buildingNumberFrom: '111',
      buildingNumberTo: null,
      formattedAddress:
        locale === 'en' ? source.enFormattedAddress : source.zhHantFormattedAddress,
    })
  }
  expect(result.coverageComponents).toContain('estate_name')
  expect(result.coverageComponents).not.toContain('building_name')
  expect(result.base.sources).toMatchObject({
    hkgovAls: JSON.parse(source.sources).hkgovAls,
    hkgovAlsComponentCorrections: {
      fixtureVersion: 1,
      corrections: [{ id: 'ngong-ping-theme-village-estate', revision: 1 }],
    },
  })
  expect(source).toEqual(before)
  expect(buildHkgovAlsSourceHashInput(source)).toEqual(hashInput)
})

test('supports the reviewed GeoAddress change in the August 2026 delivery', () => {
  expect(
    correctHkgovAddressComponents({
      ...source,
      sourceVersion: '2026-08-19.0',
      geoAddress: '0795713146T20060614',
    }).applied,
  ).toHaveLength(1)
})

test('preserves array-shaped source references alongside correction provenance', () => {
  const references = JSON.parse(source.sources).hkgovAls
  expect(
    normaliseAddressRowForPipeline({ ...source, sources: JSON.stringify(references) })
      .base.sources,
  ).toMatchObject({ hkgovAls: references })
})

test('leaves Ngong Ping Tsuen and unrelated similarly named premises untouched', () => {
  for (const names of [
    { enVillageName: 'NGONG PING TSUEN', zhHantVillageName: '昂坪村' },
    {
      enBuildingName: source.enBuildingName,
      zhHantBuildingName: source.zhHantBuildingName,
    },
  ]) {
    const other = {
      ...source,
      geoAddress: 'other-geo',
      hkgovCsuId: 'other-csu',
      ...names,
    }
    expect(correctHkgovAddressComponents(other)).toEqual({ row: other, applied: [] })
  }
})

test('requires review for changed source identifiers, expected components or missing version', () => {
  for (const change of [
    { geoAddress: 'new-geo' },
    { hkgovCsuId: 'new-csu' },
    { enStreetNumberFrom: '9B' },
    { zhHantStreetName: '別的路' },
    { enEstateName: 'OTHER ESTATE' },
    { enVillageName: 'NGONG PING TSUEN' },
    { zhHantVillageName: '昂坪村' },
    { enBuildingName: 'RENAMED' },
    { sourceVersion: undefined },
  ])
    expect(() => normaliseAddressRowForPipeline({ ...source, ...change })).toThrow(
      'requires review',
    )
})

test('limits corrections to the applicable release range and honours the ingestion version', () => {
  expect(correctHkgovAddressComponents(source, '2025-08-13.0').applied).toEqual([])
  expect(
    normaliseAddressRowForPipeline(
      { ...source, sourceVersion: undefined },
      '2025-09-03.0',
    ).i18n[0]?.estateName,
  ).toBe(source.enBuildingName)
})

test.each(['sql', 'direct'] as const)(
  '%s source storage retains the ALS payload without canonical projections',
  async mode => {
    const message = {
      source: 'hkgov-dpo',
      sourceVersion: source.sourceVersion,
      datasetId: 'dataset-als',
      releaseId: 'release-als',
      cohortKey: source.sourceVersion,
      regionCode: 'hk',
    } as DatasetProcessingMessage
    const row = {
      ...normaliseAddressRowForPipeline(source),
      raw: source,
      sourcePayloadHash: 'source-hash',
    }
    const artefact = {
      kind: 'address.normalised.v1',
      processingRunStartedAt: '2026-09-06T00:00:00Z',
      releaseId: 'release-als',
      rowStart: 0,
      rowEnd: 1,
      totalRows: 1,
      rows: [row],
    } satisfies NormalisedAddressChunkArtefact
    const db = new Database(':memory:')
    try {
      db.exec(`CREATE TABLE hkgovAlsAddresses2d (
      sourceRecordId TEXT, versionHash TEXT, releaseId TEXT, validFromRelease TEXT,
      validToRelease TEXT, isCurrent INTEGER, sourceLocator TEXT,
      rawProperties TEXT, sourceGeometry TEXT, version INTEGER, createdAt TEXT, updatedAt TEXT,
      PRIMARY KEY (sourceRecordId, versionHash)
    )`)
      if (mode === 'sql') {
        for (const file of buildAddressSourceSqlImportFiles(message, artefact)) {
          if (file.target === 'source') db.exec(file.sql)
        }
      } else {
        await writeAddressSourceChunkStage(
          drizzle({ client: db }) as unknown as SourceDatabase,
          {
            async head() {
              return null
            },
            async get() {
              return {
                async arrayBuffer() {
                  return new TextEncoder().encode(JSON.stringify(artefact)).buffer
                },
              }
            },
          },
          { ...message, artefactKey: 'normalised-address' } as DatasetProcessingMessage,
        )
      }
      const saved = db.query('SELECT rawProperties FROM hkgovAlsAddresses2d').get() as {
        rawProperties: string
      }
      expect(JSON.parse(saved.rawProperties)).toEqual(
        source.publisherSource.rawProperties,
      )
    } finally {
      db.close()
    }
  },
)
