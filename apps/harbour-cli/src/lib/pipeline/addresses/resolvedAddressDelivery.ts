import type { Database } from 'bun:sqlite'
import type { MetaDatabase } from '@repo/db'
import type { DatasetProcessingMessage } from '@repo/core'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import type { ResolvedSnapshotVersion } from '@repo/core/pipeline/db/snapshotReplay'
import type { AlsMembership } from '../../sources/hkgov/dpo/hkgovAlsMembership.ts'
import {
  closeResolvedAddressHistory,
  coalesceAddressSourceResolutions,
} from './resolvedAddressHistory.ts'
import {
  importAddressSqlArtefacts,
  type AddressSqlImportStageOptions,
} from '@repo/core/pipeline/services/addresses/sqlImportStages'
import type { AddressPublicationReceipt } from '@repo/core/pipeline/db/addressPublication'
import { buildAddressRetirementSqlImportFiles } from '@repo/core/pipeline/services/addresses/sqlImport'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import { captureNetSqlitePlan, type NetTablePolicy } from '../local/netSqlitePlan.ts'
import { executeNativeSqlStatements } from '../local/nativeSqlStatements.ts'
import type { LocalPipelineBucket } from '../local/localBucket.ts'
import {
  createAddress3dExecutor,
  importAddress3dCollections,
} from './address3dImport.ts'
import { addressPublicationDelivery } from './addressPublicationDelivery.ts'
import { coalesceAddressHistory } from './coalesceAddressHistory.ts'
import { assertAddressProjectionMembership } from './addressProjectionMembership.ts'
import { buildAddressBuildingNumberLookupRows } from '@repo/core/pipeline/services/addresses/normalisation'

const addressTables = [
  'address2d',
  'address2dI18n',
  'address2dBuildingNumberLookup',
  'address3d',
  'address3dI18n',
]

/** Explicit ownership keeps unrelated families out of an Address mutation plan. */
export function addressMutationTables(binding: string): NetTablePolicy[] {
  const names =
    binding === 'DB_CURRENT'
      ? addressTables
      : binding.startsWith('DB_HISTORY_')
        ? [
            ...addressTables,
            'address2dEvidence',
            'snapshotVersionChanges',
            'sourceResolutions',
          ]
        : binding.startsWith('DB_SOURCE_')
          ? ['hkgovAlsAddresses2d', 'hkgovAlsAddresses3d']
          : []
  return names.map(name => ({
    name,
    ...(!['addressPublicationState', 'sourceResolutions'].includes(name)
      ? { ignoredColumns: ['createdAt', 'updatedAt'] }
      : {}),
    ...(binding === 'DB_CURRENT' && ['address3d', 'address3dI18n'].includes(name)
      ? {
          collection: {
            name: 'address3d',
            keyColumns: ['snapshotId', name === 'address3d' ? 'id' : 'address3dId'],
          },
        }
      : {}),
  }))
}

const noopClient = {
  async stageRunning() {},
  async stageCompleted() {},
  async stageFailed() {},
  async publishDataset() {},
}

type Capture = (
  target: { databaseId: string | null; bindingName?: string },
  bytes: Uint8Array,
  kind?: 'sql' | 'bound',
) => Promise<void>

/**
 * The caller holds the shared mirror lock through generation and sealing.
 * Staging, set operations and all Address3D reads run on disposable local copies.
 * Only the validated final row differences reach the delivery engine.
 */
