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
}

type RollbackHistoryTable = {
  clearsCohortValidity: boolean
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
    historyTables: [
      { table: 'divisionsI18n', clearsCohortValidity: false },
      { table: 'divisions', clearsCohortValidity: true },
    ],
    sources: {
      overture: ['overtureDivisionI18n', 'overtureDivisions'],
    },
  },
  divisionArea: {
    currentTables: [{ table: 'divisionAreas' }],
    historyTables: [{ table: 'divisionAreas', clearsCohortValidity: true }],
    sources: { overture: ['overtureDivisionAreas'] },
  },
  divisionBoundary: {
    currentTables: [{ table: 'divisionBoundaries' }],
    historyTables: [{ table: 'divisionBoundaries', clearsCohortValidity: true }],
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
      { table: 'address3dI18n', clearsCohortValidity: false },
      { table: 'address3d', clearsCohortValidity: true },
      { table: 'address2dI18n', clearsCohortValidity: false },
      { table: 'address2d', clearsCohortValidity: true },
    ],
    sources: {
      overture: ['overtureAddresses2d'],
      'hkgov-dpo': ['hkgovAlsAddress2dI18n', 'hkgovAlsAddresses2d'],
    },
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
      ({ table }) =>
        `DELETE FROM ${table} WHERE snapshotId = ${literal(input.snapshotId)};`,
    ),
  )
}

function buildHistoryRollbackSql(
  input: LatestReleaseRollbackInput,
  plan: RollbackPlan,
) {
  const now = sqlExpression("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")

  return joinStatements(
    plan.historyTables.flatMap(({ table, clearsCohortValidity }) => [
      [
        `UPDATE ${table}`,
        'SET isCurrent = 1,',
        '  validToSnapshotId = NULL,',
        ...(clearsCohortValidity ? ['  validToCohortKey = NULL,'] : []),
        `  updatedAt = ${now}`,
        'WHERE isCurrent = 0',
        `  AND validToSnapshotId = ${literal(input.snapshotId)};`,
      ].join('\n'),
      `DELETE FROM ${table} WHERE sourceReleaseId = ${literal(input.releaseId)} AND snapshotId = ${literal(input.snapshotId)};`,
    ]),
  )
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
