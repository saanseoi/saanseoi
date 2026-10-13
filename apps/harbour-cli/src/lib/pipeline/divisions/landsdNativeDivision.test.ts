import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DatasetProcessingMessage } from '@repo/core'
import {
  buildBeginPublicationSql,
  buildCompletePublicationSql,
  buildPublicationRowCountSql,
} from '@repo/core/pipeline/services/publication/sql'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { releaseFixtureSchemaSql } from '../../../../../../libs/core/src/testing/releaseFixtures'
import {
  landsdSettlementDivisionRows,
  readLandsdPlaceNameArchive,
} from '../../sources/hkgov/landsd/landsdPlaceName.ts'
import { buildNativeSourceSql } from '../local/nativeSourceSql.ts'
import { buildDivisionSqlState } from './processLocalDivisionSqlUploadPreparation.ts'
import {
  buildDivisionCurrentSqlFile,
  buildDivisionHistorySqlFile,
} from './processLocalDivisionSqlUploadRows.ts'

test('native LandsD settlements deliver canonical rows, source resolutions and a complete receipt', async () => {
  const root = resolve(import.meta.dir, '../../../../../..')
  const source = new Database(':memory:')
  const current = new Database(':memory:')
  const history = new Database(':memory:')
  const meta = new Database(':memory:')
  try {
    meta.exec(`${releaseFixtureSchemaSql()};
      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset' AND sourceVersion = '2026-06-10.0'), 'source-' || 'release'), 'dataset', 'source-' || 'release', '2026-06-10.0', 'current');
UPDATE sourceReleases SET sourceVersion = '2026-06-10.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset' AND sourceVersion = '2026-06-10.0'), 'source-' || 'release');
INSERT INTO resourceReleases (id, resourceType, status, revokedAt, sourceReleaseId, code) VALUES ('release', 'division', 'current', NULL, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset' AND sourceVersion = '2026-06-10.0'), 'source-' || 'release'), 'release')`)
    const migrations = resolve(root, 'libs/db/migrations')
    source.exec(loadMigrationSql(migrations, ['source']))
    current.exec(loadMigrationSql(migrations, ['current']))
    history.exec(loadMigrationSql(migrations, ['history']))
    const features = await readLandsdPlaceNameArchive(
      await readFile(
        resolve(
          root,
          'data/hkgov/csdi/archive/landsd_rcd_1648571595120_89752/2026-Q2/source.zip',
        ),
      ),
    )
    const rows = landsdSettlementDivisionRows(features)
    const originalProperties = JSON.stringify(
      features.map(feature => feature.properties),
    )
    const message: DatasetProcessingMessage = {
      datasetId: 'dataset',
      datasetCode: 'ds-hk-hkgov-landsd-division',
      resourceReleaseId: 'release',
      releaseCode: 'dr-hk-hkgov-landsd-division-2026-06-10.0',
      rawObjectKey: 'publisher-source.zip',
      regionCode: 'hk',
      cohortKey: '2026-06-10.0',
      sourceVersion: '2026-06-10.0',
      source: 'hkgov-landsd',
      theme: 'divisions',
      resourceType: 'division',
    }
    for (const sql of await buildNativeSourceSql(
      [
        {
          name: 'hkgovLandsdPlaceNames',
          provenance: 'required',
          replaceCurrentRows: true,
          rows: features.map(feature => ({
            sourceRecordId: `LANDSD:PLACE_NAME:${feature.id}`,
            properties: { ...feature.properties, placeNames: feature.placeNames },
            sourceGeometry: feature.sourceGeometry,
            sources: [{ dataset: 'hkgov-landsd' }],
          })),
        },
      ],
      'release',
      message.sourceVersion,
    ))
      source.exec(sql)
    const state = await buildDivisionSqlState(
      {
        get() {
          throw new Error('Native intake must not read a converted artefact.')
        },
      } as never,
      message,
      createLocalHarbourDb(meta) as never,
      new Map(),
      new Map(),
      'snapshot',
      false,
      async () => {},
      [createLocalHarbourDb(source)],
      rows,
    )
    expect(state.statsRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'records', dimension: null, value: 2706 }),
        expect.objectContaining({
          category: 'records',
          dimensionValue: 'Hydrographic',
          value: 297,
        }),
        expect.objectContaining({
          category: 'records',
          dimensionValue: 'Topographic',
          value: 796,
        }),
        expect.objectContaining({
          category: 'changes',
          measure: 'added_count',
          dimension: null,
          value: 2706,
        }),
        expect.objectContaining({
          category: 'completeness',
          measure: 'locale_count',
          dimensionValue: 'zh-hant',
          value: 2702,
        }),
      ]),
    )
    expect(state.records).toHaveLength(1613)
    expect(state.records.every(record => record.base.class === 'settlement')).toBe(true)
    expect(JSON.stringify(features.map(feature => feature.properties))).toBe(
      originalProperties,
    )
    history.exec(
      (await buildDivisionHistorySqlFile(message, state, async () => {})).sql,
    )
    const receipt = {
      table: 'divisionPublicationState' as const,
      scopeId: 'lineage',
      snapshotId: 'snapshot',
      publicationToken: 'release',
      timestamp: '2026-09-12T00:00:00.000Z',
    }
    current.exec(buildBeginPublicationSql(receipt))
    current.exec(
      (await buildDivisionCurrentSqlFile(message, state, async () => {}, 'lineage'))
        .sql,
    )
    current.exec(
      buildCompletePublicationSql({
        ...receipt,
        validationSql: [
          buildPublicationRowCountSql('divisions', 'lineage', 1613),
          buildPublicationRowCountSql('divisionsI18n', 'lineage', state.localisedRows),
        ].join(' AND '),
      }),
    )
    expect(current.query('SELECT count(*) AS count FROM divisions').get()).toEqual({
      count: 1613,
    })
    expect(
      source.query('SELECT count(*) AS count FROM hkgovLandsdPlaceNames').get(),
    ).toEqual({ count: 2706 })
    const retained = source
      .query<{ properties: string }, []>(
        'SELECT properties FROM hkgovLandsdPlaceNames LIMIT 1',
      )
      .get()
    expect(JSON.parse(retained!.properties).placeNames).toEqual([
      { nameEn: 'Hadden Hill', nameZhHant: '麒麟山', nameStatus: 'Official' },
      { nameEn: 'Ki Lun Shan', nameZhHant: null, nameStatus: 'Alias' },
    ])
    expect(retained!.properties).not.toContain('i18n')
    expect(
      source
        .query(`SELECT DISTINCT json_extract(properties, '$.placeClass') AS class
      FROM hkgovLandsdPlaceNames ORDER BY class`)
        .all(),
    ).toEqual([
      { class: 'Hydrographic' },
      { class: 'Settlement' },
      { class: 'Topographic' },
    ])
    expect(
      source
        .query<{ name: string }, []>('PRAGMA table_info(hkgovLandsdPlaceNames)')
        .all()
        .map(column => column.name),
    ).not.toContain('i18n')
    expect(
      current.query('SELECT status, preparedAt FROM divisionPublicationState').get(),
    ).toEqual({
      status: 'publishing',
      preparedAt: receipt.timestamp,
    })
  } finally {
    for (const database of [source, current, history, meta]) database.close()
  }
}, 30_000)
