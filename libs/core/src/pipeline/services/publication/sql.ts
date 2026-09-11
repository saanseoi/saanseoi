/** Publication receipts describe complete snapshots, never observation membership. */
export type PublicationTable =
  | 'divisionPublicationState'
  | 'placePublicationState'
  | 'streetPublicationState'
  | 'divisionAreaPublicationState'
  | 'divisionBoundaryPublicationState'

export type PublicationIdentity = {
  table: PublicationTable
  snapshotId: string
  publicationToken: string
}

export type PublicationPreparation = PublicationIdentity & {
  scopeId: string
  timestamp: string
  /** The exact acknowledged predecessor captured while the delivery plan is sealed. */
  previous?: { snapshotId: string; publicationToken: string } | null
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

function tableName(table: PublicationTable) {
  if (
    !/^(division|place|street|divisionArea|divisionBoundary)PublicationState$/.test(
      table,
    )
  )
    throw new Error('Invalid publication-state table.')
  return `"${table}"`
}

/** A read-only assertion: SQLite aborts the batch without creating guard rows. */
export function buildPublicationAssertionSql(predicate: string) {
  return `SELECT CASE WHEN (${predicate}) THEN 1 ELSE abs(-9223372036854775808) END /* saanseoi-publication-guard */;`
}

export function buildPublicationGuardSql(input: PublicationIdentity) {
  return buildPublicationAssertionSql(
    `EXISTS (SELECT 1 FROM ${tableName(input.table)} WHERE snapshotId = ${literal(input.snapshotId)} AND publicationToken = ${literal(input.publicationToken)} AND status = 'publishing' AND preparedAt IS NULL)`,
  )
}

/** The same sealed delivery may retry; another delivery cannot take its snapshot. */
export function buildBeginPublicationSql(input: PublicationPreparation) {
  const previous =
    input.previous && input.previous.snapshotId !== input.snapshotId
      ? `snapshotId = ${literal(input.previous.snapshotId)} AND publicationToken = ${literal(input.previous.publicationToken)} AND preparedAt IS NOT NULL`
      : '0'
  return [
    'SELECT 1 /* saanseoi-audit-commit:start */;',
    `INSERT INTO ${tableName(input.table)} (scopeId, snapshotId, status, publicationToken, preparedAt, createdAt, updatedAt) VALUES (${literal(input.scopeId)}, ${literal(input.snapshotId)}, 'publishing', ${literal(input.publicationToken)}, NULL, ${literal(input.timestamp)}, ${literal(input.timestamp)}) ON CONFLICT(scopeId) DO UPDATE SET snapshotId = excluded.snapshotId, status = 'publishing', publicationToken = excluded.publicationToken, preparedAt = NULL, updatedAt = excluded.updatedAt WHERE ${previous};`,
    buildPublicationAssertionSql(
      `EXISTS (SELECT 1 FROM ${tableName(input.table)} WHERE scopeId = ${literal(input.scopeId)} AND snapshotId = ${literal(input.snapshotId)} AND publicationToken = ${literal(input.publicationToken)} AND status = 'publishing' AND preparedAt IS NULL)`,
    ),
    'SELECT 1 /* saanseoi-audit-commit:end */;',
  ].join('\n')
}

/** Importers certify preparation only. Publication finalisation owns status=current. */
export function buildCompletePublicationSql(
  input: PublicationPreparation & { validationSql?: string },
) {
  return [
    'SELECT 1 /* saanseoi-audit-commit:start */;',
    buildPublicationGuardSql(input),
    ...(input.validationSql ? [buildPublicationAssertionSql(input.validationSql)] : []),
    `UPDATE ${tableName(input.table)} SET preparedAt = ${literal(input.timestamp)}, updatedAt = ${literal(input.timestamp)} WHERE snapshotId = ${literal(input.snapshotId)} AND publicationToken = ${literal(input.publicationToken)} AND status = 'publishing' AND preparedAt IS NULL;`,
    'SELECT 1 /* saanseoi-audit-commit:end */;',
  ].join('\n')
}

export function buildPublicationRowCountSql(
  table: string,
  snapshotId: string,
  count: number,
  column = 'snapshotId',
) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(table) || !/^[A-Za-z][A-Za-z0-9]*$/.test(column))
    throw new Error('Invalid publication count table or column.')
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error('Invalid publication row count.')
  return `(SELECT count(*) FROM "${table}" WHERE "${column}" = ${literal(snapshotId)}) = ${count}`
}

/** Reuse the delivery layer's bounded atomic-group envelope for guard + mutation. */
export function buildGuardedPublicationSql(
  input: PublicationIdentity,
  statements: string[],
) {
  return statements
    .map(statement =>
      [
        'SELECT 1 /* saanseoi-audit-commit:start */;',
        buildPublicationGuardSql(input),
        statement,
        'SELECT 1 /* saanseoi-audit-commit:end */;',
      ].join('\n'),
    )
    .join('\n')
}
