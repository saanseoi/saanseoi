import type { ResourceType } from '../types'

export type LatestReleaseRollbackInput = {
  apiReleaseSetId: string
  previousApiReleaseSetId?: string | null
  previousReleaseId?: string | null
  releaseId: string
  snapshotId: string
  source: string
  sourceVersion: string
  type: ResourceType
}

export type LatestReleaseRollbackSql = {
  current: string
  history: string
  meta: string
  source: string
}

export type LatestReleaseRollbackPlan = {
  currentTables: readonly string[]
  historyTables: readonly string[]
  sourceTables: readonly string[]
}

export function buildLatestReleaseRollbackSql(
  input: LatestReleaseRollbackInput,
): LatestReleaseRollbackSql {
  const plan = resolveRollbackPlan(input)

  return {
    current: buildCurrentRollbackSql(input, plan),
    history: buildHistoryRollbackSql(input, plan),
    meta: buildMetaRollbackSql(input),
    source: buildSourceRollbackSql(input, plan),
  }
}

/**
 * Removes an unpublished API-family release which never became current.
 *
 * This is deliberately separate from a normal rollback: there is no prior
 * release to reinstate and the release's canonical history is discarded,
 * rather than retained as a non-current version.
 */
export function buildDraftReleasePurgeSql(
  input: LatestReleaseRollbackInput,
): LatestReleaseRollbackSql {
  const plan = resolveRollbackPlan(input)

  return {
    current: buildCurrentRollbackSql(input, plan),
    history: buildPurgeHistorySql(input, plan),
    meta: buildPurgeMetaSql(input),
    source: buildPurgeSourceSql(input, plan),
  }
}

export function describeLatestReleaseRollbackPlan(
  input: Pick<LatestReleaseRollbackInput, 'source' | 'type'>,
): LatestReleaseRollbackPlan {
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
    currentTables: [{ table: 'divisionsI18n' }, { table: 'divisions' }],
    historyTables: [{ table: 'divisionsI18n' }, { table: 'divisions' }],
    sources: {
      overture: ['overtureDivisions'],
      'hkgov-pland-pu': ['hkgovPlandPlanningCells'],
      'hkgov-pland-new-town': ['hkgovPlandNewTowns'],
    },
  },
  divisionArea: {
    currentTables: [{ table: 'divisionAreas' }],
    historyTables: [{ table: 'divisionAreas' }],
    sources: { overture: ['overtureDivisionAreas'] },
  },
  divisionBoundary: {
    currentTables: [{ table: 'divisionBoundaries' }],
    historyTables: [{ table: 'divisionBoundaries' }],
    sources: { overture: ['overtureDivisionBoundaries'] },
  },
  address: {
    currentTables: [
      { table: 'address3dI18n' },
      { table: 'address3d' },
      { table: 'address2dI18n' },
      { table: 'address2d' },
    ],
    historyTables: [
      { table: 'address3dI18n' },
      { table: 'address3d' },
      { table: 'address2dI18n' },
      { table: 'address2d' },
    ],
    sources: {
      'hkgov-dpo': ['hkgovAlsAddresses2d'],
    },
  },
  place: {
    currentTables: [
      { table: 'placesCells' },
      { table: 'placesDivision', snapshotColumn: 'placeSnapshotId' },
      { table: 'placesI18n' },
      { table: 'placesFts' },
      { table: 'places' },
    ],
    historyTables: [{ table: 'placesI18n' }, { table: 'places' }],
    sources: { overture: ['overturePlaces'] },
  },
}

