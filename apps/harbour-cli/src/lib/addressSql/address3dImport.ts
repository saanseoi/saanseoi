import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { DatasetProcessingMessage } from '@repo/core'
import type { MetaDatabase } from '@repo/db'
import {
  resolveImportTarget,
  type AddressSqlImportStageOptions,
} from '@repo/core/pipeline/services/addressPipeline/sqlImportStages'
import type { PreparedAls3dRecord } from '../sources/hkgov/hkgovAls3dPreparation'
import { als3dHash, assertAddress3dRowBudget } from '../sources/hkgov/hkgovAls3d'
import { validateAddress3dOwners } from './address3dOwners'

type Statement = { sql: string; params: unknown[] }
type Target = 'current' | 'history' | 'source'
type Collection = Extract<PreparedAls3dRecord, { kind: 'collection' }>

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
  let manifest: Extract<PreparedAls3dRecord, { kind: 'manifest' }> | undefined
  let units = 0
  for await (const row of records(path)) {
    if (manifest) throw new Error('Address3D manifest must be the final record')
    if (row.kind === 'manifest') {
      manifest = row
      continue
    }
    if (row.kind === 'source') {
      if (sourceIds.has(row.sourceRecordId))
        throw new Error(`Duplicate source occurrence ${row.sourceRecordId}`)
      sourceIds.add(row.sourceRecordId)
      assertAddress3dRowBudget(row)
    } else if (row.kind === 'collection') {
      if (
        Object.keys(row.locales).sort().join(',') !== 'en,zh-hant' ||
        row.sourceRecordIds.length === 0
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
    manifest.unitCount !== units
  )
    throw new Error(
      'Incomplete or stale Address3D preparation; prepare the ALS release again',
    )
  return { ...manifest, ids, digest: await fileSha256(path) }
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
) {
  const { kind: _kind, locales, sourceRecordIds, ...base } = collection
  const sources = sourceRecordIds.map(sourceRecordId => ({
    dataset: 'hkgov-dpo-als-3d',
    sourceRecordId,
  }))
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
  const current = { ...base, sources, snapshotId, createdAt: now, updatedAt: now }
  const currentStatements = [
    insert('address3d', current, 'ON CONFLICT(snapshotId,id) DO NOTHING'),
  ]
  const historyStatements = [
    insert('address3d', history, 'ON CONFLICT(id,versionHash) DO NOTHING'),
    journalStatement(snapshotId, releaseId, 'address3d', base.id, '', versionHash, now),
  ]
  for (const [locale, units] of Object.entries(locales)) {
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
        { ...fields, snapshotId },
        'ON CONFLICT(snapshotId,address3dId,locale) DO NOTHING',
      ),
    )
    historyStatements.push(
      insert(
        'address3dI18n',
        {
          ...fields,
          snapshotId,
          versionHash,
          sourceReleaseId: releaseId,
          isCurrent: 1,
        },
        'ON CONFLICT(address3dId,versionHash,locale) DO NOTHING',
      ),
      journalStatement(
        snapshotId,
        releaseId,
        'address3dI18n',
        base.id,
        locale,
        versionHash,
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
  releaseId: string
  expectedDigest: string
  timestamp?: string
  priorMembership: Array<{ recordType: string; recordId: string; locale: string }>
  execute: Awaited<ReturnType<typeof createAddress3dExecutor>>
}) {
  const validated = await validateAddress3dPreparation(args.path, args.sourceVersion)
  if (validated.digest !== args.expectedDigest)
    throw new Error('Address3D preparation changed after validation')
  const now = args.timestamp ?? new Date().toISOString()
  await validateAddress3dOwners(
    args.snapshotId,
    ownerReferences(args.path),
    args.execute,
  )
  // The snapshot is still draft; retries replace its complete collection set.
  await args.execute('current', [
    {
      sql: 'DELETE FROM address3dI18n WHERE snapshotId = ?',
      params: [args.snapshotId],
    },
    { sql: 'DELETE FROM address3d WHERE snapshotId = ?', params: [args.snapshotId] },
  ])
  for await (const record of records(args.path)) {
    if (record.kind === 'source') {
      await args.execute('source', [
        insert(
          'hkgovAlsAddresses3d',
          {
            sourceRecordId: record.sourceRecordId,
            versionHash: record.versionHash,
            releaseId: args.releaseId,
            rawProperties: record.rawProperties,
            sources: record.sources,
            createdAt: now,
            updatedAt: now,
          },
          'ON CONFLICT(releaseId,sourceRecordId) DO NOTHING',
        ),
      ])
    } else if (record.kind === 'collection') {
      const { currentStatements, historyStatements } = collectionStatements(
        record,
        args.snapshotId,
        args.releaseId,
        now,
      )
      await args.execute('history', historyStatements)
      await args.execute('current', currentStatements)
    }
  }
  for (const prior of args.priorMembership) {
    if (validated.ids.has(prior.recordId)) continue
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
