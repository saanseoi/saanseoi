import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { createLocalExecBinding } from '../../dbCache/localDbCache'
import { als3dHash } from '../../sources/hkgov/dpo/hkgovAls3d'
import type { PreparedAls3dRecord } from '../../sources/hkgov/dpo/hkgovAls3dPreparation'
import {
  importAddress3dCollections,
  validateAddress3dPreparation,
  type Address3dImportShard,
} from './address3dImport'

function createTable(db: Database, table: SQLiteTable) {
  const config = getTableConfig(table)
  db.exec(
    `CREATE TABLE "${config.name}" (${[
      ...config.columns.map(
        column =>
          `"${column.name}" ${column.getSQLType()}${column.notNull ? ' NOT NULL' : ''}`,
      ),
      ...config.primaryKeys.map(
        key =>
          `PRIMARY KEY (${key.columns.map(column => `"${column.name}"`).join(',')})`,
      ),
    ].join(',')})`,
  )
}
const count = (db: Database, table: string) =>
  db.query<{ n: number }, []>(`SELECT count(*) n FROM ${table}`).get()?.n
const changes = (db: Database) =>
  db.query<{ n: number }, []>('SELECT total_changes() n').get()?.n

test('yearly shards reuse prior content, close locale-only omissions and superseded versions, and retain publisher history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'address3d-shards-'))
  const current = new Database(':memory:')
  const historyOld = new Database(':memory:')
  const historyNew = new Database(':memory:')
  const sourceOld = new Database(':memory:')
  const sourceNew = new Database(':memory:')
  const path = join(directory, 'prepared.jsonl')
  try {
    for (const table of [currentSchema.address3d, currentSchema.address3dI18n])
      createTable(current, table)
    current.exec(
      "CREATE TABLE address2d(snapshotId TEXT,id TEXT,parentAddressId TEXT); INSERT INTO address2d VALUES ('scope','building',NULL)",
    )
    for (const db of [historyOld, historyNew])
      for (const table of [
        historySchema.address3d,
        historySchema.address3dI18n,
        historySchema.sourceResolutions,
        historySchema.snapshotVersionChanges,
      ])
        createTable(db, table)
    for (const db of [sourceOld, sourceNew])
      for (const table of [
        sourceSchema.sourceHkgovAlsAddresses2d,
        sourceSchema.sourceHkgovAlsAddresses3d,
      ])
        createTable(db, table)
    const executeFor =
      (db: Database): Address3dImportShard['execute'] =>
      async statements => {
        for (const statement of statements)
          expect(statement.params.length).toBeLessThanOrEqual(100)
        const binding = createLocalExecBinding(db)
        const results = (await binding.batch(
          statements.map(statement =>
            binding.prepare(statement.sql).bind(...statement.params),
          ),
        )) as Array<{ results: Record<string, unknown>[] }>
        return results.flatMap(result => result.results)
      }
    const historyShards = [
      { bindingName: 'old-history', execute: executeFor(historyOld) },
      { bindingName: 'new-history', execute: executeFor(historyNew) },
    ]
    const sourceShards = [
      { bindingName: 'old-source', execute: executeFor(sourceOld) },
      { bindingName: 'new-source', execute: executeFor(sourceNew) },
    ]
    const execute =
      (year: 'old' | 'new') =>
      async (
        target: 'current' | 'history' | 'source',
        statements: Parameters<Address3dImportShard['execute']>[0],
      ) =>
        executeFor(
          target === 'current'
            ? current
            : target === 'history'
              ? year === 'old'
                ? historyOld
                : historyNew
              : year === 'old'
                ? sourceOld
                : sourceNew,
        )(statements)
    const units = [1, 2].map(n => ({
      id: `unit-${n}`,
      unitRef: String(n),
      floorRef: '1',
      unitType: 'F' as const,
      floorType: 'F' as const,
      unitPortion: null,
    }))
    const locales = {
      en: Object.fromEntries(
        units.map(unit => [
          unit.id,
          { unitExpression: `FLAT ${unit.unitRef}`, floorExpression: '1/F' },
        ]),
      ),
      'zh-hant': Object.fromEntries(
        units.map(unit => [
          unit.id,
          { unitExpression: `${unit.unitRef}室`, floorExpression: '1樓' },
        ]),
      ),
    }
    const collection: Extract<PreparedAls3dRecord, { kind: 'collection' }> = {
      kind: 'collection',
      id: 'inventory',
      address2dId: 'building',
      unresolvedSectionIds: [],
      sourceRecordIds: ['publisher-3d'],
      units,
      locales,
      unitCount: units.length,
      contentHash: als3dHash({ units, locales }),
    }
    const raw = {
      sourceRecordId: 'publisher-3d',
      versionHash: 'raw-3d',
      properties: { raw: 'unaltered' },
      sourceGeometry: { type: 'Point', coordinates: [114, 22, 8] },
      sources: [{ dataset: 'hkgov-dpo-als-3d', sourceFile: 'original.geojson' }],
    }
    const source2d: Extract<PreparedAls3dRecord, { kind: 'source2d' }> = {
      kind: 'source2d',
      sourceRecordId: 'publisher-2d',
      versionHash: 'raw-2d',
      properties: { raw: '  ORIGINAL  ' },
      sourceGeometry: null,
      sources: [
        {
          dataset: 'hkgov-dpo-als-2d',
          sourceFile: 'original2d.geojson',
          featureIndexOneBased: 1,
          sourceVersion: '2025-12-01.0',
        },
      ],
    }
    type Prior = Parameters<typeof importAddress3dCollections>[0]['priorMembership']
    const prior = (db: Database, snapshot: string, bindingName: string): Prior =>
      db
        .query<
          { recordType: string; recordId: string; locale: string; versionHash: string },
          [string]
        >(
          "SELECT recordType,recordId,locale,versionHash FROM snapshotVersionChanges WHERE snapshotId = ? AND operation = 'upsert'",
        )
        .all(snapshot)
        .map(row => ({ ...row, shard: { bindingName } }))
    const run = async (
      sourceVersion: string,
      year: 'old' | 'new',
      snapshot: string,
      priorMembership: Prior,
      prepared: typeof collection | null = collection,
    ) => {
      const include3dSource = Boolean(prepared?.sourceRecordIds.length)
      const records: PreparedAls3dRecord[] = prepared
        ? [
            ...(include3dSource ? [{ kind: 'source' as const, ...raw }] : []),
            source2d,
            prepared,
          ]
        : []
      records.push({
        kind: 'manifest',
        sourceVersion,
        collectionCount: prepared ? 1 : 0,
        unitCount: prepared?.unitCount ?? 0,
        sourceCount: include3dSource ? 1 : 0,
        source2dCount: prepared ? 1 : 0,
      })
      await writeFile(path, records.map(record => JSON.stringify(record)).join('\n'))
      const validated = await validateAddress3dPreparation(path, sourceVersion)
      await importAddress3dCollections({
        path,
        sourceVersion,
        snapshotId: snapshot,
        currentSnapshotId: 'scope',
        releaseId: snapshot,
        expectedDigest: validated.digest,
        priorMembership,
        historyShards,
        sourceShards,
        execute: execute(year),
        timestamp: `${sourceVersion.slice(0, 10)}T00:00:00Z`,
      })
    }
    await run('2025-12-01.0', 'old', 's1', [])
    const oldPrior = prior(historyOld, 's1', 'old-history')
    expect(oldPrior).toHaveLength(3)
    const oldHistoryChanges = changes(historyOld)
    const oldSourceChanges = changes(sourceOld)
    await run('2026-01-01.0', 'new', 's2', oldPrior)
    expect(changes(historyOld)).toBe(oldHistoryChanges)
    expect(changes(sourceOld)).toBe(oldSourceChanges)
    expect(count(historyNew, 'address3d')).toBe(0)
    expect(count(historyNew, 'address3dI18n')).toBe(0)
    expect(count(historyNew, 'snapshotVersionChanges')).toBe(0)
    expect(count(sourceNew, 'hkgovAlsAddresses2d')).toBe(0)
    expect(count(sourceNew, 'hkgovAlsAddresses3d')).toBe(0)
    expect(
      JSON.parse(
        String(
          historyNew
            .query<{ resolutions: string }, []>(
              'SELECT resolutions FROM sourceResolutions',
            )
            .get()?.resolutions,
        ),
      ),
    ).toEqual({ entities: { address3d: ['inventory'], address2d: ['building'] } })
    const localeEdited = structuredClone(collection)
    localeEdited.locales.en!['unit-1']!.floorExpression = 'FIRST FLOOR'
    localeEdited.contentHash = als3dHash({
      units: localeEdited.units,
      locales: localeEdited.locales,
    })
    await run('2026-01-15.0', 'new', 's2-locale', oldPrior, localeEdited)
    expect(count(historyNew, 'address3d')).toBe(0)
    expect(
      historyNew.query('SELECT locale,isCurrent FROM address3dI18n').all(),
    ).toEqual([{ locale: 'en', isCurrent: 1 }])
    expect(
      historyOld
        .query('SELECT locale,isCurrent FROM address3dI18n ORDER BY locale')
        .all(),
    ).toEqual([
      { locale: 'en', isCurrent: 0 },
      { locale: 'zh-hant', isCurrent: 1 },
    ])
    expect(historyOld.query('SELECT isCurrent FROM address3d').get()).toEqual({
      isCurrent: 1,
    })
    const activePrior = [
      ...oldPrior.filter(row => row.locale !== 'en'),
      ...prior(historyNew, 's2-locale', 'new-history'),
    ]
    historyOld.exec(
      "INSERT INTO address3dI18n SELECT address3dId,'fr',units,versionHash,sourceReleaseId,snapshotId,1,createdAt,updatedAt FROM address3dI18n WHERE locale='en'",
    )
    await run(
      '2026-02-01.0',
      'new',
      's3',
      [
        ...activePrior,
        {
          ...oldPrior.find(row => row.locale === 'en')!,
          recordType: 'address3dI18n',
          locale: 'fr',
        },
      ],
      localeEdited,
    )
    expect(
      historyOld.query("SELECT isCurrent FROM address3dI18n WHERE locale='fr'").get(),
    ).toEqual({ isCurrent: 0 })
    expect(
      historyNew
        .query(
          "SELECT operation FROM snapshotVersionChanges WHERE snapshotId='s3' AND locale='fr'",
        )
        .get(),
    ).toEqual({ operation: 'delete' })
    const changed = structuredClone(localeEdited)
    changed.units.pop()
    delete changed.locales.en?.['unit-2']
    delete changed.locales['zh-hant']?.['unit-2']
    changed.unitCount = 1
    changed.contentHash = als3dHash({ units: changed.units, locales: changed.locales })
    raw.versionHash = 'raw-3d-changed'
    raw.properties.raw = 'changed assertion'
    await run('2026-03-01.0', 'new', 's4', activePrior, changed)
    expect(
      sourceOld.query('SELECT isCurrent,validToRelease FROM hkgovAlsAddresses3d').get(),
    ).toEqual({ isCurrent: 0, validToRelease: '2026-03-01.0' })
    expect(
      sourceNew.query('SELECT versionHash,isCurrent FROM hkgovAlsAddresses3d').get(),
    ).toEqual({ versionHash: 'raw-3d-changed', isCurrent: 1 })
    expect(historyOld.query('SELECT isCurrent FROM address3d').get()).toEqual({
      isCurrent: 0,
    })
    expect(
      historyOld.query('SELECT DISTINCT isCurrent FROM address3dI18n').all(),
    ).toEqual([{ isCurrent: 0 }])
    expect(count(historyNew, 'address3d')).toBe(1)
    const changedPrior = prior(historyNew, 's4', 'new-history')
    await run('2026-04-01.0', 'new', 's5', changedPrior, null)
    expect(historyNew.query('SELECT isCurrent FROM address3d').get()).toEqual({
      isCurrent: 0,
    })
    expect(
      historyNew.query('SELECT DISTINCT isCurrent FROM address3dI18n').all(),
    ).toEqual([{ isCurrent: 0 }])
    expect(
      sourceOld.query('SELECT isCurrent,validToRelease FROM hkgovAlsAddresses3d').get(),
    ).toEqual({ isCurrent: 0, validToRelease: '2026-03-01.0' })
    expect(
      sourceNew.query('SELECT isCurrent,validToRelease FROM hkgovAlsAddresses3d').get(),
    ).toEqual({ isCurrent: 0, validToRelease: '2026-04-01.0' })
    expect(count(current, 'address3d')).toBe(0)
    raw.versionHash = 'raw-3d'
    raw.properties.raw = 'unaltered'
    await run('2026-05-01.0', 'new', 's6', [], changed)
    expect(count(sourceNew, 'hkgovAlsAddresses3d')).toBe(1)
    expect(sourceNew.query('SELECT isCurrent FROM hkgovAlsAddresses3d').get()).toEqual({
      isCurrent: 0,
    })
    expect(
      sourceOld
        .query(
          'SELECT properties,releaseId,validFromRelease,isCurrent FROM hkgovAlsAddresses3d',
        )
        .get(),
    ).toEqual({
      properties: JSON.stringify(raw.properties),
      releaseId: 's1',
      validFromRelease: '2025-12-01.0',
      isCurrent: 1,
    })
    expect(historyNew.query('SELECT isCurrent FROM address3d').get()).toEqual({
      isCurrent: 1,
    })
    const retained = {
      ...changed,
      sourceRecordIds: [],
      processingSources: [
        {
          dataset: 'saanseoi-address3d-backfill',
          id: 'reviewed-retention',
          sourceFile: 'retentions.json',
          evidenceSourceVersion: '2026-05-01.0',
        },
      ],
    }
    await run(
      '2026-06-01.0',
      'new',
      's7',
      prior(historyNew, 's6', 'new-history'),
      retained,
    )
    expect(
      sourceOld.query('SELECT isCurrent,validToRelease FROM hkgovAlsAddresses3d').get(),
    ).toEqual({ isCurrent: 0, validToRelease: '2026-06-01.0' })
    expect(count(current, 'address3d')).toBe(1)
    expect(
      JSON.parse(
        current.query<{ sources: string }, []>('SELECT sources FROM address3d').get()
          ?.sources ?? 'null',
      ),
    ).toEqual(retained.processingSources)
  } finally {
    for (const db of [current, historyOld, historyNew, sourceOld, sourceNew]) db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