export async function captureResolvedAddressDelivery(input: {
  context: LocalAddressDbContext
  metaDb: MetaDatabase
  bucket: LocalPipelineBucket
  message: DatasetProcessingMessage
  options: AddressSqlImportStageOptions
  snapshotId: string
  scopeId: string
  expectedAddressCount: number
  retiredAddressIds: readonly string[]
  membership?: AlsMembership
  parentReplayPlan: SnapshotReplayStep[]
  priorVersions: ResolvedSnapshotVersion[]
  address3d?: {
    path: string
    sourceVersion: string
    digest: string
    priorMembership: Array<{
      recordType: string
      recordId: string
      locale: string
      versionHash?: string
      shard?: { bindingName: string }
    }>
  }
  capture: Capture
}) {
  const files = input.context.state.files
  if (!files) throw new Error('Resolved Address planning requires local mirror files.')
  const targets = Object.fromEntries(
    Object.entries(files).flatMap(([binding, path]) => {
      const tables = addressMutationTables(binding)
      if (!tables.length) return []
      return [
        [
          binding,
          {
            path,
            databaseId: input.context.state.bindings[binding]?.databaseId ?? binding,
            tables,
          },
        ],
      ]
    }),
  )
  const metaPayloads: Uint8Array[] = []
  let previous: AddressPublicationReceipt | null = null
  let validationSql = '0'
  const publication = addressPublicationDelivery({
    owner: {
      scopeId: input.scopeId,
      snapshotId: input.snapshotId,
      publicationToken: crypto.randomUUID(),
    },
    target: {
      bindingName: 'DB_CURRENT',
      databaseId: input.context.state.bindings.DB_CURRENT?.databaseId ?? 'DB_CURRENT',
    },
    previous: () => previous,
    validation: () => validationSql,
    capture: input.capture,
  })
  const result = await captureNetSqlitePlan({
    targets,
    // Reserve one statement and payload space for each transaction's ownership guard.
    limits: { maxStatements: 63, maxPayloadBytes: 4 * 1024 * 1024 - 4096 },
    append: publication.append,
    generate: async candidates => {
      const current = candidates.DB_CURRENT?.db
      if (!current) throw new Error('Address planning requires DB_CURRENT.')
      previous = current
        .query<AddressPublicationReceipt, [string]>(
          'SELECT * FROM addressPublicationState WHERE scopeId = ?',
        )
        .get(input.scopeId)
      const bindingFor = (destination: {
        databaseId: string | null
        binding?: { bindingName?: string }
      }) => {
        const named = destination.binding?.bindingName
        if (named && candidates[named]) return named
        const match = Object.entries(input.context.state.bindings).find(
          ([, value]) =>
            value.databaseId && value.databaseId === destination.databaseId,
        )?.[0]
        if (!match || !candidates[match])
          throw new Error('Address SQL resolved an unknown local planning target.')
        return match
      }
      await importAddressSqlArtefacts(
        noopClient,
        input.metaDb,
        input.bucket,
        input.message,
        {
          ...input.options,
          isLocal: true,
          accountId: undefined,
          apiToken: undefined,
          captureSql: async (destination, bytes) => {
            // The complete publisher ledger includes suppressed and curated rows;
            // it is the sole ALS source writer across all retained source shards.
            if (input.address3d && destination.name === 'source') return
            if (destination.name === 'meta') {
              metaPayloads.push(bytes)
              return
            }
            const candidate = candidates[bindingFor(destination)]!.db
            candidate
              .transaction(() =>
                executeNativeSqlStatements(candidate, new TextDecoder().decode(bytes)),
              )
              .immediate()
          },
        },
      )
      if (input.address3d) {
        const localBinding = (original: { bindingName?: string } | undefined) => {
          const name = original?.bindingName
          if (!name || !candidates[name])
            throw new Error('Address3D planning requires named local shard bindings.')
          return createLocalExecBinding(candidates[name]!.db, name)
        }
        await importAddress3dCollections({
          ...input.address3d,
          expectedDigest: input.address3d.digest,
          snapshotId: input.snapshotId,
          currentSnapshotId: input.scopeId,
          releaseId: input.message.releaseId ?? input.message.datasetId,
          timestamp: input.message.processingRunStartedAt,
          historyShards: Object.entries(candidates)
            .filter(([name]) => name.startsWith('DB_HISTORY_'))
            .map(([bindingName, candidate]) => ({
              bindingName,
              execute: async (statements: Array<{ sql: string; params: unknown[] }>) =>
                candidate.db.transaction(() =>
                  statements.flatMap(
                    statement =>
                      candidate.db
                        .query(statement.sql)
                        .all(
                          ...(statement.params as Array<string | number | null>),
                        ) as Record<string, unknown>[],
                  ),
                )(),
            })),
          sourceShards: Object.entries(candidates)
            .filter(([name]) => name.startsWith('DB_SOURCE_'))
            .map(([bindingName, candidate]) => ({
              bindingName,
              execute: async (statements: Array<{ sql: string; params: unknown[] }>) =>
                candidate.db.transaction(() =>
                  statements.flatMap(
                    statement =>
                      candidate.db
                        .query(statement.sql)
                        .all(
                          ...(statement.params as Array<string | number | null>),
                        ) as Record<string, unknown>[],
                  ),
                )(),
            })),
          execute: await createAddress3dExecutor(input.metaDb, input.message, {
            ...input.options,
            isLocal: true,
            accountId: undefined,
            apiToken: undefined,
            captureSql: undefined,
            captureQueries: undefined,
            currentBinding: localBinding(input.context.currentBinding),
            historyBinding: localBinding(input.context.historyBinding),
            sourceBinding: localBinding(input.context.sourceBinding),
          }),
        })
      }
      applyResolvedAddressRetirements(candidates, input)
      const historyBinding = input.context.historyBinding?.bindingName
      if (!historyBinding)
        throw new Error('Address planning requires a selected history shard.')
      coalesceAddressHistory({
        candidates,
        files,
        historyBinding,
        prior: input.priorVersions,
        snapshotId: input.snapshotId,
        scopeId: input.scopeId,
        now: input.message.processingRunStartedAt ?? new Date().toISOString(),
      })
      closeResolvedAddressHistory({
        candidates,
        historyBinding,
        prior: input.priorVersions,
        snapshotId: input.snapshotId,
        scopeId: input.scopeId,
        releaseId: input.message.releaseId ?? input.message.datasetId,
        now: input.message.processingRunStartedAt ?? new Date().toISOString(),
      })
      if (input.membership)
        coalesceAddressSourceResolutions({
          candidates,
          historyBinding,
          membership: input.membership,
          parentPlan: input.parentReplayPlan,
          snapshotId: input.snapshotId,
          releaseId: input.message.releaseId ?? input.message.datasetId,
        })
      validateResolvedAddressProjection(
        current,
        input.scopeId,
        input.expectedAddressCount,
      )
      if (input.membership)
        assertAddressProjectionMembership(current, input.scopeId, input.membership)
      validationSql = buildDeliveredAddressValidationSql(current, input.scopeId)
      return { addressCount: input.expectedAddressCount, snapshotId: input.snapshotId }
    },
  })
  await publication.complete()
  // Metadata registration follows every data target. Lifecycle status/publication
  // remains controlled by the owning release after delivery has been acknowledged.
  for (const bytes of metaPayloads) {
    await input.capture(
      {
        bindingName: 'DB_META',
        databaseId: input.context.state.bindings.DB_META?.databaseId ?? 'DB_META',
      },
      bytes,
      'sql',
    )
  }
  return { ...result.result, mutationSummary: result.summary }
}

