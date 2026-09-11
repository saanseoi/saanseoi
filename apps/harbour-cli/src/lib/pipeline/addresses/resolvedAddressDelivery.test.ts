import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import {
  currentSchema,
  historySchema,
  metaSchema,
  sourceSchema,
  type MetaDatabase,
} from '@repo/db'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import type {
  AddressPipelineMessage,
  ResolvedAddressChunkArtefact,
} from '@repo/core/pipeline/services/addresses/types'
import {
  buildAddressCurrentSqlImportFile,
  buildAddressHistoryApplySqlImportFile,
  buildAddressHistorySqlImportFile,
} from '@repo/core/pipeline/services/addresses/sqlImport'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import { fileSha256 } from './address3dImport.ts'
import {
  captureResolvedAddressDelivery,
  validateResolvedAddressProjection,
} from './resolvedAddressDelivery.ts'
import type { AlsMembership } from '../../sources/hkgov/dpo/hkgovAlsMembership.ts'

test('combined Address planning seals only final changes and rejects incomplete projections before emission', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'resolved-address-test-'))
  const dbs: Database[] = []
  try {
    const files: Record<string, string> = {}
    const opened: Record<string, Database> = {}
    for (const [binding, family] of [
      ['DB_META', 'meta'],
      ['DB_CURRENT', 'current'],
      ['DB_HISTORY_HK_2026', 'history'],
      ['DB_SOURCE_HK_2026', 'source'],
    ]) {
      const path = join(directory, `${binding}.sqlite`)
      files[binding!] = path
      const db = new Database(path)
      dbs.push(db)
      opened[binding!] = db
      db.exec(
        loadMigrationSql(
          resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
          [family!],
        ),
      )
    }
    const current = opened.DB_CURRENT!
    const history = opened.DB_HISTORY_HK_2026!
    const source = opened.DB_SOURCE_HK_2026!
    const meta = drizzle({
      client: opened.DB_META!,
      schema: metaSchema,
    }) as unknown as MetaDatabase
    const shards = getTableConfig(metaSchema.metaDataShards)
    opened.DB_META!.exec(
      `CREATE TABLE IF NOT EXISTS dataShards (${shards.columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(',')})`,
    )
    const bindings = Object.fromEntries(
      Object.keys(files).map(name => [name, { databaseId: name, databaseName: name }]),
    )
    const context = {
      currentBinding: createLocalExecBinding(current, 'DB_CURRENT'),
      historyBinding: createLocalExecBinding(history, 'DB_HISTORY_HK_2026'),
      sourceBinding: createLocalExecBinding(source, 'DB_SOURCE_HK_2026'),
      metaDb: meta,
      currentDb: drizzle({ client: current, schema: currentSchema }),
      historyDb: drizzle({ client: history, schema: historySchema }),
      sourceDb: drizzle({ client: source, schema: sourceSchema }),
      state: {
        files,
        bindings,
        dbCacheDir: directory,
        target: 'local',
        preparedAt: 'now',
      },
      historyTargets: [],
      sourceTargets: [],
      cleanup() {},
    } as unknown as LocalAddressDbContext
    const bucket = new LocalPipelineBucket(join(directory, 'bucket'))
    const path = join(directory, 'three.jsonl')
    await writeFile(
      path,
      [
        {
          kind: 'source2d',
          sourceRecordId: 'raw',
          versionHash: 'raw-hash',
          properties: { name: 'Harbour Road' },
          sourceGeometry: null,
          sources: [{ dataset: 'hkgov-dpo-als-2d' }],
        },
        {
          kind: 'manifest',
          sourceVersion: '2026-01-01.0',
          sourceCount: 0,
          source2dCount: 1,
          collectionCount: 0,
          unitCount: 0,
        },
      ]
        .map(row => JSON.stringify(row))
        .join('\n'),
    )
    const digest = await fileSha256(path)
    const now = '2026-01-01T00:00:00.000Z'
    const message = {
      source: 'hkgov-dpo',
      sourceVersion: '2026-01-01.0',
      releaseId: 'release',
      datasetId: 'dataset',
      cohortKey: '2026-01-01.0',
      regionCode: 'hk',
      processingRunStartedAt: now,
      resourceType: 'address',
      theme: 'addresses',
      addressCurrentScopeId: 'scope',
      addressSqlArtefactKeys: [],
    } as unknown as AddressPipelineMessage
    const artefact = {
      kind: 'address.resolved.v1',
      addedRows: 1,
      changedRows: 0,
      insertedVersions: 1,
      localisedRows: 1,
      rowStart: 0,
      rowEnd: 1,
      totalRows: 1,
      processingRunStartedAt: now,
      releaseId: 'release',
      unchangedRows: 0,
      rows: [
        {
          addressId: 'a',
          sourceId: 'raw',
          changed: true,
          changedExistingId: null,
          versionHash: 'v1',
          coverageComponents: [],
          sourceResolution: {
            snapshotId: 'snapshot',
            sourceReleaseId: 'release',
            sourceRecordId: 'raw',
            sourceVersionHash: 'raw-hash',
            resolutions: { entities: { address2d: ['a'] } },
          },
          base: {
            id: 'a',
            snapshotId: 'snapshot',
            divisionSnapshotId: 'division',
            granularity: 'building',
            sources: [
              {
                dataset: 'hkgov-dpo-als-2d',
                sourceVersion: '2026-01-01.0',
                sourceFile: 'first.json',
              },
            ],
            createdAt: now,
            updatedAt: now,
          },
          i18n: [
            {
              addressId: 'a',
              snapshotId: 'snapshot',
              locale: 'en',
              formattedAddress: 'Harbour Road',
              buildingNumberFrom: '1',
              createdAt: now,
              updatedAt: now,
            },
          ],
        },
      ],
    } as unknown as ResolvedAddressChunkArtefact
    artefact.rows[0]!.i18n.push({
      ...artefact.rows[0]!.i18n[0]!,
      locale: 'zh-hant',
      formattedAddress: '海港道',
    })
    const sqlFiles = [
      buildAddressCurrentSqlImportFile(message, artefact, {
        currentSnapshotId: 'scope',
      }),
      buildAddressHistorySqlImportFile(message, artefact),
      buildAddressHistoryApplySqlImportFile(message, {
        hasChanges: true,
        snapshotId: 'snapshot',
      }),
    ]
    for (const file of sqlFiles) {
      const key = `release/sql/${file.target}/${file.filename}`
      await bucket.put(key, file.sql)
      message.addressSqlArtefactKeys!.push(key)
    }
    const input = {
      context,
      metaDb: meta,
      bucket,
      message,
      options: {
        isLocal: true,
        currentBinding: context.currentBinding,
        historyBinding: context.historyBinding,
        sourceBinding: context.sourceBinding,
      },
      snapshotId: 'snapshot',
      scopeId: 'scope',
      retiredAddressIds: [],
      parentReplayPlan: [],
      priorVersions: [],
      address3d: { path, sourceVersion: '2026-01-01.0', digest, priorMembership: [] },
      expectedAddressCount: 1,
    }
    const membership: AlsMembership = {
      schemaVersion: 1,
      sourceVersion: '2026-01-01.0',
      aliases: [],
      collections: [],
      addresses: [
        {
          id: 'a',
          parentId: null,
          level: 'building',
          en: 'Harbour Road',
          zhHant: '海港道',
          coordinates: null,
          sourceIds: ['raw'],
          curations: [],
        },
      ],
      sources: [{ id: 'raw', kind: '2d', canonicalIds: ['a'] }],
    }
    const payloads: Array<{
      binding: string
      rows: Array<{ sql: string; params: Array<string | number | null> }>
    }> = []
    const result = await captureResolvedAddressDelivery({
      ...input,
      capture: async (target, bytes, kind) => {
        expect(kind).toBe('bound')
        payloads.push({
          binding: target.bindingName!,
          rows: JSON.parse(new TextDecoder().decode(bytes)),
        })
      },
    })
    expect(result.mutationSummary.tables.DB_CURRENT?.address2d?.inserted).toBe(1)
    expect(current.query('SELECT count(*) AS n FROM address2d').get()).toEqual({ n: 0 })
    expect(
      payloads
        .flatMap(payload => payload.rows)
        .some(row => /staging|zzAddressImport|ssAddressImport/.test(row.sql)),
    ).toBe(false)
    for (const payload of payloads)
      opened[payload.binding]!.transaction(() => {
        for (const row of payload.rows)
          opened[payload.binding]!.query(row.sql).run(...row.params)
      })()
    expect(current.query('SELECT snapshotId,id FROM address2d').all()).toEqual([
      { snapshotId: 'scope', id: 'a' },
    ])
    expect(history.query('SELECT count(*) AS n FROM address2d').get()).toEqual({ n: 1 })
    expect(source.query('SELECT isCurrent FROM hkgovAlsAddresses2d').get()).toEqual({
      isCurrent: 1,
    })
    current.exec("UPDATE addressPublicationState SET status='current'")
    message.releaseId = 'release2'
    artefact.rows[0]!.changed = false
    artefact.rows[0]!.base.snapshotId = 'snapshot2'
    artefact.rows[0]!.i18n[0]!.snapshotId = 'snapshot2'
    artefact.rows[0]!.sourceResolution!.snapshotId = 'snapshot2'
    artefact.rows[0]!.sourceResolution!.sourceReleaseId = 'release2'
    message.addressSqlArtefactKeys = []
    for (const file of [
      buildAddressCurrentSqlImportFile(message, artefact, {
        currentSnapshotId: 'scope',
      }),
      buildAddressHistorySqlImportFile(message, artefact),
      buildAddressHistoryApplySqlImportFile(message, {
        hasChanges: true,
        snapshotId: 'snapshot2',
      }),
    ]) {
      const key = `release2/sql/${file.target}/${file.filename}`
      await bucket.put(key, file.sql)
      message.addressSqlArtefactKeys.push(key)
    }
    const unchanged = await captureResolvedAddressDelivery({
      ...input,
      snapshotId: 'snapshot2',
      parentReplayPlan: [
        {
          snapshotId: 'snapshot',
          parentSnapshotId: null,
          shards: [{ bindingName: 'DB_HISTORY_HK_2026' }],
        },
      ] as Parameters<typeof captureResolvedAddressDelivery>[0]['parentReplayPlan'],
      membership,
      capture: async () => {},
    })
    expect(unchanged.mutationSummary.statements).toBe(0)
    message.releaseId = 'release3'
    artefact.rows[0]!.changed = true
    artefact.rows[0]!.changedExistingId = 'a'
    artefact.rows[0]!.versionHash = 'v3'
    artefact.rows[0]!.base.snapshotId = 'snapshot3'
    artefact.rows[0]!.base.sources = [
      {
        dataset: 'hkgov-dpo-als-2d',
        sourceVersion: '2026-02-01.0',
        sourceFile: 'later.json',
      },
    ]
    for (const row of artefact.rows[0]!.i18n) row.snapshotId = 'snapshot3'
    artefact.rows[0]!.i18n[0]!.formattedAddress = 'Harbour Street'
    artefact.rows[0]!.sourceResolution!.snapshotId = 'snapshot3'
    artefact.rows[0]!.sourceResolution!.sourceReleaseId = 'release3'
    message.addressSqlArtefactKeys = []
    for (const file of [
      buildAddressCurrentSqlImportFile(message, artefact, {
        currentSnapshotId: 'scope',
      }),
      buildAddressHistorySqlImportFile(message, artefact),
      buildAddressHistoryApplySqlImportFile(message, {
        hasChanges: true,
        snapshotId: 'snapshot3',
      }),
    ]) {
      const key = `release3/sql/${file.target}/${file.filename}`
      await bucket.put(key, file.sql)
      message.addressSqlArtefactKeys.push(key)
    }
    const changed = await captureResolvedAddressDelivery({
      ...input,
      snapshotId: 'snapshot3',
      capture: async () => {},
    })
    expect(changed.mutationSummary.tables.DB_CURRENT?.address2d?.updated).toBe(0)
    expect(changed.mutationSummary.tables.DB_CURRENT?.address2dI18n?.updated).toBe(1)
    expect(changed.mutationSummary.tables.DB_HISTORY_HK_2026?.address2d?.inserted).toBe(
      0,
    )
    expect(changed.mutationSummary.tables.DB_HISTORY_HK_2026?.address2d?.updated).toBe(
      0,
    )
    expect(
      changed.mutationSummary.tables.DB_HISTORY_HK_2026?.address2dI18n?.inserted,
    ).toBe(1)
    expect(
      changed.mutationSummary.tables.DB_HISTORY_HK_2026?.address2dI18n?.updated,
    ).toBe(1)
    expect(
      changed.mutationSummary.tables.DB_HISTORY_HK_2026?.address2dBuildingNumberLookup
        ?.inserted,
    ).toBe(0)
    expect(
      changed.mutationSummary.tables.DB_HISTORY_HK_2026?.address2dBuildingNumberLookup
        ?.updated,
    ).toBe(0)
    let appended = 0
    await expect(
      captureResolvedAddressDelivery({
        ...input,
        expectedAddressCount: 2,
        capture: async () => {
          appended++
        },
      }),
    ).rejects.toThrow('projection is incomplete')
    expect(appended).toBe(0)
    await expect(
      captureResolvedAddressDelivery({
        ...input,
        snapshotId: 'snapshot3',
        membership: {
          ...membership,
          addresses: [{ ...membership.addresses[0]!, id: 'wrong' }],
        },
        capture: async () => {
          appended++
        },
      }),
    ).rejects.toThrow('reviewed canonical membership')
    expect(appended).toBe(0)
    current.exec("UPDATE address2dI18n SET formattedAddress='   '")
    expect(() => validateResolvedAddressProjection(current, 'scope', 1)).toThrow(
      'without localised values',
    )
  } finally {
    for (const db of dbs) db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
