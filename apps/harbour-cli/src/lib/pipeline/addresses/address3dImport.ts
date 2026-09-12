import { sourceLocatorFromReferences } from '@repo/core/pipeline/services/sources/sourcePayload'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { DatasetProcessingMessage } from '@repo/core'
import type { MetaDatabase } from '@repo/db'
import {
  resolveImportTarget,
  type AddressSqlImportStageOptions,
} from '@repo/core/pipeline/services/addresses/sqlImportStages'
import type { PreparedAls3dRecord } from '../../sources/hkgov/dpo/hkgovAls3dPreparation'
import {
  sourceResolutionSql,
  resolvedEntities,
} from '@repo/core/pipeline/db/sourceResolutions'
import { als3dHash, assertAddress3dRowBudget } from '../../sources/hkgov/dpo/hkgovAls3d'
import { validateAddress3dOwners } from './address3dOwners'

type Statement = { sql: string; params: unknown[] }
type Target = 'current' | 'history' | 'source'
type Collection = Extract<PreparedAls3dRecord, { kind: 'collection' }>
export type Address3dImportShard = {
  bindingName: string
  execute: (statements: Statement[]) => Promise<Record<string, unknown>[]>
}
type PriorMembership = {
  recordType: string
  recordId: string
  locale: string
  versionHash?: string
  shard?: { bindingName: string }
}
const membershipKey = (
  row: Pick<PriorMembership, 'recordType' | 'recordId' | 'locale'>,
) => JSON.stringify([row.recordType, row.recordId, row.locale])

