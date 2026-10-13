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
import { collectStatsResetDependencies } from './statsResetDependencies.ts'

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
      'Remote statistics reset requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_TOKEN for live dependency checks.',
    )
  const binding = (databaseId: string | null | undefined): ReadBinding => {
    if (!databaseId)
      throw new Error('Remote statistics reset is missing a database ID.')
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

const TYPES = "('divisionStatistic')"
const GEOMETRY_TYPES = "('division', 'divisionArea', 'divisionBoundary')"
const RELEASES = `SELECT id FROM resourceReleaseDetails AS resourceReleases WHERE resourceType IN ${TYPES} OR (resourceType IN ${GEOMETRY_TYPES} AND datasetId IN (SELECT id FROM datasets WHERE theme = 'stats'))`
// Lookup sources are dependencies, not contributions owned by the dataset.
const SNAPSHOTS = `SELECT id FROM snapshots WHERE snapshotLineageId IN (SELECT id FROM snapshotLineages WHERE resourceType IN ${TYPES}) OR (snapshotLineageId IN (SELECT id FROM snapshotLineages WHERE resourceType IN ${GEOMETRY_TYPES}) AND id IN (SELECT snapshotId FROM snapshotResourceReleases WHERE resourceReleaseId IN (${RELEASES}) AND role <> 'lookup'))`
const CANONICAL_TABLES = [
  'statsValuesI18n',
  'statsFieldsI18n',
  'statsMeasuresI18n',
  'statsDefinitionSets',
  'statsRecords',
  'statsFields',
  'statsMeasures',
  'divisionStatistics',
]
const SOURCE_TABLES = ['hkgovCenstatdStatistics']
const GEOMETRY_TABLES = [
  'divisionsI18n',
  'divisionBoundaries',
  'divisionAreas',
  'divisions',
]

async function rows(binding: ReadBinding | undefined, sql: string) {
  if (!binding) throw new Error('Stats reset requires a complete database context.')
  return (await binding.prepare(sql).all()).results
}

export async function collectStatsResetPlan(context: ResetReadContext) {
  const releases = await rows(
    context.metaBinding,
    `SELECT id, code, sourceReleaseId, resourceType, status, updatedAt FROM resourceReleases WHERE id IN (${RELEASES}) ORDER BY id`,
  )
  const snapshots = await rows(
    context.metaBinding,
    `SELECT s.*, sl.resourceType FROM snapshots s JOIN snapshotLineages sl ON sl.id=s.snapshotLineageId WHERE s.id IN (${SNAPSHOTS}) ORDER BY s.id`,
  )
  return {
    releases,
    ...(await collectStatsResetDependencies(context, releases, snapshots)),
  }
}

export type StatsResetPlan = Awaited<ReturnType<typeof collectStatsResetPlan>>

/** Check semantic references as well as foreign keys, including retained history. */
export async function statsResetBlockers(context: ResetReadContext) {
  const plan = await collectStatsResetPlan(context)
  const snapshotSelection =
    plan.snapshots.map(row => literal(String(row.id))).join(', ') ||
    'SELECT NULL WHERE 0'
  const setSelection =
    plan.releaseSets.map(row => literal(String(row.id))).join(', ') ||
    'SELECT NULL WHERE 0'
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
    'Other snapshot families use statistics releases',
    `SELECT 1 FROM snapshotResourceReleases WHERE snapshotId NOT IN (${snapshotSelection}) AND (resourceReleaseId IN (${RELEASES}) OR anchorReleaseId IN (${RELEASES})) LIMIT 1`,
  )
  await check(
    context.metaBinding,
    'Other API families use statistics snapshots',
    `SELECT 1 FROM apiReleaseSetSnapshots WHERE apiReleaseSetId NOT IN (${setSelection}) AND snapshotId IN (${snapshotSelection}) LIMIT 1`,
  )
  await check(
    context.metaBinding,
    'Other snapshots retain statistics parents or assembly anchors',
    `SELECT 1 FROM snapshots WHERE id NOT IN (${snapshotSelection}) AND parentSnapshotId IN (${snapshotSelection}) UNION ALL SELECT 1 FROM snapshotAssemblies WHERE snapshotId NOT IN (${snapshotSelection}) AND anchorReleaseId IN (${RELEASES}) LIMIT 1`,
  )
  await check(
    context.metaBinding,
    'Other snapshots retain exact statistics lookup dependencies',
    `SELECT 1 FROM snapshotDependencies WHERE snapshotId NOT IN (${snapshotSelection}) AND dependencySnapshotId IN (${snapshotSelection}) LIMIT 1`,
  )
  const geometryIds = plan.snapshots
    .filter(row => row.resourceType !== 'divisionStatistic')
    .map(row => String(row.id))
  const allGeometryIds = geometryIds.map(literal).join(', ')
  for (let offset = 0; offset < geometryIds.length; offset += 50) {
    const ids = geometryIds
      .slice(offset, offset + 50)
      .map(literal)
      .join(', ')
    for (const [label, binding] of [
      ['current', context.currentBinding],
      ...context.historyTargets.map(t => [t.bindingName, t.binding] as const),
    ] as const) {
      const current = label === 'current'
      const divisions = `SELECT id FROM divisions WHERE snapshotId IN (${current ? `SELECT scopeId FROM divisionPublicationState WHERE snapshotId IN (${ids})` : ids})`
      await check(
        binding,
        `${label}: addresses reference contributed divisions`,
        `SELECT 1 FROM address2d WHERE ${['countryId', 'areaId', 'districtId', 'townId', 'ruralAreaId', 'macrohoodId', 'villageId', 'neighbourhoodId', 'hamletId', 'microhoodId'].map(column => `${column} IN (${divisions})`).join(' OR ')} LIMIT 1`,
      )
      await check(
        binding,
        `${label}: other geometry references contributed divisions`,
        `SELECT 1 FROM divisionAreas WHERE snapshotId NOT IN (${current ? `SELECT scopeId FROM divisionAreaPublicationState WHERE snapshotId IN (${allGeometryIds})` : allGeometryIds}) AND divisionId IN (${divisions}) UNION ALL SELECT 1 FROM divisionBoundaries WHERE snapshotId NOT IN (${current ? `SELECT scopeId FROM divisionBoundaryPublicationState WHERE snapshotId IN (${allGeometryIds})` : allGeometryIds}) AND (leftDivisionId IN (${divisions}) OR rightDivisionId IN (${divisions})) LIMIT 1`,
      )
    }
    await check(
      context.currentBinding,
      'Places reference contributed divisions',
      `SELECT 1 FROM placesDivision WHERE divisionSnapshotId IN (${ids}) LIMIT 1`,
    )
  }
  if (plan.dependencies.publications.some(row => row.preparedAt === null))
    blockers.push('Current statistics geography has an unfinished delivery')
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

export function buildStatsResetSql(plan: StatsResetPlan) {
  const releaseIds = plan.releases.map(row => String(row.id))
  const snapshotIds = plan.snapshots.map(row => String(row.id))
  const setIds = plan.releaseSets.map(row => String(row.id))
  const catalogIds = plan.catalogRevisions.map(row => String(row.id))
  const sourceReleaseIds = [
    ...new Set(plan.releases.map(row => String(row.sourceReleaseId))),
  ]
  const canonicalSql = [
    ...CANONICAL_TABLES.map(table => `DELETE FROM ${table};`),
    ...GEOMETRY_TABLES.flatMap(table => deleteIds(table, 'snapshotId', snapshotIds)),
  ].join('\n')
  const currentSql = [
    'DELETE FROM statsPublicationState;',
    ...CANONICAL_TABLES.map(table => `DELETE FROM ${table};`),
    ...GEOMETRY_TABLES.flatMap(table => {
      const family = table.startsWith('divisions')
        ? 'division'
        : table === 'divisionAreas'
          ? 'divisionArea'
          : 'divisionBoundary'
      return plan.dependencies.publications
        .filter(row => row.family === family)
        .map(
          row =>
            `DELETE FROM ${table} WHERE snapshotId = ${literal(String(row.scopeId))} AND EXISTS (SELECT 1 FROM ${family}PublicationState WHERE scopeId = ${literal(String(row.scopeId))} AND snapshotId = ${literal(String(row.snapshotId))} AND publicationToken = ${literal(String(row.publicationToken))} AND preparedAt IS NOT NULL);`,
        )
    }),
    ...plan.dependencies.publications.map(
      row =>
        `DELETE FROM ${row.family}PublicationState WHERE scopeId = ${literal(String(row.scopeId))} AND snapshotId = ${literal(String(row.snapshotId))} AND publicationToken = ${literal(String(row.publicationToken))} AND preparedAt IS NOT NULL;`,
    ),
  ].join('\n')
  const historySql = [
    canonicalSql,
    ...GEOMETRY_TABLES.flatMap(table =>
      deleteIds(table, 'sourceReleaseId', releaseIds),
    ),
    ...deleteIds('snapshotVersionChanges', 'snapshotId', snapshotIds),
    ...deleteIds('snapshotVersionChanges', 'sourceReleaseId', releaseIds),
    ...deleteIds('sourceResolutions', 'snapshotId', snapshotIds),
    ...deleteIds('sourceResolutions', 'sourceReleaseId', releaseIds),
  ].join('\n')
  const sourceSql = [
    ...SOURCE_TABLES.flatMap(table =>
      deleteIds(table, 'resourceReleaseId', releaseIds),
    ),
    'DELETE FROM hkgovCenstatdGeometryDerivatives WHERE NOT EXISTS (SELECT 1 FROM hkgovCenstatdStatistics s WHERE s.geometryId = hkgovCenstatdGeometryDerivatives.geometryId);',
    'DELETE FROM hkgovCenstatdGeometry WHERE NOT EXISTS (SELECT 1 FROM hkgovCenstatdStatistics s WHERE s.geometryId = hkgovCenstatdGeometry.id);',
  ].join('\n')
  const metaSql = [
    ...setIds.map(
      id => `DELETE FROM processingRuns WHERE apiReleaseSetId = ${literal(id)};`,
    ),
    ...snapshotIds.map(
      id => `DELETE FROM processingRuns WHERE snapshotId = ${literal(id)};`,
    ),
    ...deleteIds('apiFieldProvenance', 'apiReleaseSetId', setIds),
    ...deleteIds('apiCatalogRevisionReleaseSets', 'apiCatalogRevisionId', catalogIds),
    ...deleteIds('apiCatalogRevisions', 'id', catalogIds),
    ...deleteIds('apiReleaseSetSnapshots', 'apiReleaseSetId', setIds),
    ...deleteIds('releaseSetLifecycleJournal', 'resourceReleaseId', releaseIds),
    ...deleteIds('stats', 'resourceReleaseId', releaseIds),
    ...deleteIds('stats', 'apiReleaseSetId', setIds),
    ...['processingRuns', 'releaseShardAssignments', 'processingAudits'].map(
      table => `DELETE FROM ${table} WHERE resourceReleaseId IN (${RELEASES});`,
    ),
    ...deleteIds('snapshotDependencies', 'snapshotId', snapshotIds),
    ...deleteIds('snapshotAssemblies', 'snapshotId', snapshotIds),
    ...deleteIds('snapshotResourceReleases', 'snapshotId', snapshotIds),
    ...setIds.map(
      id =>
        `UPDATE apiVersionReleaseSets SET previousRevisionApiReleaseSetId = NULL WHERE previousRevisionApiReleaseSetId = ${literal(id)};`,
    ),
    ...deleteIds('apiVersionReleaseSets', 'apiReleaseSetId', setIds),
    ...deleteIds('apiReleaseSets', 'id', setIds),
    `DELETE FROM assets WHERE resourceReleaseId IN (${RELEASES}) AND (role = 'resourceSourceArchive' OR role = 'manifest');`,
    // Keep source evidence assets and fixture identities available for replay.
    // assets.resourceReleaseId and journal references use ON DELETE SET NULL.
    ...deleteIds('snapshots', 'id', snapshotIds),
    ...deleteIds('resourceReleases', 'id', releaseIds),
    ...sourceReleaseIds.map(
      id =>
        `DELETE FROM sourceReleases WHERE id = ${literal(id)} AND NOT EXISTS (SELECT 1 FROM resourceReleases WHERE resourceReleases.sourceReleaseId = sourceReleases.id);`,
    ),
  ].join('\n')
  return { currentSql, historySql, sourceSql, metaSql }
}

function artefacts(
  context: LocalAddressDbContext,
  plan: StatsResetPlan,
): ResetSqlArtefact[] {
  const sql = buildStatsResetSql(plan)
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

export async function runResetStatsCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: { printUsage: () => void },
) {
  validateResetArguments(args, options.printUsage, 'reset:stats', [
    'dry-run',
    'yes',
    'keep-cache',
  ])
  const dryRun = args.options['dry-run'] === true
  const keepCache = args.options['keep-cache'] === true
  const context = await resolveLocalAddressDbContext(target, 'hk', '2025', {
    includeAllHistoryShardYears: true,
    includeAllSourceShardYears: true,
    requireExistingRemoteCache: target.remote,
  })
  try {
    const readContext = resetReadContext(context, target)
    const plan = await collectStatsResetPlan(readContext)
    const assertPlanMatches = async () => {
      if (
        JSON.stringify(await collectStatsResetPlan(context)) !== JSON.stringify(plan)
      ) {
        throw new Error(
          'Stats reset requires a matching local database cache. Run cache:rebuild for this target and retry.',
        )
      }
    }
    await assertPlanMatches()
    const blockers = await statsResetBlockers(readContext)
    note(
      [
        formatField('target', describeTarget(target).label),
        formatField(
          'scope',
          'All statistics records, dictionaries, contributed divisions and geometry, and retained history; every region',
        ),
        formatField('releases', String(plan.releases.length)),
        formatField('snapshots', String(plan.snapshots.length)),
        formatField('API release sets', String(plan.releaseSets.length)),
        ...plan.releaseSets
          .filter(row => row.familyType !== 'stats')
          .map(row => formatField('retract Divisions release set', String(row.code))),
        formatField('catalogue revisions', String(plan.catalogRevisions.length)),
        formatField('dryRun', String(dryRun)),
        formatField('keepCache', String(keepCache)),
        ...blockers.map(blocker => formatField('blocked', blocker)),
      ].join('\n'),
      'STATISTICS RESET PLAN',
    )
    if (blockers.length)
      throw new Error(
        `Stats reset blocked: ${blockers.join('; ')}. Reset or remove those dependencies first.`,
      )
    if (dryRun) return
    if (args.options.yes !== true) {
      const accepted = await confirm({
        message: `Remove all statistics datasets from ${describeTarget(target).label}?`,
        initialValue: false,
      })
      if (isCancel(accepted) || !accepted) throw new Error('Stats reset cancelled.')
    }
    await executeResetSqlArtefacts({
      artefacts: artefacts(context, plan),
      cacheReleaseCodes: plan.releases.map(row => String(row.code)),
      cacheReleaseIds: plan.releases.map(row => String(row.id)),
      cacheRoot: resolve(import.meta.dir, '../../../../../.local/harbour-sql/releases'),
      context,
      keepCache,
      target,
      remoteCacheErrorMessage:
        'Remote statistics reset succeeded but its local cache could not be updated',
      validateUnderLock: async () => {
        if (
          JSON.stringify(await collectStatsResetPlan(readContext)) !==
          JSON.stringify(plan)
        ) {
          throw new Error(
            'Stats reset plan changed during confirmation. Run reset:stats again.',
          )
        }
        await assertPlanMatches()
        const blockers = await statsResetBlockers(readContext)
        if (blockers.length)
          throw new Error(`Stats reset blocked: ${blockers.join('; ')}`)
      },
    })
    outro('All statistics datasets reset')
  } finally {
    context.cleanup()
  }
}
