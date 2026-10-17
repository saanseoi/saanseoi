import { currentSchema, getTableColumns, getTableName } from '@repo/db'
import { retainedDivisionScopeId } from './scope'

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

/** Preserve complete dependencies before a stable serving scope is overwritten. */
export function retainPublicationSql(input: {
  family: 'division' | 'address'
  scopeId: string
  snapshotId: string
  previous?: { snapshotId: string; publicationToken: string } | null
}) {
  const previous = input.previous
  if (!previous || previous.snapshotId === input.snapshotId) return ''
  const c = currentSchema
  const receipt = `${input.family}PublicationState`
  const retained = literal(retainedDivisionScopeId(input.scopeId, previous.snapshotId))
  const scope = literal(input.scopeId)
  const guard = `EXISTS (SELECT 1 FROM ${receipt} WHERE scopeId=${scope} AND snapshotId=${literal(previous.snapshotId)} AND publicationToken=${literal(previous.publicationToken)} AND preparedAt IS NOT NULL)`
  const tables =
    input.family === 'division'
      ? [c.divisions, c.divisionsI18n]
      : [
          c.address2d,
          c.address2dI18n,
          c.address2dBuildingNumberLookup,
          c.address3d,
          c.address3dI18n,
          c.streetsAddress,
        ]
  const statements = tables.map(table => {
    const scopeColumn = table === c.streetsAddress ? 'addressSnapshotId' : 'scopeId'
    const columns = Object.values(getTableColumns(table)).map(column => column.name)
    return `INSERT INTO "${getTableName(table)}" (${columns.map(name => `"${name}"`).join(',')}) SELECT ${columns.map(name => (name === scopeColumn ? retained : `"${name}"`)).join(',')} FROM "${getTableName(table)}" WHERE "${scopeColumn}"=${scope} AND ${guard} ON CONFLICT DO NOTHING;`
  })
  if (input.family === 'division')
    statements.push(
      `UPDATE address2d SET divisionSnapshotId=${retained} WHERE divisionSnapshotId=${scope} AND ${guard};`,
    )
  // Move the receipt after copying its rows. The new publication can then claim
  // the stable scope without invalidating the old logical snapshot reference.
  statements.push(
    `UPDATE ${receipt} SET scopeId=${retained} WHERE scopeId=${scope} AND ${guard};`,
  )
  return statements.join('\n')
}

/** A replay may reclaim an already retained revision into its stable scope. */
export function releaseRetainedReceiptSql(input: {
  family: 'division' | 'address'
  scopeId: string
  snapshotId: string
}) {
  const retained = literal(retainedDivisionScopeId(input.scopeId, input.snapshotId))
  return `DELETE FROM ${input.family}PublicationState WHERE scopeId=${retained} AND snapshotId=${literal(input.snapshotId)} AND preparedAt IS NOT NULL;`
}

/** Repoint physical Address FKs only after the exact replacement is complete. */
export function finishRetainedPublicationSql(input: {
  family: 'division' | 'address'
  scopeId: string
  snapshotId: string
}) {
  const c = currentSchema
  const retained = literal(retainedDivisionScopeId(input.scopeId, input.snapshotId))
  const guard = `NOT EXISTS (SELECT 1 FROM ${input.family}PublicationState WHERE scopeId=${retained})`
  const tables =
    input.family === 'division'
      ? [c.divisionsI18n, c.divisions]
      : [
          c.address3dI18n,
          c.address3d,
          c.address2dI18n,
          c.address2dBuildingNumberLookup,
          c.address2d,
        ]
  return [
    ...(input.family === 'division'
      ? [
          `UPDATE address2d SET divisionSnapshotId=${literal(input.scopeId)} WHERE divisionSnapshotId=${retained} AND ${guard};`,
        ]
      : [
          `DELETE FROM streetsAddress WHERE addressSnapshotId=${retained} AND ${guard};`,
        ]),
    ...tables.map(
      table =>
        `DELETE FROM "${getTableName(table)}" WHERE scopeId=${retained} AND ${guard};`,
    ),
  ].join('\n')
}