async function* records(path: string) {
  for await (const line of createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  })) {
    if (line.trim()) yield JSON.parse(line) as PreparedAls3dRecord
  }
}
export async function fileSha256(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function validateAddress3dPreparation(
  path: string,
  sourceVersion: string,
) {
  const ids = new Set<string>()
  const owners = new Set<string>()
  const unitIds = new Set<string>()
  const sourceIds = new Set<string>()
  const source2dIds = new Set<string>()
  let manifest: Extract<PreparedAls3dRecord, { kind: 'manifest' }> | undefined
  let units = 0
  let localisedCollectionCount = 0
  for await (const row of records(path)) {
    if (manifest) throw new Error('Address3D manifest must be the final record')
    if (row.kind === 'manifest') {
      manifest = row
      continue
    }
    if (
      (row.kind === 'source2d' || row.kind === 'source') &&
      !Object.hasOwn(row, 'properties')
    )
      throw new Error(
        'Address3D source properties are missing; prepare the ALS release again',
      )
    if (row.kind === 'source2d') {
      if (source2dIds.has(row.sourceRecordId))
        throw new Error(`Duplicate ALS 2D source occurrence ${row.sourceRecordId}`)
      source2dIds.add(row.sourceRecordId)
      assertAddress3dRowBudget(row)
    } else if (row.kind === 'source') {
      if (sourceIds.has(row.sourceRecordId))
        throw new Error(`Duplicate source occurrence ${row.sourceRecordId}`)
      sourceIds.add(row.sourceRecordId)
      assertAddress3dRowBudget(row)
    } else if (row.kind === 'collection') {
      if (
        Object.keys(row.locales).sort().join(',') !== 'en,zh-hant' ||
        (row.sourceRecordIds.length === 0 && !row.processingSources?.length)
      )
        throw new Error(
          'Address3D requires paired ALS locales and retained source occurrences',
        )
      if (ids.has(row.id) || owners.has(row.address2dId))
        throw new Error('Duplicate Address3D collection/owner')
      if (
        row.unitCount !== row.units.length ||
        new Set(row.units.map(unit => unit.id)).size !== row.unitCount
      )
        throw new Error('Invalid Address3D unit count/identity')
      if (row.contentHash !== als3dHash({ units: row.units, locales: row.locales }))
        throw new Error('Address3D content hash mismatch')
      for (const unit of row.units) {
        if (unitIds.has(unit.id))
          throw new Error('Address3D unit belongs to multiple collections')
        unitIds.add(unit.id)
      }
      assertAddress3dRowBudget(row.units)
      if (row.sourceRecordIds.some(id => !sourceIds.has(id)))
        throw new Error('Address3D collection has missing source occurrences')
      for (const localised of Object.values(row.locales)) {
        if (
          Object.keys(localised).length !== row.unitCount ||
          row.units.some(unit => !localised[unit.id])
        )
          throw new Error('Address3D locale membership mismatch')
        assertAddress3dRowBudget(localised)
      }
      localisedCollectionCount += Object.keys(row.locales).length
      ids.add(row.id)
      owners.add(row.address2dId)
      units += row.unitCount
    } else throw new Error('Unknown Address3D record kind')
  }
  if (
    !manifest ||
    manifest.sourceVersion !== sourceVersion ||
    manifest.collectionCount !== ids.size ||
    manifest.sourceCount !== sourceIds.size ||
    (manifest.source2dCount ?? 0) !== source2dIds.size ||
    manifest.unitCount !== units
  )
    throw new Error(
      'Incomplete or stale Address3D preparation; prepare the ALS release again',
    )
  return { ...manifest, localisedCollectionCount, ids, digest: await fileSha256(path) }
}

/** Small SQL text with one bound row per statement; batches stay collection-sized. */
export async function createAddress3dExecutor(
  metaDb: MetaDatabase,
  message: DatasetProcessingMessage,
  options: AddressSqlImportStageOptions,
) {
  const targets = new Map(
    await Promise.all(
      (['current', 'history', 'source'] as const).map(
        async target =>
          [
            target,
            await resolveImportTarget(metaDb, message, target, options),
          ] as const,
      ),
    ),
  )
  return async (
    target: Target,
    statements: Statement[],
  ): Promise<Record<string, unknown>[]> => {
    const context = targets.get(target)
    if (!context) throw new Error(`Missing ${target} target`)
    for (const statement of statements) {
      if (statement.params.length > 100 || Buffer.byteLength(statement.sql) > 100_000)
        throw new Error('D1 statement budget exceeded')
    }
    if (
      options.captureQueries &&
      statements.every(statement => !/^\s*SELECT\b/i.test(statement.sql))
    ) {
      await options.captureQueries(context, statements)
      return []
    }
    if (options.isLocal) {
      const binding = context.binding
      if (!binding?.prepare) throw new Error(`Missing ${target} D1 binding`)
      const prepared = statements.map(statement => {
        const query = binding.prepare?.(statement.sql)
        if (!query?.bind) throw new Error(`Missing parameter binding for ${target}`)
        return query.bind(...statement.params)
      })
      if (binding.batch) {
        const results = (await binding.batch(prepared)) as Array<{
          success?: boolean
          results?: Record<string, unknown>[]
        }>
        if (results.some(result => result.success === false))
          throw new Error(`Address3D ${target} batch failed`)
        return results.flatMap(result => result.results ?? [])
      }
      const results: Record<string, unknown>[] = []
      for (const query of prepared) {
        if (query.all) results.push(...(await query.all()).results)
        else await query.run()
      }
      return results
    }
    if (!options.accountId || !options.apiToken || !context.databaseId)
      throw new Error(`Missing remote ${target} configuration`)
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/d1/database/${context.databaseId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batch: statements }),
        signal: AbortSignal.timeout(30_000),
      },
    )
    const body = (await response.json()) as {
      success: boolean
      result?: Array<{ success: boolean; results?: Record<string, unknown>[] }>
      errors?: unknown[]
    }
    if (!response.ok || !body.success || body.result?.some(result => !result.success))
      throw new Error(
        `Address3D ${target} query failed (${response.status}): ${JSON.stringify(body.errors ?? [])}`,
      )
    return body.result?.flatMap(result => result.results ?? []) ?? []
  }
}

const insert = (table: string, row: Record<string, unknown>, conflict: string) => ({
  sql: `INSERT INTO "${table}" (${Object.keys(row)
    .map(key => `"${key}"`)
    .join(',')}) VALUES (${Object.keys(row)
    .map(() => '?')
    .join(',')}) ${conflict}`,
  params: Object.values(row).map(value =>
    value === undefined
      ? null
      : typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : value,
  ),
})