function applyResolvedAddressRetirements(
  candidates: Record<string, { db: Database }>,
  input: Pick<
    Parameters<typeof captureResolvedAddressDelivery>[0],
    'retiredAddressIds' | 'scopeId' | 'snapshotId' | 'message' | 'context'
  >,
) {
  if (!input.retiredAddressIds.length) return
  const files = buildAddressRetirementSqlImportFiles(input.message, {
    addressIds: input.retiredAddressIds,
    scopeId: input.scopeId,
    snapshotId: input.snapshotId,
  })
  const historyName = input.context.historyBinding?.bindingName
  const history = historyName ? candidates[historyName]?.db : undefined
  if (!history) throw new Error('Address retirement requires a selected history shard.')
  // Journal all locales found on the selected predecessor across retained shards.
  const now = input.message.processingRunStartedAt ?? new Date().toISOString()
  const releaseId = input.message.releaseId ?? input.message.datasetId
  for (const [name, { db }] of Object.entries(candidates)) {
    if (!name.startsWith('DB_HISTORY_') || name === historyName) continue
    for (const id of input.retiredAddressIds) {
      const locales = db
        .query<{ locale: string }, [string]>(
          'SELECT DISTINCT locale FROM address2dI18n WHERE addressId=? AND isCurrent=1',
        )
        .all(id)
      for (const { locale } of locales)
        history
          .query(`INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId,createdAt,updatedAt)
          VALUES(?,'address2dI18n',?,?,NULL,'delete',?,?,?) ON CONFLICT(snapshotId,recordType,recordId,locale) DO NOTHING`)
          .run(input.snapshotId, id, locale, releaseId, now, now)
      for (const [table, key] of [
        ['address2d', 'id'],
        ['address2dI18n', 'addressId'],
        ['address2dBuildingNumberLookup', 'addressId'],
      ])
        db.query(
          `UPDATE ${table} SET isCurrent=0,updatedAt=? WHERE ${key}=? AND isCurrent=1`,
        ).run(now, id)
    }
  }
  for (const file of files) {
    const db = file.target === 'current' ? candidates.DB_CURRENT!.db : history
    db.transaction(() => executeNativeSqlStatements(db, file.sql))()
  }
}

