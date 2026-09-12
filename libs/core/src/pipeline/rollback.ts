import type { ResourceType } from '../types'

export type DraftReleasePurgeInput = {
  apiReleaseSetId: string
  releaseId: string
  snapshotId: string
  source: string
  sourceVersion: string
  resourceType: ResourceType
}

export type DraftReleasePurgeSql = {
  current: string
  history: string
  meta: string
  source: string
}

export type DraftReleasePurgePlan = {
  currentTables: readonly string[]
  historyTables: readonly string[]
  sourceTables: readonly string[]
}

/**
 * Removes an unpublished API-family release which never became current.
 *
 * This is deliberately separate from a normal rollback: there is no prior
 * release to reinstate and the release's canonical history is discarded,
 * rather than retained as a non-current version.
 */
export function buildDraftReleasePurgeSql(
  input: DraftReleasePurgeInput,
): DraftReleasePurgeSql {
  const plan = resolveRollbackPlan(input)

  return {
    current: buildCurrentRollbackSql(input, plan),
    history: buildPurgeHistorySql(input, plan),
    meta: buildPurgeMetaSql(input),
    source: buildPurgeSourceSql(input, plan),
  }
}

export function describeDraftReleasePurgePlan(
  input: Pick<DraftReleasePurgeInput, 'source' | 'resourceType'>,
): DraftReleasePurgePlan {
  const plan = resolveRollbackPlan(input)

  return {
    currentTables: plan.currentTables.map(table => table.table),
    historyTables: plan.historyTables.map(table => table.table),
    sourceTables: plan.sourceTables,
  }
}

type RollbackCurrentTable = {
  table: string
  snapshotColumn?: string
}

type RollbackHistoryTable = {
  table: string
}

type RollbackPlan = {
  currentTables: RollbackCurrentTable[]
  historyTables: RollbackHistoryTable[]
  sourceTables: string[]
}

type RollbackResourcePlan = {
  currentTables: RollbackCurrentTable[]
  historyTables: RollbackHistoryTable[]
  sources: Record<string, string[]>
}

const rollbackPlans: Partial<Record<ResourceType, RollbackResourcePlan>> = {
  division: {
    currentTables: [
      { table: 'divisionSearchScopes' },
      { table: 'divisionsI18n' },
      { table: 'divisions' },
      { table: 'divisionPublicationState' },
    ],
    historyTables: [{ table: 'divisionsI18n' }, { table: 'divisions' }],
    sources: {
      overture: ['overtureDivisions'],
      'hkgov-pland-pu': ['hkgovPlandPlanningCells'],
      'hkgov-pland-new-town': ['hkgovPlandNewTowns'],
    },
  },
  divisionArea: {
    currentTables: [
      { table: 'divisionAreas' },
      { table: 'divisionAreaPublicationState' },
    ],
    historyTables: [{ table: 'divisionAreas' }],
    sources: { overture: ['overtureDivisionAreas'] },
  },
  divisionBoundary: {
    currentTables: [
      { table: 'divisionBoundaries' },
      { table: 'divisionBoundaryPublicationState' },
    ],
    historyTables: [{ table: 'divisionBoundaries' }],
    sources: { overture: ['overtureDivisionBoundaries'] },
  },
  address: {
    currentTables: [
      { table: 'addressSearchScopes' },
      { table: 'address3dI18n' },
      { table: 'address3d' },
      { table: 'address2dI18n' },
      { table: 'address2d' },
      { table: 'addressPublicationState' },
    ],
    historyTables: [
      { table: 'address3dI18n' },
      { table: 'address3d' },
      { table: 'address2dI18n' },
      { table: 'address2d' },
    ],
    sources: {
      'hkgov-dpo': ['hkgovAlsAddresses2d', 'hkgovAlsAddresses3d'],
    },
  },
  place: {
    currentTables: [
      { table: 'placesCells' },
      { table: 'placesDivision', snapshotColumn: 'placeSnapshotId' },
      { table: 'placesI18n' },
      { table: 'placeSearchScopes' },
      { table: 'places' },
      { table: 'placePublicationState' },
    ],
    historyTables: [{ table: 'placesI18n' }, { table: 'places' }],
    sources: { overture: ['overturePlaces'] },
  },
}

function buildCurrentRollbackSql(input: DraftReleasePurgeInput, plan: RollbackPlan) {
  return joinStatements(
    plan.currentTables.map(
      ({ table, snapshotColumn }) =>
        `DELETE FROM ${table} WHERE ${currentRollbackPredicateSql(table, snapshotColumn ?? 'snapshotId', input.snapshotId)};`,
    ),
  )
}