export function collectionStatements(
  collection: Collection,
  snapshotId: string,
  releaseId: string,
  now: string,
  currentSnapshotId = snapshotId,
) {
  const {
    kind: _kind,
    locales,
    sourceRecordIds,
    processingSources,
    contentHash: _preparedContentHash,
    ...baseFields
  } = collection
  // The prepared envelope seals the complete bilingual inventory. Stored base
  // content has independent identity, so editing one locale leaves it open.
  const base = { ...baseFields, contentHash: als3dHash({ units: baseFields.units }) }
  const sources = [
    ...sourceRecordIds.map(sourceRecordId => ({
      dataset: 'hkgov-dpo-als-3d',
      sourceRecordId,
    })),
    ...(processingSources ?? []),
  ]
  const versionHash = als3dHash({ ...base, sources })
  const history = {
    ...base,
    sources,
    versionHash,
    sourceReleaseId: releaseId,
    snapshotId,
    isCurrent: 1,
    createdAt: now,
    updatedAt: now,
  }
  const current = {
    ...base,
    sources,
    snapshotId: currentSnapshotId,
    createdAt: now,
    updatedAt: now,
  }
  const currentStatements = [
    insert('address3d', current, 'ON CONFLICT(snapshotId,id) DO NOTHING'),
  ]
  const historyStatements = [
    insert(
      'address3d',
      history,
      'ON CONFLICT(id,versionHash) DO UPDATE SET isCurrent=1,updatedAt=excluded.updatedAt WHERE address3d.isCurrent <> 1',
    ),
    journalStatement(snapshotId, releaseId, 'address3d', base.id, '', versionHash, now),
  ]
  for (const [locale, units] of Object.entries(locales)) {
    const localeVersionHash = als3dHash({ address3dId: base.id, locale, units })
    const fields = {
      address3dId: base.id,
      locale,
      units,
      createdAt: now,
      updatedAt: now,
    }
    currentStatements.push(
      insert(
        'address3dI18n',
        { ...fields, snapshotId: currentSnapshotId },
        'ON CONFLICT(snapshotId,address3dId,locale) DO NOTHING',
      ),
    )
    historyStatements.push(
      insert(
        'address3dI18n',
        {
          ...fields,
          snapshotId,
          versionHash: localeVersionHash,
          sourceReleaseId: releaseId,
          isCurrent: 1,
        },
        'ON CONFLICT(address3dId,versionHash,locale) DO UPDATE SET isCurrent=1,updatedAt=excluded.updatedAt WHERE address3dI18n.isCurrent <> 1',
      ),
      journalStatement(
        snapshotId,
        releaseId,
        'address3dI18n',
        base.id,
        locale,
        localeVersionHash,
        now,
      ),
    )
  }
  for (const row of [current, history]) assertAddress3dRowBudget(row)
  return { currentStatements, historyStatements }
}

function journalStatement(
  snapshotId: string,
  sourceReleaseId: string,
  recordType: string,
  recordId: string,
  locale: string,
  versionHash: string | null,
  now: string,
) {
  return insert(
    'snapshotVersionChanges',
    {
      snapshotId,
      sourceReleaseId,
      recordType,
      recordId,
      locale,
      versionHash,
      operation: versionHash ? 'upsert' : 'delete',
      createdAt: now,
      updatedAt: now,
    },
    'ON CONFLICT(snapshotId,recordType,recordId,locale) DO UPDATE SET versionHash=excluded.versionHash,operation=excluded.operation,sourceReleaseId=excluded.sourceReleaseId,updatedAt=excluded.updatedAt',
  )
}

