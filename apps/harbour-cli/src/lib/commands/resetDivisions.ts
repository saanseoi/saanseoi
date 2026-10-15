import { dirname, resolve } from 'node:path'
import { confirm, isCancel, note, outro } from '@clack/prompts'
import { describeTarget, formatField } from '../cli/display.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import {
  type LocalAddressDbContext,
  resolveLocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
import {
  mapLocalTargetPaths,
  resolveD1Targets,
} from '../dbCache/localDbCacheTargets.ts'
import { createCloudflareD1QueryClient } from '../dbCache/remoteD1Client.ts'
import { readPendingSqlDelivery } from '../pipeline/local/sqlDeliveryPending.ts'
import {
  executeResetSqlArtefacts,
  type ResetSqlArtefact,
  validateResetArguments,
} from '../pipeline/resetLifecycle.ts'

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
const RELEASES = `SELECT id FROM resourceReleases WHERE resourceType IN ${TYPES}`
const SNAPSHOTS = `SELECT id FROM snapshots WHERE snapshotLineageId IN (SELECT id FROM snapshotLineages WHERE resourceType IN ${TYPES})`
const VERSIONS = "SELECT id FROM apiVersions WHERE familyType = 'divisions'"
const SETS = `SELECT apiReleaseSetId FROM apiVersionReleaseSets WHERE apiVersionId IN (${VERSIONS})`
const CANONICAL_TABLES = [
  'divisionsI18n',
  'divisionBoundaries',
  'divisionAreas',
  'divisions',
]
const SOURCE_TABLES = [
  'ssDivision',
  'ssDivisionArea',
  'protomapsIslandFeatures',
  'hkgovRvdAreas',
  'overtureDivisions',
  'overtureDivisionAreas',
  'overtureDivisionBoundaries',
  'hkgovHadDivisionAreas',
  'hkgovCenstatdStatistics',
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
    `SELECT id, code, sourceReleaseId, status, updatedAt FROM resourceReleases WHERE resourceType IN ${TYPES} ORDER BY id`,
  )
  const snapshots = await rows(
    context.metaBinding,
    `SELECT s.*, sl.resourceType FROM snapshots s JOIN snapshotLineages sl ON sl.id=s.snapshotLineageId WHERE sl.resourceType IN ${TYPES} ORDER BY s.id`,
  )
  const releaseSets = await rows(
    context.metaBinding,
    `SELECT content.*, association.id AS apiVersionReleaseSetId, association.apiVersionId, association.status, association.publishedAt, association.validFrom, association.validTo, association.notes, association.guide
     FROM apiReleaseSets content
     INNER JOIN apiVersionReleaseSets association ON association.apiReleaseSetId = content.id
     WHERE content.id IN (${SETS}) ORDER BY content.id, association.apiVersionId`,
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
    `SELECT 1 FROM snapshotResourceReleases WHERE snapshotId NOT IN (${SNAPSHOTS}) AND (resourceReleaseId IN (${RELEASES}) OR anchorReleaseId IN (${RELEASES})) LIMIT 1`,
  )
  await check(
    context.metaBinding,
    'Other API families use division snapshots',
    `SELECT 1 FROM apiReleaseSetSnapshots WHERE apiReleaseSetId NOT IN (${SETS}) AND snapshotId IN (${SNAPSHOTS}) LIMIT 1`,
  )
  await check(
    context.metaBinding,
    'Division API release sets contain other resource families',
    `SELECT 1 FROM apiReleaseSetSnapshots WHERE apiReleaseSetId IN (${SETS}) AND snapshotId NOT IN (${SNAPSHOTS}) LIMIT 1`,
  )
  await check(
    context.metaBinding,
    'Other snapshots retain division parents or assembly anchors',
    `SELECT 1 FROM snapshots WHERE snapshotLineageId IN (SELECT id FROM snapshotLineages WHERE resourceType NOT IN ${TYPES}) AND parentSnapshotId IN (${SNAPSHOTS}) UNION ALL SELECT 1 FROM snapshotAssemblies WHERE snapshotId NOT IN (${SNAPSHOTS}) AND anchorReleaseId IN (${RELEASES}) LIMIT 1`,
  )
  await check(
    context.metaBinding,
    'Other snapshots retain exact division lookup dependencies',
    `SELECT 1 FROM snapshotDependencies WHERE snapshotId NOT IN (${SNAPSHOTS}) AND dependencySnapshotId IN (${SNAPSHOTS}) LIMIT 1`,
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
      'SELECT 1 FROM address2d WHERE countryId IS NOT NULL OR landformId IS NOT NULL OR areaId IS NOT NULL OR districtId IS NOT NULL OR townId IS NOT NULL OR ruralAreaId IS NOT NULL OR macrohoodId IS NOT NULL OR villageId IS NOT NULL OR neighbourhoodId IS NOT NULL OR hamletId IS NOT NULL OR microhoodId IS NOT NULL LIMIT 1',
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
    'SELECT 1 FROM places p JOIN placeDivisionDefinitions d ON d.id=p.divisionDefinitionSetId WHERE EXISTS(SELECT 1 FROM json_each(d.definition)) LIMIT 1',
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
  const sourceReleaseIds = [
    ...new Set(plan.releases.map(row => String(row.sourceReleaseId))),
  ]
  const currentSql = [
    ...['division', 'divisionArea', 'divisionBoundary'].map(
      family => `DELETE FROM ${family}PublicationState;`,
    ),
    ...CANONICAL_TABLES.map(table => `DELETE FROM ${table};`),
  ].join('\n')
  const historySql = [...CANONICAL_TABLES.map(table => `DELETE FROM ${table};`)].join(
    '\n',
  )
  const sourceSql = [
    ...SOURCE_TABLES.flatMap(table =>
      deleteIds(table, 'resourceReleaseId', releaseIds),
    ),
    'DELETE FROM hkgovCenstatdGeometryDerivatives WHERE NOT EXISTS (SELECT 1 FROM hkgovCenstatdStatistics s WHERE s.geometryId = hkgovCenstatdGeometryDerivatives.geometryId);',
    'DELETE FROM hkgovCenstatdGeometry WHERE NOT EXISTS (SELECT 1 FROM hkgovCenstatdStatistics s WHERE s.geometryId = hkgovCenstatdGeometry.id);',
  ].join('\n')
  const metaSql = [
    `DELETE FROM processingRuns WHERE apiReleaseSetId IN (${SETS});`,
    `DELETE FROM processingRuns WHERE snapshotId IN (${SNAPSHOTS});`,
    `DELETE FROM apiFieldProvenance WHERE apiReleaseSetId IN (${SETS});`,
    `DELETE FROM apiCatalogRevisionReleaseSets WHERE apiCatalogRevisionId IN (SELECT id FROM apiCatalogRevisions WHERE apiVersionId IN (${VERSIONS}));`,
    `DELETE FROM apiCatalogRevisions WHERE apiVersionId IN (${VERSIONS});`,
    `DELETE FROM apiReleaseSetSnapshots WHERE apiReleaseSetId IN (${SETS});`,
    `DELETE FROM releaseSetLifecycleJournal WHERE resourceReleaseId IN (${RELEASES}) OR apiVersionReleaseSetId IN (SELECT id FROM apiVersionReleaseSets WHERE apiVersionId IN (${VERSIONS}));`,
    `DELETE FROM stats WHERE resourceReleaseId IN (${RELEASES}) OR apiReleaseSetId IN (${SETS});`,
    ...['processingRuns', 'releaseShardAssignments', 'processingAudits'].map(
      table => `DELETE FROM ${table} WHERE resourceReleaseId IN (${RELEASES});`,
    ),
    `DELETE FROM snapshotDependencies WHERE snapshotId IN (${SNAPSHOTS});`,
    `DELETE FROM snapshotAssemblies WHERE snapshotId IN (${SNAPSHOTS});`,
    `DELETE FROM snapshotResourceReleases WHERE snapshotId IN (${SNAPSHOTS});`,
    `DELETE FROM apiReleaseSets WHERE id IN (${SETS});`,
    `DELETE FROM assets WHERE resourceReleaseId IN (${RELEASES}) AND (role = 'resourceSourceArchive' OR role = 'manifest');`,
    // Keep source evidence assets and fixture identities available for replay.
    // assets.resourceReleaseId and journal references use ON DELETE SET NULL.
    `DELETE FROM snapshots WHERE id IN (${SNAPSHOTS});`,
    `DELETE FROM resourceReleases WHERE id IN (${RELEASES});`,
    ...sourceReleaseIds.map(
      id =>
        `DELETE FROM sourceReleases WHERE id = ${literal(id)} AND NOT EXISTS (SELECT 1 FROM resourceReleases WHERE resourceReleases.sourceReleaseId = sourceReleases.id);`,
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
  // Allow inspection of the owning cache. The reset lifecycle still checks every
  // plan under the delivery lock before it may discard ownership or execute SQL.
  let resumeSqlDeliveryReleaseId: string | undefined
  if (discardAbandonedSqlDelivery) {
    const metaPath = mapLocalTargetPaths(await resolveD1Targets('local')).DB_META
    if (!metaPath) throw new Error('Division reset requires the DB_META binding.')
    resumeSqlDeliveryReleaseId = (await readPendingSqlDelivery(dirname(metaPath)))
      ?.resourceReleaseId
  }
  const context = await resolveLocalAddressDbContext(target, 'hk', '2025', {
    resumeSqlDeliveryReleaseId,
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
