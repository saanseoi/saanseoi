import { publicationScopeId } from '@repo/core/pipeline/services/publication/scope.ts'
import {
  and,
  currentSchema,
  metaSnapshotLineages,
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
  let dependencies: Array<{
    family: string
    snapshotId: string | null
    publicationToken: string | null
    updatedAt: string | null
  }> = []
  if (family === 'place' || family === 'address') {
    const direct =
      family === 'place'
        ? sql`SELECT 'division' family, divisionSnapshotId snapshotId FROM selected
          UNION SELECT 'address', addressSnapshotId FROM selected
          UNION SELECT 'address', supplementaryAddressSnapshotId FROM selected WHERE supplementaryAddressSnapshotId IS NOT NULL`
        : sql`SELECT 'division' family, divisionSnapshotId snapshotId FROM selected`
    // One bounded query checks every direct and transitive serving dependency.
    dependencies = await db
      .select({
        family: sql<string>`family`,
        snapshotId: sql<string | null>`snapshotId`,
        publicationToken: sql<string | null>`publicationToken`,
        updatedAt: sql<string | null>`updatedAt`,
      })
      .from(sql`(
      WITH selected AS (SELECT * FROM ${table} WHERE snapshotId IN (SELECT value FROM json_each(${JSON.stringify(ids)}))),
      direct AS (${direct}),
      required AS (SELECT * FROM direct UNION SELECT 'division', a.divisionSnapshotId FROM direct r LEFT JOIN addressPublicationState a ON a.snapshotId=r.snapshotId WHERE r.family='address'),
      ready AS (
        SELECT 'division' family,snapshotId,publicationToken,updatedAt FROM divisionPublicationState WHERE status='current' AND preparedAt IS NOT NULL AND publicationToken<>''
        UNION ALL SELECT 'address',snapshotId,publicationToken,updatedAt FROM addressPublicationState WHERE status='current' AND preparedAt IS NOT NULL AND publicationToken<>''
      )
      SELECT r.family,r.snapshotId,p.publicationToken,p.updatedAt FROM required r LEFT JOIN ready p ON p.family=r.family AND p.snapshotId=r.snapshotId
    )`)
      .all()
    if (dependencies.some(row => !row.snapshotId || !row.publicationToken)) return null
  }
  dependencies.sort(
    (a, b) =>
      a.family.localeCompare(b.family) ||
      (a.snapshotId ?? '').localeCompare(b.snapshotId ?? ''),
  )
  return JSON.stringify([
    rows.sort((a, b) => a.snapshotId.localeCompare(b.snapshotId)),
    dependencies,
  ])
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
    .innerJoin(
      metaSnapshotLineages,
      eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
    )
    .where(
      and(
        eq(metaSnapshots.id, snapshotId),
        eq(metaSnapshotLineages.resourceType, family),
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
