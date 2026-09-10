import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { buildLatestReleaseRollbackSql } from '@repo/core/pipeline/rollback'
import { als3dHash } from '../../sources/hkgov/dpo/hkgovAls3d'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../local/nativeSqlDelivery.ts'
import type { PreparedAls3dRecord } from '../../sources/hkgov/dpo/hkgovAls3dPreparation'
import {
  collectionStatements,
  importAddress3dCollections,
  validateAddress3dPreparation,
} from './address3dImport'

function createTable(db: Database, table: SQLiteTable) {
  const config = getTableConfig(table)
  const columns = config.columns.map(
    column =>
      `"${column.name}" ${column.getSQLType()}${column.notNull ? ' NOT NULL' : ''}`,
  )
  const keys = config.primaryKeys.map(
    key => `PRIMARY KEY (${key.columns.map(column => `"${column.name}"`).join(',')})`,
  )
  db.exec(`CREATE TABLE "${config.name}" (${[...columns, ...keys].join(',')})`)
}

test('writes large bound collections, replays idempotently and journals removed membership', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'address3d-import-test-'))
  const path = join(directory, 'prepared.jsonl')
  const databases = {
    current: new Database(join(directory, 'current.sqlite')),
    history: new Database(join(directory, 'history.sqlite')),
    source: new Database(join(directory, 'source.sqlite')),
  }
  try {
    createTable(databases.current, currentSchema.address3d)
    createTable(databases.current, currentSchema.address3dI18n)
    createTable(databases.history, historySchema.address3d)
    createTable(databases.history, historySchema.address3dI18n)
    createTable(databases.history, historySchema.sourceResolutions)
    createTable(databases.history, historySchema.snapshotVersionChanges)
    createTable(databases.source, sourceSchema.sourceHkgovAlsAddresses3d)
    createTable(databases.source, sourceSchema.sourceHkgovAlsAddresses2d)
    databases.current.exec(
      "CREATE TABLE address2d (snapshotId TEXT,id TEXT,parentAddressId TEXT); INSERT INTO address2d VALUES ('snapshot','building',NULL),('snapshot','762','building'),('snapshot','772','building'); CREATE UNIQUE INDEX one_collection_per_owner ON address3d(snapshotId,address2dId);",
    )
    const units = Array.from({ length: 1440 }, (_, i) => ({
      id: `00000000-0000-5000-8000-${String(i).padStart(12, '0')}`,
      unitRef: String(i).padStart(4, '0'),
      unitType: 'F' as const,
      floorRef: '1',
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
    const collection = {
      kind: 'collection' as const,
      id: 'collection',
      address2dId: 'building',
      unresolvedSectionIds: ['762'],
      sourceRecordIds: ['source-1'],
      units,
      locales,
      unitCount: units.length,
      contentHash: als3dHash({ units, locales }),
    }
    const records: PreparedAls3dRecord[] = [
      {
        kind: 'source',
        sourceRecordId: 'source-1',
        versionHash: 'source-hash',
        rawProperties: { source: true },
        sourceGeometry: { type: 'Point', coordinates: [114, 22, 8] },
        sources: [
          { dataset: 'hkgov-dpo-als-3d', sourceFile: 'original.json' },
          {
            dataset: 'reviewed-ownership',
            method: 'reviewed',
            address2dId: 'building',
          },
        ],
      },
      collection,
      {
        kind: 'manifest',
        sourceVersion: '2026-08-19.0',
        collectionCount: 1,
        unitCount: 1440,
        sourceCount: 1,
        source2dCount: 2,
      },
    ]
    const original2d = ['merged-occurrence', 'suppressed-occurrence'].map(
      (sourceRecordId, index) => ({
        kind: 'source2d' as const,
        sourceRecordId,
        versionHash: `original-${index}`,
        rawProperties: { hkgovCsuId: '001', enBuildingName: ' ORIGINAL ' },
        sourceGeometry: { type: 'Point', coordinates: [114 + index, 22] },
        sources: [
          {
            dataset: 'hkgov-dpo-als-2d',
            sourceFile: 'original.json',
            featureIndexOneBased: index + 1,
            sourceVersion: '2026-08-19.0',
          },
        ],
      }),
    )
    const manifest = records[2]!
    records.splice(2, 0, ...original2d)
    await writeFile(path, records.map(row => JSON.stringify(row)).join('\n'))
    const validation = await validateAddress3dPreparation(path, '2026-08-19.0')
    expect(validation.collectionCount).toBe(1)
    expect(validation.localisedCollectionCount).toBe(2)
    const execute = async (
      target: keyof typeof databases,
      statements: Array<{ sql: string; params: unknown[] }>,
    ) => {
      expect(
        statements.every(
          statement =>
            statement.params.length <= 100 &&
            Buffer.byteLength(statement.sql) < 100_000,
        ),
      ).toBe(true)
      const binding = createLocalExecBinding(databases[target])
      const results = (await binding.batch(
        statements.map(statement =>
          binding.prepare(statement.sql).bind(...statement.params),
        ),
      )) as Array<{ results: Record<string, unknown>[] }>
      return results.flatMap(result => result.results)
    }
    const args = {
      path,
      sourceVersion: '2026-08-19.0',
      snapshotId: 'snapshot',
      releaseId: 'release',
      expectedDigest: validation.digest,
      priorMembership: [
        { recordType: 'address3d', recordId: 'removed', locale: '' },
        { recordType: 'address3dI18n', recordId: 'removed', locale: 'en' },
      ],
      execute,
    }
    const files = Object.fromEntries(
      Object.keys(databases).map(name => [name, join(directory, `${name}.sqlite`)]),
    )
    const planDirectory = join(directory, 'delivery')
    let generated = 0
    const prepare = () =>
      prepareNativeSqlDelivery({
        directory: planDirectory,
        ownershipDirectory: directory,
        files,
        releaseId: 'release',
        phase: 'address3d-data',
        inputs: { digest: validation.digest },
        generate: async append => {
          generated++
          await importAddress3dCollections({
            ...args,
            execute: async (target, statements) => {
              if (statements.every(statement => /^\s*SELECT\b/i.test(statement.sql)))
                return execute(target, statements)
              await append(
                { bindingName: target, databaseId: target },
                new TextEncoder().encode(JSON.stringify(statements)),
                'bound',
              )
              return []
            },
          })
        },
      })
    await prepare()
    await expect(
      runNativeSqlDelivery(planDirectory, {
        files,
        onProgress: n => {
          if (n === 2) throw new Error('interrupted collection delivery')
        },
      }),
    ).rejects.toThrow('interrupted')
    await prepare()
    expect(generated).toBe(1)
    await runNativeSqlDelivery(planDirectory, { files })
    await runNativeSqlDelivery(planDirectory, { files })
    await importAddress3dCollections(args)
    expect(
      databases.source
        .query(
          'SELECT sourceRecordId, rawProperties, sourceGeometry FROM hkgovAlsAddresses2d ORDER BY sourceRecordId',
        )
        .all(),
    ).toEqual(
      original2d.map(record => ({
        sourceRecordId: record.sourceRecordId,
        rawProperties: JSON.stringify(record.rawProperties),
        sourceGeometry: JSON.stringify(record.sourceGeometry),
      })),
    )
    expect(
      databases.source
        .query('SELECT rawProperties, sourceGeometry, sources FROM hkgovAlsAddresses3d')
        .get(),
    ).toEqual({
      rawProperties: JSON.stringify({ source: true }),
      sourceGeometry: JSON.stringify({ type: 'Point', coordinates: [114, 22, 8] }),
      sources: JSON.stringify([
        { dataset: 'hkgov-dpo-als-3d', sourceFile: 'original.json' },
      ]),
    })
    const interpretation = databases.history
      .query('SELECT resolutions FROM sourceResolutions WHERE sourceRecordId = ?')
      .get('source-1') as { resolutions: string }
    expect(JSON.parse(interpretation.resolutions)).toEqual({
      entities: { address3d: ['collection'], address2d: ['building'] },
      decisions: [
        { dataset: 'reviewed-ownership', method: 'reviewed', address2dId: 'building' },
      ],
    })
    expect(
      databases.current.query('SELECT count(*) AS n FROM address3d').get(),
    ).toEqual({ n: 1 })
    const row = databases.current
      .query('SELECT units,unresolvedSectionIds FROM address3d')
      .get() as { units: string; unresolvedSectionIds: string }
    expect(Buffer.byteLength(row.units)).toBeGreaterThan(100_000)
    expect(JSON.parse(row.units)).toEqual(units)
    expect(JSON.parse(row.unresolvedSectionIds)).toEqual(['762'])
    expect(
      databases.history.query('SELECT count(*) AS n FROM address3d').get(),
    ).toEqual({ n: 1 })
    expect(
      databases.history
        .query(
          "SELECT operation FROM snapshotVersionChanges WHERE recordId='removed' AND recordType='address3d'",
        )
        .get(),
    ).toEqual({ operation: 'delete' })
    const runSourceRelease = async (sourceVersion: string, hash: string | null) => {
      const next = hash
        ? [
            { ...records[0], versionHash: hash, rawProperties: { hash } },
            collection,
            { ...manifest, sourceVersion, source2dCount: 0 },
          ]
        : [
            {
              kind: 'manifest',
              sourceVersion,
              sourceCount: 0,
              collectionCount: 0,
              unitCount: 0,
            },
          ]
      await writeFile(path, next.map(row => JSON.stringify(row)).join('\n'))
      const validated = await validateAddress3dPreparation(path, sourceVersion)
      await importAddress3dCollections({
        ...args,
        sourceVersion,
        releaseId: sourceVersion,
        expectedDigest: validated.digest,
      })
    }
    await runSourceRelease('2026-09-01.0', 'source-hash')
    expect(
      databases.source
        .query('SELECT count(*) AS n FROM hkgovAlsAddresses2d WHERE isCurrent = 1')
        .get(),
    ).toEqual({ n: 0 })
    expect(
      databases.source.query('SELECT count(*) AS n FROM hkgovAlsAddresses3d').get(),
    ).toEqual({ n: 1 })
    expect(
      databases.source
        .query('SELECT validFromRelease, isCurrent FROM hkgovAlsAddresses3d')
        .get(),
    ).toEqual({ validFromRelease: args.sourceVersion, isCurrent: 1 })
    await runSourceRelease('2026-10-01.0', 'changed-hash')
    await runSourceRelease('2026-10-01.0', 'changed-hash')
    expect(
      databases.source
        .query(
          'SELECT versionHash, validToRelease, isCurrent FROM hkgovAlsAddresses3d ORDER BY versionHash',
        )
        .all(),
    ).toEqual([
      { versionHash: 'changed-hash', validToRelease: null, isCurrent: 1 },
      { versionHash: 'source-hash', validToRelease: '2026-10-01.0', isCurrent: 0 },
    ])
    const rollback = buildLatestReleaseRollbackSql({
      apiReleaseSetId: 'test',
      previousApiReleaseSetId: null,
      previousReleaseId: '2026-09-01.0',
      releaseId: '2026-10-01.0',
      snapshotId: 'snapshot',
      source: 'hkgov-dpo',
      sourceVersion: '2026-10-01.0',
      type: 'address',
    })
    databases.source.exec(rollback.source)
    expect(
      databases.source
        .query('SELECT versionHash, isCurrent, validToRelease FROM hkgovAlsAddresses3d')
        .all(),
    ).toEqual([{ versionHash: 'source-hash', isCurrent: 1, validToRelease: null }])
    await runSourceRelease('2026-10-01.0', 'changed-hash')
    await runSourceRelease('2026-11-01.0', null)
    expect(
      databases.source
        .query('SELECT count(*) AS n FROM hkgovAlsAddresses3d WHERE isCurrent=1')
        .get(),
    ).toEqual({ n: 0 })
    await runSourceRelease('2026-12-01.0', 'changed-hash')
    expect(
      databases.source.query('SELECT count(*) AS n FROM hkgovAlsAddresses3d').get(),
    ).toEqual({ n: 2 })
    // Restore the preparation used by the owner-validation checks below.
    await writeFile(path, records.map(row => JSON.stringify(row)).join('\n'))
    const other = collectionStatements(
      { ...collection, id: 'other' },
      'snapshot',
      'release',
      new Date().toISOString(),
    )
    await expect(execute('current', other.currentStatements)).rejects.toThrow('UNIQUE')
    databases.current.exec("DELETE FROM address2d WHERE id='building'")
    let writes = 0
    await expect(
      importAddress3dCollections({
        ...args,
        execute: async (target, statements) => {
          if (statements.some(statement => !statement.sql.startsWith('SELECT ')))
            writes++
          return execute(target, statements)
        },
      }),
    ).rejects.toThrow('owner building')
    expect(writes).toBe(0)
    expect(
      databases.current.query('SELECT count(*) AS n FROM address3d').get(),
    ).toEqual({ n: 1 })
    await writeFile(path, `${JSON.stringify(records[0])}\n`)
    await expect(validateAddress3dPreparation(path, '2026-08-19.0')).rejects.toThrow(
      'Incomplete',
    )
  } finally {
    for (const db of Object.values(databases)) db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
