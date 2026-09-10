import { resolve } from 'node:path'
import { confirm, isCancel, note, outro } from '@clack/prompts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { describeTarget, formatField } from '../cli/display.ts'
import {
  resolveLocalAddressDbContext,
  type LocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
import {
  executeResetSqlArtefacts,
  validateResetArguments,
  type ResetSqlArtefact,
} from '../pipeline/resetLifecycle.ts'
import { createCloudflareD1QueryClient } from '../dbCache/remoteD1Client.ts'

type ReadBinding = {
  prepare(sql: string): { all(): Promise<{ results: Record<string, unknown>[] }> }
}
type ResetReadContext = {
  metaBinding?: ReadBinding
  currentBinding?: ReadBinding
  historyTargets: Array<{ bindingName: string; binding?: ReadBinding }>
}

function resetReadContext(
  context: LocalAddressDbContext,
  target: UploadTarget,
): ResetReadContext {
  if (!target.remote) return context
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_D1_TOKEN
  if (!accountId || !apiToken)
    throw new Error(
      'Remote division reset requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_TOKEN for live dependency checks.',
    )
  const binding = (databaseId: string | null | undefined): ReadBinding => {
    if (!databaseId) throw new Error('Remote division reset is missing a database ID.')
    const client = createCloudflareD1QueryClient({ accountId, apiToken, databaseId })
    return {
      prepare: sql => ({ all: async () => ({ results: await client.query(sql) }) }),
    }
  }
  return {
    metaBinding: binding(context.state.bindings.DB_META?.databaseId),
    currentBinding: binding(context.state.bindings.DB_CURRENT?.databaseId),
    historyTargets: context.historyTargets.map(t => ({
      bindingName: t.bindingName,
      binding: binding(t.databaseId),
    })),
  }
}

const TYPES = "('division', 'divisionArea', 'divisionBoundary')"
const RELEASES = `SELECT id FROM releases WHERE resourceType IN ${TYPES}`
const SNAPSHOTS = `SELECT id FROM snapshots WHERE resourceType IN ${TYPES}`
const VERSIONS = "SELECT id FROM apiVersions WHERE familyType = 'divisions'"
const SETS = `SELECT id FROM apiReleaseSets WHERE apiVersionId IN (${VERSIONS})`
const CANONICAL_TABLES = [
  'divisionsI18n',
  'divisionBoundaries',
  'divisionAreas',
  'divisions',
]
const SOURCE_TABLES = [
  'overtureDivisions',
  'overtureDivisionAreas',
  'overtureDivisionBoundaries',
  'hkgovHadDivisionAreas',
  'hkgovCenstatdDivisionAreaDerivatives',
  'hkgovCenstatdDivisionAreas',
  'hkgovPlandPlanningCells',
  'hkgovPlandNewTowns',
  'hkgovLandsdPlaceNames',
]

async function rows(binding: ReadBinding | undefined, sql: string) {
  if (!binding) throw new Error('Division reset requires a complete database context.')
  return (await binding.prepare(sql).all()).results
}

export async function collectDivisionResetPlan(context: ResetReadContext) {
  const releases = await rows(
    context.metaBinding,
    `SELECT id, code, sourceReleaseId, status, updatedAt FROM releases WHERE resourceType IN ${TYPES} ORDER BY id`,
  )
  const snapshots = await rows(
    context.metaBinding,
    `SELECT * FROM snapshots WHERE resourceType IN ${TYPES} ORDER BY id`,
  )
  const releaseSets = await rows(
    context.metaBinding,
    `SELECT * FROM apiReleaseSets WHERE id IN (${SETS}) ORDER BY id`,
  )
  return { releases, snapshots, releaseSets }
}

export type DivisionResetPlan = Awaited<ReturnType<typeof collectDivisionResetPlan>>

/** Check semantic references as well as foreign keys, including retained history. */
export async function divisionResetBlockers(context: ResetReadContext) {
  const blockers: string[] = []
  const check = async (
    binding: ReadBinding | undefined,
    label: string,
    sql: string,
  ) => {
    if ((await rows(binding, sql)).length) blockers.push(label)
  }
  await check(
    context.metaBinding,
    'Other snapshot families use division releases',
    `SELECT 1 FROM snapshotSources WHERE snapshotId NOT IN (${SNAPSHOTS}) AND (resourceReleaseId IN (${RELEASES}) OR anchorReleaseId IN (${RELEASES})) LIMIT 1`,
  )
  await check(
    context.metaBinding,
    'Other API families use division snapshots',
    `SELECT 1 FROM apiReleaseSetSnapshots WHERE apiReleaseSetId NOT IN (${SETS}) AND (snapshotId IN (${SNAPSHOTS}) OR anchorSnapshotId IN (${SNAPSHOTS})) LIMIT 1`,
  )
  await check(
    context.metaBinding,
    'Division API release sets contain other resource families',
    `SELECT 1 FROM apiReleaseSetSnapshots WHERE apiReleaseSetId IN (${SETS}) AND snapshotId NOT IN (${SNAPSHOTS}) LIMIT 1`,
  )
  await check(
    context.metaBinding,
    'Other snapshots retain division parents or assembly anchors',
    `SELECT 1 FROM snapshots WHERE resourceType NOT IN ${TYPES} AND parentSnapshotId IN (${SNAPSHOTS}) UNION ALL SELECT 1 FROM snapshotAssemblyRuns WHERE snapshotId NOT IN (${SNAPSHOTS}) AND anchorReleaseId IN (${RELEASES}) LIMIT 1`,
  )
  // These references do not all have database foreign keys. A family reset
  // cannot leave their canonical identities or geometry companions dangling.
  for (const [label, binding] of [
    ['current', context.currentBinding],
    ...context.historyTargets.map(t => [t.bindingName, t.binding] as const),
  ] as const) {
    await check(
      binding,
      `${label}: addresses reference divisions`,
      'SELECT 1 FROM address2d WHERE countryId IS NOT NULL OR areaId IS NOT NULL OR districtId IS NOT NULL OR townId IS NOT NULL OR macrohoodId IS NOT NULL OR villageId IS NOT NULL OR neighbourhoodId IS NOT NULL OR hamletId IS NOT NULL OR microhoodId IS NOT NULL LIMIT 1',
    )
    await check(
      binding,
      `${label}: division statistics reference divisions`,
      'SELECT 1 FROM divisionStatistics LIMIT 1',
    )
    await check(
      binding,
      `${label}: statistics reference divisions or geometry companions`,
      "SELECT 1 FROM statsRecords WHERE divisionId IS NOT NULL OR json_extract(geography, '$.areaCompanion') IS NOT NULL LIMIT 1",
    )
  }
  await check(
    context.currentBinding,
    'Places retain division links',
    'SELECT 1 FROM placesDivision LIMIT 1',
  )
  await check(
    context.currentBinding,
    'Current addresses retain division snapshot references',
    'SELECT 1 FROM address2d LIMIT 1',
  )
  return blockers
}

function literal(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

/** Bound each generated statement; the number of retained releases is unbounded. */
function deleteIds(table: string, column: string, ids: string[]) {
  const statements: string[] = []
  for (let offset = 0; offset < ids.length; offset += 50) {
    statements.push(
      `DELETE FROM ${table} WHERE ${column} IN (${ids
        .slice(offset, offset + 50)
        .map(literal)
        .join(', ')});`,
    )
  }
  return statements
}

export function buildDivisionResetSql(plan: DivisionResetPlan) {
  const releaseIds = plan.releases.map(row => String(row.id))
  const snapshotIds = plan.snapshots.map(row => String(row.id))
  const sourceReleaseIds = [
    ...new Set(plan.releases.map(row => String(row.sourceReleaseId))),
  ]
  const currentSql = CANONICAL_TABLES.map(table => `DELETE FROM ${table};`).join('\n')
  const historySql = [
    currentSql,
    ...deleteIds('snapshotVersionChanges', 'snapshotId', snapshotIds),
    ...deleteIds('snapshotVersionChanges', 'sourceReleaseId', releaseIds),
    ...deleteIds('sourceResolutions', 'snapshotId', snapshotIds),
    ...deleteIds('sourceResolutions', 'sourceReleaseId', releaseIds),
  ].join('\n')
  const sourceSql = SOURCE_TABLES.flatMap(table =>
    deleteIds(table, 'releaseId', releaseIds),
  ).join('\n')
  const metaSql = [
    `DELETE FROM apiFieldProvenance WHERE apiReleaseSetId IN (${SETS});`,
    `DELETE FROM apiCatalogRevisionReleaseSets WHERE apiCatalogRevisionId IN (SELECT id FROM apiCatalogRevisions WHERE apiVersionId IN (${VERSIONS}));`,
    `DELETE FROM apiCatalogRevisions WHERE apiVersionId IN (${VERSIONS});`,
    `DELETE FROM apiReleaseSetSnapshots WHERE apiReleaseSetId IN (${SETS});`,
    `DELETE FROM publishedDataJournal WHERE releaseId IN (${RELEASES});`,
    `DELETE FROM stats WHERE releaseId IN (${RELEASES}) OR snapshotId IN (${SNAPSHOTS}) OR apiReleaseSetId IN (${SETS});`,
    ...[
      'releaseProcessingActionChunks',
      'releaseProcessingActions',
      'ingestRuns',
      'releaseShardAssignments',
      'releaseProvenance',
    ].map(table => `DELETE FROM ${table} WHERE releaseId IN (${RELEASES});`),
    `DELETE FROM snapshotAssemblyRuns WHERE snapshotId IN (${SNAPSHOTS});`,
    `DELETE FROM snapshotSources WHERE snapshotId IN (${SNAPSHOTS});`,
    `DELETE FROM apiReleaseSets WHERE id IN (${SETS});`,
    // Keep source evidence assets and fixture identities available for replay.
    // assets.releaseId and journal references use ON DELETE SET NULL.
    `DELETE FROM snapshots WHERE id IN (${SNAPSHOTS});`,
    `DELETE FROM releases WHERE id IN (${RELEASES});`,
    ...sourceReleaseIds.map(
      id =>
        `DELETE FROM sourceReleases WHERE id = ${literal(id)} AND NOT EXISTS (SELECT 1 FROM releases WHERE releases.sourceReleaseId = sourceReleases.id);`,
    ),
  ].join('\n')
  return { currentSql, historySql, sourceSql, metaSql }
}

function artefacts(
  context: LocalAddressDbContext,
  plan: DivisionResetPlan,
): ResetSqlArtefact[] {
  const sql = buildDivisionResetSql(plan)
  return [
    ...context.sourceTargets.map(t => ({
      sql: sql.sourceSql,
      target: { binding: t.binding, databaseId: t.databaseId, name: 'source' as const },
    })),
    ...context.historyTargets.map(t => ({
      sql: sql.historySql,
      target: {
        binding: t.binding,
        databaseId: t.databaseId,
        name: 'history' as const,
      },
    })),
    {
      sql: sql.currentSql,
      target: {
        binding: context.currentBinding,
        databaseId: context.state.bindings.DB_CURRENT?.databaseId ?? null,
        name: 'current' as const,
      },
    },
    {
      sql: sql.metaSql,
      target: {
        binding: context.metaBinding,
        databaseId: context.state.bindings.DB_META?.databaseId ?? null,
        name: 'meta' as const,
      },
    },
  ].filter(artefact => artefact.sql.trim())
}

export async function runResetDivisionsCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: { printUsage: () => void },
) {
  validateResetArguments(args, options.printUsage, 'reset:divisions', [
    'dry-run',
    'yes',
    'keep-cache',
    'discard-abandoned-sql-delivery',
  ])
  const dryRun = args.options['dry-run'] === true
  const keepCache = args.options['keep-cache'] === true
  const discardAbandonedSqlDelivery =
    args.options['discard-abandoned-sql-delivery'] === true
  if (discardAbandonedSqlDelivery && target.remote) {
    throw new Error('--discard-abandoned-sql-delivery only supports the local target.')
  }
  const context = await resolveLocalAddressDbContext(target, 'hk', '2025', {
    includeAllHistoryShardYears: true,
    includeAllSourceShardYears: true,
    requireExistingRemoteCache: target.remote,
  })
  try {
    const readContext = resetReadContext(context, target)
    const plan = await collectDivisionResetPlan(readContext)
    const assertPlanMatches = async () => {
      if (
        JSON.stringify(await collectDivisionResetPlan(context)) !== JSON.stringify(plan)
      ) {
        throw new Error(
          'Division reset requires a matching local database cache. Run cache:rebuild for this target and retry.',
        )
      }
    }
    await assertPlanMatches()
    const blockers = await divisionResetBlockers(readContext)
    note(
      [
        formatField('target', describeTarget(target).label),
        formatField(
          'scope',
          'All division identities, areas and boundaries; every domain',
        ),
        formatField('releases', String(plan.releases.length)),
        formatField('snapshots', String(plan.snapshots.length)),
        formatField('API release sets', String(plan.releaseSets.length)),
        formatField('dryRun', String(dryRun)),
        formatField('keepCache', String(keepCache)),
        ...blockers.map(blocker => formatField('blocked', blocker)),
      ].join('\n'),
      'DIVISIONS RESET PLAN',
    )
    if (blockers.length)
      throw new Error(
        `Division reset blocked: ${blockers.join('; ')}. Reset or remove those dependencies first.`,
      )
    if (dryRun) return
    if (args.options.yes !== true) {
      const accepted = await confirm({
        message: `Remove all division datasets from ${describeTarget(target).label}?`,
        initialValue: false,
      })
      if (isCancel(accepted) || !accepted) throw new Error('Division reset cancelled.')
    }
    await executeResetSqlArtefacts({
      artefacts: artefacts(context, plan),
      cacheReleaseCodes: plan.releases.map(row => String(row.code)),
      cacheReleaseIds: plan.releases.map(row => String(row.id)),
      cacheRoot: resolve(import.meta.dir, '../../../../../.local/harbour-sql/releases'),
      context,
      keepCache,
      discardAbandonedSqlDelivery,
      target,
      remoteCacheErrorMessage:
        'Remote division reset succeeded but its local cache could not be updated',
      validateUnderLock: async () => {
        if (
          JSON.stringify(await collectDivisionResetPlan(readContext)) !==
          JSON.stringify(plan)
        ) {
          throw new Error(
            'Division reset plan changed during confirmation. Run reset:divisions again.',
          )
        }
        await assertPlanMatches()
        const blockers = await divisionResetBlockers(readContext)
        if (blockers.length)
          throw new Error(`Division reset blocked: ${blockers.join('; ')}`)
      },
    })
    outro('All division datasets reset')
  } finally {
    context.cleanup()
  }
}