function buildMetaRollbackSql(input: LatestReleaseRollbackInput) {
  const now = sqlExpression("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
  const statements = [
    `DELETE FROM apiFieldProvenance WHERE apiReleaseSetId = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM apiReleaseSetSnapshots WHERE apiReleaseSetId = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM publishedDataJournal WHERE releaseId = ${literal(input.releaseId)} OR relatedReleaseId = ${literal(input.releaseId)};`,
    `DELETE FROM stats WHERE releaseId = ${literal(input.releaseId)} OR snapshotId = ${literal(input.snapshotId)};`,
    `DELETE FROM ingestRuns WHERE releaseId = ${literal(input.releaseId)};`,
    `DELETE FROM releaseShardAssignments WHERE releaseId = ${literal(input.releaseId)};`,
    `DELETE FROM snapshotAssemblyRuns WHERE snapshotId = ${literal(input.snapshotId)};`,
    `DELETE FROM snapshotSources WHERE snapshotId = ${literal(input.snapshotId)} OR sourceReleaseId = ${literal(input.releaseId)};`,
    `DELETE FROM apiReleaseSets WHERE id = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM snapshots WHERE id = ${literal(input.snapshotId)};`,
  ]

  if (input.previousApiReleaseSetId) {
    statements.push(
      [
        'UPDATE apiReleaseSets',
        "SET status = 'current',",
        '  validTo = NULL,',
        `  updatedAt = ${now}`,
        `WHERE id = ${literal(input.previousApiReleaseSetId)};`,
      ].join('\n'),
    )
  }

  if (input.previousReleaseId) {
    statements.push(
      [
        'UPDATE releases',
        "SET status = 'published',",
        '  revokedAt = NULL,',
        '  revocationReason = NULL,',
        '  supersededByReleaseId = NULL,',
        `  updatedAt = ${now}`,
        `WHERE id = ${literal(input.previousReleaseId)};`,
      ].join('\n'),
    )
  }

  statements.push(`DELETE FROM releases WHERE id = ${literal(input.releaseId)};`)

  return joinStatements(statements)
}

function buildCurrentRollbackSql(
  input: LatestReleaseRollbackInput,
  plan: RollbackPlan,
) {
  return joinStatements(
    plan.currentTables.map(
      ({ table, snapshotColumn }) =>
        `DELETE FROM ${table} WHERE ${snapshotColumn ?? 'snapshotId'} = ${literal(input.snapshotId)};`,
    ),
  )
}

function buildHistoryRollbackSql(
  input: LatestReleaseRollbackInput,
  plan: RollbackPlan,
) {
  return joinStatements([
    `DELETE FROM snapshotVersionChanges WHERE snapshotId = ${literal(input.snapshotId)};`,
    ...plan.historyTables.map(
      ({ table }) =>
        `UPDATE ${table} SET isCurrent = 0 WHERE snapshotId = ${literal(input.snapshotId)};`,
    ),
  ])
}

function buildPurgeHistorySql(input: LatestReleaseRollbackInput, plan: RollbackPlan) {
  return joinStatements([
    `DELETE FROM snapshotVersionChanges WHERE snapshotId = ${literal(input.snapshotId)};`,
    ...plan.historyTables.map(
      ({ table }) =>
        `DELETE FROM ${table} WHERE snapshotId = ${literal(input.snapshotId)} AND sourceReleaseId = ${literal(input.releaseId)};`,
    ),
  ])
}

function buildSourceRollbackSql(input: LatestReleaseRollbackInput, plan: RollbackPlan) {
  const now = sqlExpression("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")

  return joinStatements(
    plan.sourceTables.flatMap(table => [
      [
        `UPDATE ${table}`,
        'SET isCurrent = 1,',
        '  validToRelease = NULL,',
        `  updatedAt = ${now}`,
        'WHERE isCurrent = 0',
        `  AND validToRelease = ${literal(input.sourceVersion)};`,
      ].join('\n'),
      ...(input.previousReleaseId
        ? [
            [
              `UPDATE ${table}`,
              `SET releaseId = ${literal(input.previousReleaseId)},`,
              `  updatedAt = ${now}`,
              `WHERE releaseId = ${literal(input.releaseId)}`,
              `  AND validFromRelease <> ${literal(input.sourceVersion)};`,
            ].join('\n'),
          ]
        : []),
      `DELETE FROM ${table} WHERE releaseId = ${literal(input.releaseId)} AND validFromRelease = ${literal(input.sourceVersion)};`,
    ]),
  )
}

function buildPurgeSourceSql(input: LatestReleaseRollbackInput, plan: RollbackPlan) {
  return joinStatements(
    plan.sourceTables.map(
      table => `DELETE FROM ${table} WHERE releaseId = ${literal(input.releaseId)};`,
    ),
  )
}

function buildPurgeMetaSql(input: LatestReleaseRollbackInput) {
  return joinStatements([
    `DELETE FROM apiFieldProvenance WHERE apiReleaseSetId = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM apiReleaseSetSnapshots WHERE apiReleaseSetId = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM publishedDataJournal WHERE releaseId = ${literal(input.releaseId)} OR relatedReleaseId = ${literal(input.releaseId)};`,
    `DELETE FROM stats WHERE releaseId = ${literal(input.releaseId)} OR snapshotId = ${literal(input.snapshotId)} OR apiReleaseSetId = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM ingestRuns WHERE releaseId = ${literal(input.releaseId)};`,
    `DELETE FROM releaseProcessingActions WHERE releaseId = ${literal(input.releaseId)};`,
    `DELETE FROM releaseShardAssignments WHERE releaseId = ${literal(input.releaseId)};`,
    `DELETE FROM snapshotAssemblyRuns WHERE snapshotId = ${literal(input.snapshotId)};`,
    `DELETE FROM snapshotSources WHERE snapshotId = ${literal(input.snapshotId)} OR sourceReleaseId = ${literal(input.releaseId)};`,
    `DELETE FROM apiReleaseSets WHERE id = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM snapshots WHERE id = ${literal(input.snapshotId)};`,
    `DELETE FROM releases WHERE id = ${literal(input.releaseId)};`,
  ])
}

function resolveRollbackPlan(
  input: Pick<LatestReleaseRollbackInput, 'source' | 'type'>,
): RollbackPlan {
  const resourcePlan = rollbackPlans[input.type]

  if (!resourcePlan) {
    throw new Error(`Rollback is not implemented for ${input.type} releases.`)
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
    `Rollback is not implemented for source ${input.source}/${input.type}.`,
  )
}

function joinStatements(statements: string[]) {
  return `${statements.filter(Boolean).join('\n\n')}\n`
}

function literal(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function sqlExpression(value: string) {
  return value
}