export function validateResolvedAddressProjection(
  db: Database,
  scopeId: string,
  expectedCount: number,
) {
  const count = db
    .query<{ count: number }, [string]>(
      'SELECT COUNT(*) AS count FROM address2d WHERE snapshotId = ?',
    )
    .get(scopeId)?.count
  if (
    !Number.isSafeInteger(expectedCount) ||
    expectedCount < 0 ||
    count !== expectedCount
  )
    throw new Error(
      `Address projection is incomplete: expected ${expectedCount}, found ${count}.`,
    )
  const orphan = db
    .query(
      `SELECT child.id FROM address2d child
     LEFT JOIN address2d parent ON parent.snapshotId = child.snapshotId AND parent.id = child.parentAddressId
     WHERE child.snapshotId = ? AND child.parentAddressId IS NOT NULL AND parent.id IS NULL LIMIT 1`,
    )
    .get(scopeId)
  if (orphan) throw new Error('Address projection has a missing parent.')
  const missingLocale = db
    .query(
      `SELECT a.id FROM address2d a WHERE a.snapshotId = ? AND NOT EXISTS
     (SELECT 1 FROM address2dI18n i WHERE i.snapshotId = a.snapshotId AND i.addressId = a.id
      AND TRIM(COALESCE(i.formattedAddress,'') || COALESCE(i.buildingName,'') || COALESCE(i.estateName,'') || COALESCE(i.streetName,'') || COALESCE(i.phaseName,'') || COALESCE(i.blockExpression,'')) <> '') LIMIT 1`,
    )
    .get(scopeId)
  if (missingLocale)
    throw new Error('Address projection has an address without localised values.')
  validateAddressBuildingNumberLookups(db, scopeId)
  const missing3dOwner = db
    .query(`SELECT a.id FROM address3d a WHERE a.snapshotId = ? AND
    (NOT EXISTS (SELECT 1 FROM address2d owner WHERE owner.snapshotId = a.snapshotId AND owner.id = a.address2dId)
    OR EXISTS (SELECT 1 FROM json_each(a.unresolvedSectionIds) section WHERE NOT EXISTS
      (SELECT 1 FROM address2d child WHERE child.snapshotId = a.snapshotId AND child.id = section.value AND child.parentAddressId = a.address2dId))
    OR NOT EXISTS (SELECT 1 FROM address3dI18n i WHERE i.snapshotId = a.snapshotId AND i.address3dId = a.id)
    OR a.unitCount <= 0 OR json_array_length(a.units) <> a.unitCount
    OR EXISTS (SELECT 1 FROM address3dI18n i WHERE i.snapshotId=a.snapshotId AND i.address3dId=a.id AND
      ((SELECT count(*) FROM json_each(i.units)) <> a.unitCount OR EXISTS
        (SELECT 1 FROM json_each(i.units) translation WHERE
          TRIM(COALESCE(json_extract(translation.value,'$.formattedAddressPart'),
            COALESCE(json_extract(translation.value,'$.floorExpression'),'') ||
            COALESCE(json_extract(translation.value,'$.unitExpression'),''))) = '') OR EXISTS
        (SELECT 1 FROM json_each(a.units) unit WHERE NOT EXISTS
          (SELECT 1 FROM json_each(i.units) translation WHERE translation.key=json_extract(unit.value,'$.id')))))) LIMIT 1`)
    .get(scopeId)
  if (missing3dOwner)
    throw new Error(
      'Address projection has incomplete Address3D ownership, units or localisations.',
    )
  for (const table of addressTables) {
    if (db.query(`PRAGMA foreign_key_check(${table})`).get())
      throw new Error(`Address projection has invalid references in ${table}.`)
  }
}

