import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { captureResolvedSqlPlan } from '../local/resolvedSqlPlan.ts'
import { familyMutationTargets } from '../local/familyMutationPolicy.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../local/nativeSqlDelivery.ts'
import { sqlDeliveryPhaseDirectory } from '../local/sqlDeliveryPhase.ts'
import { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows.ts'
import { readDeliveryPlan } from '../local/sqlDeliveryFiles.ts'
import { readPendingSqlDelivery } from '../local/sqlDeliveryPending.ts'

type Churn = Awaited<ReturnType<typeof writeGeometryRows>>['churn']

export function nativeGeometryDeliveryPhase(
  type: Parameters<typeof writeGeometryRows>[1],
  transform?: 'simplified',
  cohortKey?: string,
  sourceVersion?: string,
  contentHash?: string,
) {
  const base = `native-geometry-${type.toLowerCase()}-${transform ?? 'exact'}`
  const snapshotYear = cohortKey?.slice(0, 4)
  const sourceYear = sourceVersion?.slice(0, 4)
  const cohortPhase =
    snapshotYear && sourceYear && snapshotYear !== sourceYear
      ? `${base}-${snapshotYear}`
      : base
  return contentHash ? `${cohortPhase}-${contentHash.slice(0, 16)}` : cohortPhase
}

export async function readNativeGeometryVersion(
  context: Parameters<typeof writeGeometryRows>[0],
  resourceReleaseId: string,
  type: Parameters<typeof writeGeometryRows>[1],
  transform?: 'simplified',
  cohortKey?: string,
  sourceVersion?: string,
) {
  const pending = await readPendingSqlDelivery(context.state.dbCacheDir)
  if (pending?.resourceReleaseId !== resourceReleaseId) return null
  const base = nativeGeometryDeliveryPhase(type, transform, cohortKey, sourceVersion)
  const plan = await (async () => {
    for (const directory of pending.directories) {
      const candidate = await readDeliveryPlan(directory)
      if (
        candidate?.context.resourceReleaseId === resourceReleaseId &&
        (candidate.context.phase === base ||
          candidate.context.phase.startsWith(`${base}-`))
      )
        return candidate
    }
    return null
  })()
  if (!plan) return null
  const version = plan.context.inputs.version as
    | Parameters<typeof writeGeometryRows>[3]
    | undefined
  if (
    plan.context.environment !== 'local' ||
    plan.context.resourceReleaseId !== resourceReleaseId ||
    !version ||
    version.resourceReleaseId !== resourceReleaseId ||
    typeof version.sourceVersion !== 'string' ||
    !version.sourceVersion ||
    typeof version.snapshotId !== 'string'
  )
    throw new Error('Invalid retained native geometry version.')
  return version
}

export async function writeGeometryRowsDurably(
  ...[context, type, rows, version, onProgress]: Parameters<typeof writeGeometryRows>
) {
  const history =
    context.historyBinding?.bindingName ??
    context.historyTargets.find(target => target.db === context.historyDb)?.bindingName
  const source =
    context.sourceBinding?.bindingName ??
    context.sourceTargets.find(target => target.db === context.sourceDb)?.bindingName
  if (!history || !source)
    throw new Error('Native geometry delivery requires named local database files.')
  const files =
    context.state.files ??
    Object.fromEntries(
      ['DB_CURRENT', history, source].map(binding => [
        binding,
        join(context.state.dbCacheDir, `${binding}.sqlite`),
      ]),
    )
  const policies = familyMutationTargets(
    { ...context, state: { ...context.state, files } },
    'geometry',
  )
  const targets = Object.fromEntries(
    [
      ['DB_CURRENT', currentSchema],
      [history, historySchema],
      [source, sourceSchema],
      ...(context.sourceTargets ?? [])
        .filter(target => target.bindingName !== source)
        .map(target => [target.bindingName, sourceSchema]),
    ].map(([binding, schema]) => {
      const name = binding as string
      const path = files[name]
      if (!path) throw new Error(`Missing native geometry database ${name}.`)
      return [
        name,
        {
          ...policies[name]!,
          path,
          databaseId: name,
          schema: schema as Record<string, unknown>,
        },
      ]
    }),
  )
  const hash = createHash('sha256')
  for (const row of rows) hash.update(JSON.stringify(row)).update('\n')
  const { publisherRows, ...retainedVersion } = version
  hash.update('publisher-assertions\n')
  for (const row of publisherRows ?? rows)
    hash.update(JSON.stringify(row.source)).update('\n')
  const normalisedSha256 = hash.digest('hex')
  // A new snapshot revision needs a new plan even when its geometry is unchanged.
  const deliveryHash = createHash('sha256')
    .update('cross-shard-open-periods-v1\n')
    .update('acknowledged-prepared-draft-merge-v1\n')
    .update(normalisedSha256)
    .update(JSON.stringify(retainedVersion))
    .digest('hex')
  const phase = nativeGeometryDeliveryPhase(
    type,
    version.transform,
    version.cohortKey,
    version.sourceVersion,
    deliveryHash,
  )
  const input = {
    context,
    resourceReleaseId: version.resourceReleaseId,
    phase,
    inputs: {
      ...(version.source === 'saanseoi'
        ? { sourceLedgerPolicy: 'curated-source-v1' }
        : {}),
      version: retainedVersion,
      normalisedSha256,
      historyMembershipPolicy: 'immutable-geometry-v1',
      sourcePeriodPolicy: 'cross-shard-open-periods-v1',
      draftMergePolicy: 'acknowledged-prepared-draft-merge-v1',
    },
  }
  const directory = sqlDeliveryPhaseDirectory(input)
  // A retained plan already contains the exact mutations and churn. Keep a retry
  // silent here: callers use this callback to detect generation, not replay.
  const retainedPlan = await readDeliveryPlan(directory)
  if (!retainedPlan) onProgress?.('plan durable local mutations')
  const plan = await prepareNativeSqlDelivery({
    ...input,
    directory,
    ownershipDirectory: context.state.dbCacheDir,
    files: Object.fromEntries(
      Object.entries(targets).map(([name, target]) => [name, target.path]),
    ),
    generate: async append => {
      const resolved = await captureResolvedSqlPlan<{
        churn: Record<string, unknown>
        currentChanges: Awaited<ReturnType<typeof writeGeometryRows>>['currentChanges']
      }>({
        publicationTables: [
          type === 'divisionArea'
            ? 'divisionAreaPublicationState'
            : 'divisionBoundaryPublicationState',
        ],
        targets,
        append,
        allowPreparedDraftMerge: (result, snapshotId) =>
          result.currentChanges.publication?.snapshotId === snapshotId &&
          result.currentChanges.publication.allowPreparedDraftMerge === true,
        generate: async databases => {
          const result = await writeGeometryRows(
            {
              ...context,
              currentDb: databases.DB_CURRENT!
                .drizzle as unknown as typeof context.currentDb,
              historyDb: databases[history]!
                .drizzle as unknown as typeof context.historyDb,
              sourceDb: databases[source]!
                .drizzle as unknown as typeof context.sourceDb,
              sourceTargets: (context.sourceTargets ?? []).map(target => ({
                ...target,
                db: databases[target.bindingName]!.drizzle,
              })),
            },
            type,
            rows,
            version,
            onProgress,
          )
          return {
            churn: encodeChurn(result.churn),
            currentChanges: result.currentChanges,
          }
        },
      })
      return { ...resolved.result, mutationSummary: resolved.mutationSummary }
    },
  })
  // Validate continuation output before making any target mutation.
  const churn = decodeChurn(plan.outputs?.churn)
  const currentChanges = plan.outputs?.currentChanges as Awaited<
    ReturnType<typeof writeGeometryRows>
  >['currentChanges']
  if (
    !currentChanges ||
    !Array.isArray(currentChanges.changedCurrentIds) ||
    !Array.isArray(currentChanges.removedCurrentIds)
  )
    throw new Error('Missing retained geometry current changes.')
  if (!retainedPlan)
    onProgress?.('replay durable local mutations', 0, plan.batches.length)
  await runNativeSqlDelivery(directory, {
    files,
    onProgress: retainedPlan
      ? undefined
      : (completed, total) =>
          onProgress?.('replay durable local mutations', completed, total),
  })
  return { churn, currentChanges }
}

function encodeChurn(churn: Churn): Record<string, unknown> {
  return {
    ...churn,
    byType: [...churn.byType].map(([name, value]) => [name, encodeChurn(value)]),
  }
}

function decodeChurn(value: unknown): Churn {
  if (!value || typeof value !== 'object')
    throw new Error('Missing native geometry churn output.')
  const row = value as Record<string, unknown>
  for (const key of ['added', 'changed', 'count', 'removed', 'unchanged'])
    if (!Number.isSafeInteger(row[key]) || (row[key] as number) < 0)
      throw new Error('Invalid native geometry churn count.')
  if (!Array.isArray(row.byType))
    throw new Error('Invalid native geometry churn types.')
  const byType = new Map<string, Churn>()
  for (const entry of row.byType) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      byType.has(entry[0])
    )
      throw new Error('Invalid native geometry churn type.')
    byType.set(entry[0], decodeChurn(entry[1]))
  }
  return {
    added: row.added as number,
    changed: row.changed as number,
    count: row.count as number,
    removed: row.removed as number,
    unchanged: row.unchanged as number,
    byType,
  }
}