/** Search selection and publication receipts retain logical revisions; payload rows use scopes. */
export function currentRollbackPredicateSql(
  table: string,
  column: string,
  snapshotId: string,
) {
  if (table.endsWith('SearchScopes') || table.endsWith('PublicationState'))
    return `${column} = ${literal(snapshotId)}`
  const publication =
    table === 'divisionAreas'
      ? 'divisionAreaPublicationState'
      : table === 'divisionBoundaries'
        ? 'divisionBoundaryPublicationState'
        : table.startsWith('division')
          ? 'divisionPublicationState'
          : table.startsWith('address')
            ? 'addressPublicationState'
            : 'placePublicationState'
  return `${column} IN (SELECT scopeId FROM ${publication} WHERE snapshotId = ${literal(snapshotId)})`
}

function buildPurgeHistorySql(input: DraftReleasePurgeInput, plan: RollbackPlan) {
  return joinStatements([
    `DELETE FROM snapshotVersionChanges WHERE snapshotId = ${literal(input.snapshotId)};`,
    ...(input.resourceType === 'street'
      ? []
      : [
          `DELETE FROM sourceResolutions WHERE snapshotId = ${literal(input.snapshotId)};`,
        ]),
    ...plan.historyTables.map(
      ({ table }) =>
        `DELETE FROM ${table} WHERE snapshotId = ${literal(input.snapshotId)} AND sourceReleaseId = ${literal(input.releaseId)};`,
    ),
  ])
}

function buildPurgeSourceSql(input: DraftReleasePurgeInput, plan: RollbackPlan) {
  return joinStatements([
    ...plan.sourceTables.map(
      table => `DELETE FROM ${table} WHERE releaseId = ${literal(input.releaseId)};`,
    ),
    ...(input.resourceType === 'place'
      ? [
          `UPDATE overturePlaces SET isCurrent = 1, validToRelease = NULL WHERE isCurrent = 0 AND validToRelease = ${literal(input.sourceVersion)};`,
        ]
      : []),
  ])
}

function buildPurgeMetaSql(input: DraftReleasePurgeInput) {
  return joinStatements([
    `DELETE FROM apiFieldProvenance WHERE apiReleaseSetId = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM apiReleaseSetSnapshots WHERE apiReleaseSetId = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM publishedDataJournal WHERE releaseId = ${literal(input.releaseId)} OR relatedReleaseId = ${literal(input.releaseId)};`,
    `DELETE FROM stats WHERE releaseId = ${literal(input.releaseId)} OR apiReleaseSetId = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM ingestRuns WHERE releaseId = ${literal(input.releaseId)};`,
    `DELETE FROM releaseProcessingActions WHERE releaseId = ${literal(input.releaseId)};`,
    `DELETE FROM releaseProcessingActionChunks WHERE releaseId = ${literal(input.releaseId)};`,
    `DELETE FROM releaseShardAssignments WHERE releaseId = ${literal(input.releaseId)};`,
    `DELETE FROM snapshotAssemblyRuns WHERE snapshotId = ${literal(input.snapshotId)};`,
    `DELETE FROM snapshotSources WHERE snapshotId = ${literal(input.snapshotId)} OR resourceReleaseId = ${literal(input.releaseId)};`,
    `DELETE FROM apiReleaseSets WHERE id = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM snapshots WHERE id = ${literal(input.snapshotId)};`,
    `DELETE FROM releases WHERE id = ${literal(input.releaseId)};`,
  ])
}

function resolveRollbackPlan(
  input: Pick<DraftReleasePurgeInput, 'source' | 'resourceType'>,
): RollbackPlan {
  const resourcePlan = rollbackPlans[input.resourceType]

  if (!resourcePlan) {
    throw new Error(`Rollback is not implemented for ${input.resourceType} releases.`)
  }

  const sourceTables = resourcePlan.sources[input.source]

  if (sourceTables) {
    return {
      currentTables: resourcePlan.currentTables,
      historyTables: resourcePlan.historyTables,
      sourceTables,
    }
  }

  throw new Error(
    `Rollback is not implemented for source ${input.source}/${input.resourceType}.`,
  )
}

function joinStatements(statements: string[]) {
  return `${statements.filter(Boolean).join('\n\n')}\n`
}

function literal(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}