/** Executed on the real target in the same transaction as its preparation receipt. */
export function buildDeliveredAddressValidationSql(db: Database, scopeId: string) {
  const scope = `'${scopeId.replaceAll("'", "''")}'`
  const counts = addressTables.map(table => {
    const count = db
      .query<{ count: number }, [string]>(
        `SELECT count(*) AS count FROM ${table} WHERE snapshotId = ?`,
      )
      .get(scopeId)?.count
    if (!Number.isSafeInteger(count))
      throw new Error('Invalid Address preparation count.')
    return `(SELECT count(*) FROM ${table} WHERE snapshotId = ${scope}) = ${count}`
  })
  return [
    ...counts,
    `NOT EXISTS (SELECT 1 FROM address2d a WHERE a.snapshotId = ${scope} AND (
      (a.parentAddressId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM address2d parent WHERE parent.snapshotId = a.snapshotId AND parent.id = a.parentAddressId))
      OR NOT EXISTS (SELECT 1 FROM address2dI18n i WHERE i.snapshotId = a.snapshotId AND i.addressId = a.id)))`,
    `NOT EXISTS (SELECT 1 FROM address3d a WHERE a.snapshotId = ${scope} AND (
      NOT EXISTS (SELECT 1 FROM address2d owner WHERE owner.snapshotId = a.snapshotId AND owner.id = a.address2dId)
      OR NOT EXISTS (SELECT 1 FROM address3dI18n i WHERE i.snapshotId = a.snapshotId AND i.address3dId = a.id)
      OR json_array_length(a.units) <> a.unitCount
      OR EXISTS (SELECT 1 FROM json_each(a.unresolvedSectionIds) section WHERE NOT EXISTS
        (SELECT 1 FROM address2d child WHERE child.snapshotId = a.snapshotId AND child.id = section.value AND child.parentAddressId = a.address2dId))))`,
  ].join(' AND ')
}

function validateAddressBuildingNumberLookups(db: Database, scopeId: string) {
  type Localisation = Parameters<typeof buildAddressBuildingNumberLookupRows>[0][number]
  type Lookup = ReturnType<typeof buildAddressBuildingNumberLookupRows>[number]
  const actual = db
    .query<
      Lookup,
      [string]
    >(`SELECT addressId,buildingNumber,numericStem,evidence,derivation
    FROM address2dBuildingNumberLookup WHERE snapshotId = ? ORDER BY addressId,buildingNumber`)
    .iterate(scopeId)
  let pending: Localisation[] = []
  const flush = () => {
    const expected = buildAddressBuildingNumberLookupRows(pending).sort((a, b) =>
      a.buildingNumber < b.buildingNumber
        ? -1
        : a.buildingNumber > b.buildingNumber
          ? 1
          : 0,
    )
    for (const lookup of expected) {
      const row = actual.next().value
      if (
        !row ||
        Object.keys(lookup).some(
          key => row[key as keyof Lookup] !== lookup[key as keyof Lookup],
        )
      )
        throw new Error('Address projection has incomplete building-number lookups.')
    }
    pending = []
  }
  for (const row of db
    .query<
      Localisation,
      [string]
    >(`SELECT addressId,buildingNumberFrom,buildingNumberTo,buildingNumberConnector
    FROM address2dI18n WHERE snapshotId = ? ORDER BY addressId,locale`)
    .iterate(scopeId)) {
    if (pending.length && pending[0]!.addressId !== row.addressId) flush()
    pending.push(row)
  }
  flush()
  if (!actual.next().done)
    throw new Error('Address projection has unexpected building-number lookups.')
}