export async function importAddress3dCollections(args: {
  path: string
  sourceVersion: string
  snapshotId: string
  currentSnapshotId?: string
  releaseId: string
  expectedDigest: string
  timestamp?: string
  priorMembership: PriorMembership[]
  /** Complete local candidate shards, including previous years. */
  historyShards?: Address3dImportShard[]
  sourceShards?: Address3dImportShard[]
  execute: Awaited<ReturnType<typeof createAddress3dExecutor>>
}) {
  const validated = await validateAddress3dPreparation(args.path, args.sourceVersion)
  if (validated.digest !== args.expectedDigest)
    throw new Error('Address3D preparation changed after validation')
  const now = args.timestamp ?? new Date().toISOString()
  const historyShards = new Map(
    args.historyShards?.map(shard => [shard.bindingName, shard]),
  )
  const sourceShards = args.sourceShards ?? [
    {
      bindingName: 'source',
      execute: (statements: Statement[]) => args.execute('source', statements),
    },
  ]
  const priorByKey = new Map(
    args.priorMembership.map(prior => [membershipKey(prior), prior]),
  )
  const seenMembership = new Set<string>()
  const historyExecutor = (prior: PriorMembership) => {
    if (!prior.shard)
      return (statements: Statement[]) => args.execute('history', statements)
    const shard = historyShards.get(prior.shard.bindingName)
    if (!shard)
      throw new Error(
        `Address3D requires prior history shard ${prior.shard.bindingName}.`,
      )
    return shard.execute
  }
  for (const prior of args.priorMembership) historyExecutor(prior)
  const closeHistory = async (prior: PriorMembership) => {
    if (prior.recordType !== 'address3d' && prior.recordType !== 'address3dI18n')
      throw new Error(`Unexpected Address3D prior record type ${prior.recordType}.`)
    const localised = prior.recordType === 'address3dI18n'
    await historyExecutor(prior)([
      {
        sql: `UPDATE ${prior.recordType} SET isCurrent = 0, updatedAt = ? WHERE ${localised ? 'address3dId' : 'id'} = ?${localised ? ' AND locale = ?' : ''}${prior.versionHash ? ' AND versionHash = ?' : ''} AND isCurrent = 1`,
        params: [
          now,
          prior.recordId,
          ...(localised ? [prior.locale] : []),
          ...(prior.versionHash ? [prior.versionHash] : []),
        ],
      },
    ])
  }
  const sourceVersions = new Map<string, string>()
  await validateAddress3dOwners(
    args.currentSnapshotId ?? args.snapshotId,
    ownerReferences(args.path),
    args.execute,
  )
  // Source versions remain open across releases. Compare membership explicitly;
  // releaseId identifies the assertion's provenance, not its last observation.
  type SourceVersion = {
    versionHash: string
    shard: Address3dImportShard
    releaseId: string
    validFromRelease: string
  }
  const remainingSources = new Map<string, Map<string, SourceVersion[]>>()
  for (const table of [
    ...(validated.source2dCount === undefined ? [] : ['hkgovAlsAddresses2d']),
    'hkgovAlsAddresses3d',
  ]) {
    const remaining = new Map<string, SourceVersion[]>()
    for (const shard of sourceShards) {
      let cursor: number | undefined
      for (;;) {
        const rows = await shard.execute([
          {
            sql: `SELECT rowid, sourceRecordId, versionHash, releaseId, validFromRelease FROM ${table} WHERE ${cursor === undefined ? '' : `rowid > ${cursor} AND `}isCurrent = 1 ORDER BY rowid LIMIT 1024`,
            params: [],
          },
        ])
        if (!rows.length) break
        for (const row of rows) {
          if (
            typeof row.sourceRecordId !== 'string' ||
            typeof row.versionHash !== 'string' ||
            !Number.isSafeInteger(row.rowid)
          )
            throw new Error(`Invalid current ALS source identity in ${table}`)
          remaining.set(row.sourceRecordId, [
            ...(remaining.get(row.sourceRecordId) ?? []),
            {
              versionHash: row.versionHash,
              shard,
              releaseId: String(row.releaseId),
              validFromRelease: String(row.validFromRelease),
            },
          ])
        }
        cursor = Math.max(...rows.map(row => row.rowid as number))
      }
    }
    remainingSources.set(table, remaining)
  }
  // The snapshot is still draft; retries replace its complete collection set.
  await args.execute('current', [
    {
      sql: 'DELETE FROM address3dI18n WHERE snapshotId = ?',
      params: [args.currentSnapshotId ?? args.snapshotId],
    },
    {
      sql: 'DELETE FROM address3d WHERE snapshotId = ?',
      params: [args.currentSnapshotId ?? args.snapshotId],
    },
  ])
  for await (const record of records(args.path)) {
    if (record.kind === 'source' || record.kind === 'source2d') {
      const sourceTable =
        record.kind === 'source2d' ? 'hkgovAlsAddresses2d' : 'hkgovAlsAddresses3d'
      const publisherSources = record.sources.filter(
        value =>
          value &&
          typeof value === 'object' &&
          (value as { dataset?: string }).dataset?.startsWith('hkgov-dpo-als-'),
      )
      const decisions = record.sources.filter(
        value => !publisherSources.includes(value),
      ) as Array<Record<string, unknown>>
      if (record.kind === 'source') {
        sourceVersions.set(record.sourceRecordId, record.versionHash)
        await args.execute('history', [
          {
            sql: sourceResolutionSql({
              snapshotId: args.snapshotId,
              sourceReleaseId: args.releaseId,
              sourceRecordId: record.sourceRecordId,
              sourceVersionHash: record.versionHash,
              resolutions: { entities: {}, ...(decisions.length ? { decisions } : {}) },
            }),
            params: [],
          },
        ])
      }
      const remaining = remainingSources.get(sourceTable)
      if (!remaining) throw new Error(`Missing source membership for ${sourceTable}`)
      const previous = remaining.get(record.sourceRecordId) ?? []
      remaining.delete(record.sourceRecordId)
      const matches = previous
        .filter(prior => prior.versionHash === record.versionHash)
        .sort(
          (a, b) =>
            a.validFromRelease.localeCompare(b.validFromRelease) ||
            a.shard.bindingName.localeCompare(b.shard.bindingName),
        )
      let existing = matches[0]
      for (const prior of previous) {
        if (prior === existing) continue
        if (prior.versionHash === record.versionHash) {
          // The 2D candidate stage can insert this year's copy before the complete
          // publisher ledger is reconciled. Discard only that candidate duplicate.
          if (prior.releaseId !== args.releaseId)
            throw new Error(
              `Duplicate retained ALS source version ${record.sourceRecordId} across shards.`,
            )
          await prior.shard.execute([
            {
              sql: `DELETE FROM ${sourceTable} WHERE sourceRecordId = ? AND versionHash = ? AND releaseId = ?`,
              params: [record.sourceRecordId, prior.versionHash, args.releaseId],
            },
          ])
        } else
          await prior.shard.execute([
            {
              sql: `UPDATE ${sourceTable} SET isCurrent = 0, validToRelease = ?, updatedAt = ? WHERE sourceRecordId = ? AND versionHash = ? AND isCurrent = 1`,
              params: [
                args.sourceVersion,
                now,
                record.sourceRecordId,
                prior.versionHash,
              ],
            },
          ])
      }
      if (!existing) {
        // A reappearing payload can already live in an older source shard.
        for (const shard of sourceShards) {
          const rows = await shard.execute([
            {
              sql: `SELECT versionHash, releaseId, validFromRelease FROM ${sourceTable} WHERE sourceRecordId = ? AND versionHash = ?`,
              params: [record.sourceRecordId, record.versionHash],
            },
          ])
          if (!rows.length) continue
          if (existing)
            throw new Error(
              `Duplicate retained ALS source version ${record.sourceRecordId} across shards.`,
            )
          existing = {
            versionHash: record.versionHash,
            shard,
            releaseId: String(rows[0]?.releaseId),
            validFromRelease: String(rows[0]?.validFromRelease),
          }
        }
        if (existing)
          await existing.shard.execute([
            {
              sql: `UPDATE ${sourceTable} SET isCurrent = 1, validToRelease = NULL, updatedAt = ? WHERE sourceRecordId = ? AND versionHash = ? AND (isCurrent <> 1 OR validToRelease IS NOT NULL)`,
              params: [now, record.sourceRecordId, record.versionHash],
            },
          ])
      }
      if (!existing)
        await args.execute('source', [
          insert(
            sourceTable,
            {
              sourceRecordId: record.sourceRecordId,
              versionHash: record.versionHash,
              releaseId: args.releaseId,
              validFromRelease: args.sourceVersion,
              validToRelease: null,
              isCurrent: 1,
              properties: record.properties,
              sourceGeometry: record.sourceGeometry,
              sourceLocator: sourceLocatorFromReferences(publisherSources),
              createdAt: now,
              updatedAt: now,
            },
            `ON CONFLICT(sourceRecordId,versionHash) DO UPDATE SET isCurrent=1,validToRelease=NULL,updatedAt=excluded.updatedAt WHERE ${sourceTable}.isCurrent <> 1 OR ${sourceTable}.validToRelease IS NOT NULL`,
          ),
        ])
    } else if (record.kind === 'collection') {
      for (const sourceRecordId of record.sourceRecordIds) {
        const sourceVersionHash = sourceVersions.get(sourceRecordId)
        if (!sourceVersionHash)
          throw new Error(`Missing ALS source version for collection ${record.id}`)
        await args.execute('history', [
          {
            sql: "UPDATE sourceResolutions SET resolutions = json_set(resolutions, '$.entities', json(?)) WHERE snapshotId = ? AND sourceReleaseId = ? AND sourceRecordId = ? AND sourceVersionHash = ?",
            params: [
              JSON.stringify(
                resolvedEntities({
                  address3d: record.id,
                  address2d: record.address2dId,
                }),
              ),
              args.snapshotId,
              args.releaseId,
              sourceRecordId,
              sourceVersionHash,
            ],
          },
        ])
      }
      const { currentStatements, historyStatements } = collectionStatements(
        record,
        args.snapshotId,
        args.releaseId,
        now,
        args.currentSnapshotId ?? args.snapshotId,
      )
      // Reuse exact versions across shard years, including their unchanged journal
      // membership. The local planner composes the final current collection once.
      const pendingHistory: Statement[] = []
      for (let index = 0; index < historyStatements.length; index += 2) {
        const statement = historyStatements[index]
        const journal = historyStatements[index + 1]
        if (!journal) throw new Error('Address3D history pair is incomplete.')
        const [, , recordType, recordId, locale, versionHash] = journal.params
        const key = membershipKey({
          recordType: String(recordType),
          recordId: String(recordId),
          locale: String(locale),
        })
        seenMembership.add(key)
        const prior = priorByKey.get(key)
        if (prior?.versionHash === versionHash) continue
        if (prior) await closeHistory(prior)
        if (!statement) throw new Error('Address3D history row is missing.')
        pendingHistory.push(statement, journal)
      }
      if (pendingHistory.length) await args.execute('history', pendingHistory)
      await args.execute('current', currentStatements)
    }
  }
  for (const [table, remaining] of remainingSources) {
    for (const shard of sourceShards) {
      const ids = [...remaining.entries()]
        .filter(([, versions]) => versions.some(version => version.shard === shard))
        .map(([id]) => id)
      for (let offset = 0; offset < ids.length; offset += 96) {
        const batch = ids.slice(offset, offset + 96)
        await shard.execute([
          {
            sql: `UPDATE ${table} SET isCurrent = 0, validToRelease = ?, updatedAt = ? WHERE isCurrent = 1 AND sourceRecordId IN (${batch.map(() => '?').join(',')})`,
            params: [args.sourceVersion, now, ...batch],
          },
        ])
      }
    }
  }
  for (const prior of args.priorMembership) {
    if (seenMembership.has(membershipKey(prior))) continue
    await closeHistory(prior)
    await args.execute('history', [
      journalStatement(
        args.snapshotId,
        args.releaseId,
        prior.recordType,
        prior.recordId,
        prior.locale,
        null,
        now,
      ),
    ])
  }
  return validated
}

async function* ownerReferences(path: string) {
  for await (const record of records(path)) {
    if (record.kind === 'collection')
      yield {
        address2dId: record.address2dId,
        unresolvedSectionIds: record.unresolvedSectionIds,
      }
  }
}
