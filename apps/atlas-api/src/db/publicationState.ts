import { publicationScopeId } from '@repo/core/pipeline/services/publication/scope.ts'
import {
  and,
  currentSchema,
  metaSnapshots,
  ne,
  eq,
  getColumnTable,
  getTableName,
  sql,
  type AnyColumn,
  type MetaDatabase,
  type CurrentDatabase,
} from '@repo/db'

export type PublicationFamily =
  | 'address'
  | 'division'
  | 'place'
  | 'street'
  | 'divisionArea'
  | 'divisionBoundary'

const publicationTables = {
  address: currentSchema.addressPublicationState,
  division: currentSchema.divisionPublicationState,
  place: currentSchema.placePublicationState,
  street: currentSchema.streetPublicationState,
  divisionArea: currentSchema.divisionAreaPublicationState,
  divisionBoundary: currentSchema.divisionBoundaryPublicationState,
}

/** Resolve logical publication IDs without binding one variable per snapshot. */
export function publicationScopeCondition(
  family: PublicationFamily,
  physicalScope: AnyColumn,
  snapshotIds: readonly string[],
) {
  const table = publicationTables[family]
  return sql`${physicalScope} in (
    select ${table.scopeId} from ${table}
    where ${table.status} = 'current' and ${table.preparedAt} is not null
      and ${table.publicationToken} <> ''
      and ${table.snapshotId} in (select value from json_each(${JSON.stringify(snapshotIds)}))
  )`
}

/** Current foreign keys carry storage scopes; public records carry publication IDs. */
export function publicationLogicalSnapshot(
  family: PublicationFamily,
  physicalScope: AnyColumn,
) {
  const table = publicationTables[family]
  // Drizzle removes column qualifiers from a single-table projection, including
  // nested SQL. Keep the outer reference qualified in this correlated subquery.
  const scope = sql`${sql.identifier(getTableName(getColumnTable(physicalScope)))}.${sql.identifier(physicalScope.name)}`
  return sql<string>`(select ${table.snapshotId} from ${table}
    where ${table.scopeId} = ${scope} and ${table.status} = 'current'
      and ${table.preparedAt} is not null and ${table.publicationToken} <> '')`
}

/** A response may use current only while every selected publication stays ready. */
export async function getPublicationReadiness(
  db: CurrentDatabase,
  family: PublicationFamily,
  snapshotIds: readonly string[],
): Promise<string | null> {
  const ids = [...new Set(snapshotIds)].sort()
  if (ids.length === 0) return '[]'
  const table = publicationTables[family]
  const rows = await db
    .select({
      snapshotId: table.snapshotId,
      updatedAt: table.updatedAt,
      publicationToken: table.publicationToken,
    })
    .from(table)
    .where(
      and(
        eq(table.status, 'current'),
        sql`${table.publicationToken} <> ''`,
        sql`${table.preparedAt} is not null`,
        sql`${table.snapshotId} in (select value from json_each(${JSON.stringify(ids)}))`,
      ),
    )
    .all()
  if (rows.length !== ids.length) return null
  return JSON.stringify(rows.sort((a, b) => a.snapshotId.localeCompare(b.snapshotId)))
}

/** A published companion displaced within its scope can be replayed from history. */
export async function hasSupersedingPublication(
  meta: MetaDatabase,
  current: CurrentDatabase,
  family: PublicationFamily,
  snapshotId: string,
) {
  const snapshot = await meta
    .select({
      lineage: metaSnapshots.snapshotLineageId,
      cohort: metaSnapshots.cohortKey,
    })
    .from(metaSnapshots)
    .where(
      and(
        eq(metaSnapshots.id, snapshotId),
        eq(metaSnapshots.resourceType, family),
        eq(metaSnapshots.status, 'published'),
      ),
    )
    .get()
  if (!snapshot?.lineage) return false
  const table = publicationTables[family]
  return Boolean(
    await current
      .select({ snapshotId: table.snapshotId })
      .from(table)
      .where(
        and(
          eq(
            table.scopeId,
            publicationScopeId(family, snapshot.lineage, snapshot.cohort),
          ),
          ne(table.snapshotId, snapshotId),
          eq(table.status, 'current'),
          sql`${table.preparedAt} is not null`,
          sql`${table.publicationToken} <> ''`,
        ),
      )
      .get(),
  )
}

export function hasHistoricalSelectors(query: {
  catalogRevision?: string
  releaseSet?: string
  knownAt?: string
  effectiveAt?: string
  cohort?: string
}) {
  return Boolean(
    query.catalogRevision ||
      query.releaseSet ||
      query.knownAt ||
      query.effectiveAt ||
      query.cohort,
  )
}

export class PublicationReadUnavailableError extends Error {}

/** Discard a response if publication changed during any of its component reads. */
export async function guardPublicationRead<T>(
  db: CurrentDatabase,
  family: PublicationFamily,
  snapshotIds: readonly string[],
  token: string | null,
  read: () => Promise<T>,
  getReadiness: typeof getPublicationReadiness = getPublicationReadiness,
): Promise<T | null> {
  try {
    const result = await read()
    return token === null || (await getReadiness(db, family, snapshotIds)) === token
      ? result
      : null
  } catch (error) {
    if (error instanceof PublicationReadUnavailableError) return null
    if (token !== null && (await getReadiness(db, family, snapshotIds)) !== token)
      return null
    throw error
  }
}
