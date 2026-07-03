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

export function buildLatestReleaseRollbackSql(
  input: LatestReleaseRollbackInput,
): LatestReleaseRollbackSql {
  return {
    current: buildCurrentRollbackSql(input),
    history: buildHistoryRollbackSql(input),
    meta: buildMetaRollbackSql(input),
    source: buildSourceRollbackSql(input),
  }
}

function buildMetaRollbackSql(input: LatestReleaseRollbackInput) {
  const now = sqlExpression("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
  const statements = [
    `DELETE FROM apiFieldProvenance WHERE apiReleaseSetId = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM apiReleaseSetSnapshots WHERE apiReleaseSetId = ${literal(input.apiReleaseSetId)};`,
    `DELETE FROM publishedDataJournal WHERE releaseId = ${literal(input.releaseId)} OR relatedReleaseId = ${literal(input.releaseId)};`,
    `DELETE FROM stats WHERE releaseId = ${literal(input.releaseId)};`,
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

function buildCurrentRollbackSql(input: LatestReleaseRollbackInput) {
  if (input.type === 'division') {
    return joinStatements([
      `DELETE FROM divisionsI18n WHERE snapshotId = ${literal(input.snapshotId)};`,
      `DELETE FROM divisions WHERE snapshotId = ${literal(input.snapshotId)};`,
    ])
  }

  if (input.type === 'address') {
    return joinStatements([
      `DELETE FROM address3dI18n WHERE snapshotId = ${literal(input.snapshotId)};`,
      `DELETE FROM address3d WHERE snapshotId = ${literal(input.snapshotId)};`,
      `DELETE FROM address2dI18n WHERE snapshotId = ${literal(input.snapshotId)};`,
      `DELETE FROM address2d WHERE snapshotId = ${literal(input.snapshotId)};`,
    ])
  }

  throw new Error(`Rollback is not implemented for current ${input.type} releases.`)
}

function buildHistoryRollbackSql(input: LatestReleaseRollbackInput) {
  const now = sqlExpression("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
  const tables =
    input.type === 'division'
      ? [
          { table: 'divisionsI18n', idColumn: 'divisionId' },
          { table: 'divisions', idColumn: 'id' },
        ]
      : input.type === 'address'
        ? [
            { table: 'address3dI18n', idColumn: 'address3dId' },
            { table: 'address3d', idColumn: 'id' },
            { table: 'address2dI18n', idColumn: 'addressId' },
            { table: 'address2d', idColumn: 'id' },
          ]
        : []

  if (tables.length === 0) {
    throw new Error(`Rollback is not implemented for history ${input.type} releases.`)
  }

  return joinStatements(
    tables.flatMap(({ table }) => [
      [
        `UPDATE ${table}`,
        'SET isCurrent = 1,',
        '  validToSnapshotId = NULL,',
        ...(table.endsWith('I18n') ? [] : ['  validToCohortKey = NULL,']),
        `  updatedAt = ${now}`,
        'WHERE isCurrent = 0',
        `  AND validToSnapshotId = ${literal(input.snapshotId)};`,
      ].join('\n'),
      `DELETE FROM ${table} WHERE sourceReleaseId = ${literal(input.releaseId)} AND snapshotId = ${literal(input.snapshotId)};`,
    ]),
  )
}

function buildSourceRollbackSql(input: LatestReleaseRollbackInput) {
  const now = sqlExpression("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
  const tables = resolveSourceTables(input)

  return joinStatements(
    tables.flatMap(table => [
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

function resolveSourceTables(input: LatestReleaseRollbackInput) {
  if (input.source === 'overture' && input.type === 'division') {
    return ['overtureDivisionI18n', 'overtureDivisions']
  }

  if (input.source === 'overture' && input.type === 'address') {
    return ['overtureAddresses2d']
  }

  if (input.source === 'hkgov-als' && input.type === 'address') {
    return ['hkgovAlsAddress2dI18n', 'hkgovAlsAddresses2d']
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
