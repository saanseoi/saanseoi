import type { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { captureNetSqlitePlan, type NetTablePolicy } from './netSqlitePlan.ts'
import { executeNativeSqlStatements } from './nativeSqlStatements.ts'
import { scopedPublicationDelivery } from './scopedPublicationDelivery.ts'
import {
  buildPublicationRowCountSql,
  type PublicationPreparation,
  type PublicationTable,
} from '@repo/core/pipeline/services/publication/sql.ts'
import type { SqlDeliveryTarget } from './sqlDeliveryTypes.ts'
import { inlineNativeParameters } from './nativePlanningCopy.ts'
import { splitSqlStatements } from '@repo/core/pipeline/services/addresses/sqlImportStages'
import { groupAuditSqlStatements } from '@repo/core/pipeline/db/processingActionSqlGroups'

type Receipt = {
  scopeId: string
  snapshotId: string
  publicationToken: string
  preparedAt: string | null
  status: string
  updatedAt: string
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing required SQL plan value: ${name}`)
  return value
}
export type ResolvedSqlTarget = {
  path: string
  databaseId?: string
  schema: Record<string, unknown>
  tables: NetTablePolicy[]
  /** Small lifecycle metadata keeps its ordered SQL contract outside content diffs. */
  retainSql?: boolean
  excludedTables?: string[]
}
export type ResolvedSqlCandidates = Record<
  string,
  {
    db: Database
    path: string
    drizzle: ReturnType<typeof drizzle>
    execute: (bytes: Uint8Array) => void
  }
>

/**
 * Family SQL and read-after-write queries operate only on isolated candidates.
 * Publication receipts are deliberately outside the row diff. Their completed
 * candidate transitions supply the exact predecessor claims around final mutations.
 * The caller holds the shared delivery lock through capture and sealing.
 */
export async function captureResolvedSqlPlan<T>(input: {
  targets: Record<string, ResolvedSqlTarget>
  publicationTables?: PublicationTable[]
  append: (target: SqlDeliveryTarget, bytes: Uint8Array, kind: 'bound') => Promise<void>
  generate: (candidates: ResolvedSqlCandidates) => Promise<T>
}) {
  const publications: ReturnType<typeof scopedPublicationDelivery>[] = []
  const retainedSql: Array<{ binding: string; sql: string }> = []
  let retainedPayloads: Array<{ binding: string; bytes: Uint8Array }> = []
  const append = async (
    target: SqlDeliveryTarget,
    bytes: Uint8Array,
    kind: 'bound',
  ) => {
    for (const publication of publications) await publication.begin()
    await (publications.at(-1)?.append ?? input.append)(target, bytes, kind)
  }
  const result = await captureNetSqlitePlan({
    targets: Object.fromEntries(
      Object.entries(input.targets).map(([binding, target]) => [
        binding,
        {
          ...target,
          excludedTables: [
            ...(target.excludedTables ?? []),
            ...(binding === 'DB_CURRENT' ? (input.publicationTables ?? []) : []),
          ],
        },
      ]),
    ),
    limits: { maxStatements: 60, maxPayloadBytes: 4 * 1024 * 1024 - 4096 },
    append,
    generate: async raw => {
      const candidates = Object.fromEntries(
        Object.entries(raw).map(([binding, value]) => [
          binding,
          {
            ...value,
            drizzle: drizzle({
              client: value.db,
              schema: required(input.targets[binding], binding).schema,
              ...(required(input.targets[binding], binding).retainSql
                ? {
                    logger: {
                      logQuery(query: string, params: unknown[]) {
                        if (!/^\s*select\b/i.test(query))
                          retainedSql.push({
                            binding,
                            sql: inlineNativeParameters(query, params),
                          })
                      },
                    },
                  }
                : {}),
            }),
            execute(bytes: Uint8Array) {
              value.db
                .transaction(() =>
                  executeNativeSqlStatements(value.db, new TextDecoder().decode(bytes)),
                )
                .immediate()
              if (required(input.targets[binding], binding).retainSql)
                retainedSql.push({ binding, sql: new TextDecoder().decode(bytes) })
            },
          },
        ]),
      )
      const current = raw.DB_CURRENT?.db
      const before = new Map<string, Receipt[]>()
      for (const table of input.publicationTables ?? []) {
        if (!current) throw new Error('Publication planning requires DB_CURRENT.')
        before.set(table, current.query<Receipt, []>(`SELECT * FROM "${table}"`).all())
      }
      const value = await input.generate(candidates)
      const ownedScopes = new Map<PublicationTable, string[]>()
      let capture = input.append
      for (const table of input.publicationTables ?? []) {
        const previousRows = required(before.get(table), table)
        const rows = required(current, 'DB_CURRENT')
          .query<Receipt, []>(`SELECT * FROM "${table}"`)
          .all()
        if (
          previousRows.some(
            previous => !rows.some(row => row.scopeId === previous.scopeId),
          )
        )
          throw new Error('Family preparation cannot remove a publication scope.')
        for (const row of rows) {
          const previous =
            previousRows.find(previous => previous.scopeId === row.scopeId) ?? null
          if (JSON.stringify(previous) === JSON.stringify(row)) continue
          ownedScopes.set(table, [...(ownedScopes.get(table) ?? []), row.scopeId])
          if (row.status !== 'publishing' || !row.preparedAt || !row.publicationToken)
            throw new Error(
              'Family preparation must finish its publication before emission.',
            )
          const preparation: PublicationPreparation = {
            table,
            scopeId: row.scopeId,
            snapshotId: row.snapshotId,
            publicationToken: row.publicationToken,
            timestamp: row.updatedAt,
            previous,
          }
          const counts =
            input.targets.DB_CURRENT?.tables
              .flatMap(policy => {
                const columns = required(current, 'DB_CURRENT')
                  .query<{ name: string }, []>(`PRAGMA table_info("${policy.name}")`)
                  .all()
                if (!columns.some(column => column.name === 'snapshotId')) return []
                const count =
                  required(current, 'DB_CURRENT')
                    .query<{ n: number }, [string]>(
                      `SELECT count(*) AS n FROM "${policy.name}" WHERE snapshotId=?`,
                    )
                    .get(row.scopeId)?.n ?? 0
                return [buildPublicationRowCountSql(policy.name, row.scopeId, count)]
              })
              .join(' AND ') || '1'
          const publication = scopedPublicationDelivery({
            preparation: () => preparation,
            previous: () => previous,
            validation: () => counts,
            target: {
              bindingName: 'DB_CURRENT',
              databaseId: input.targets.DB_CURRENT?.databaseId ?? 'DB_CURRENT',
            },
            capture,
          })
          publications.push(publication)
          capture = publication.append
        }
      }
      for (const policy of input.targets.DB_CURRENT?.tables ?? []) {
        const columns = required(current, 'DB_CURRENT')
          .query<{ name: string }, []>(`PRAGMA table_info("${policy.name}")`)
          .all()
        const column = ['snapshotId', 'placeSnapshotId', 'streetSnapshotId'].find(
          name => columns.some(column => column.name === name),
        )
        const owner: PublicationTable =
          policy.name === 'divisionAreas'
            ? 'divisionAreaPublicationState'
            : policy.name === 'divisionBoundaries'
              ? 'divisionBoundaryPublicationState'
              : policy.name.startsWith('places')
                ? 'placePublicationState'
                : policy.name.startsWith('street')
                  ? 'streetPublicationState'
                  : 'divisionPublicationState'
        if (column && input.publicationTables?.length)
          policy.rowScope = { column, values: ownedScopes.get(owner) ?? [] }
      }
      retainedPayloads = retainedSql.flatMap(retained =>
        groupAuditSqlStatements(splitSqlStatements(retained.sql), 60).map(group => {
          const bytes = Buffer.from(
            JSON.stringify(group.map(sql => ({ sql, params: [] }))),
          )
          if (
            bytes.byteLength > 4 * 1024 * 1024 ||
            group.some(sql => Buffer.byteLength(sql) > 100_000)
          )
            throw new Error(
              'Retained metadata transaction exceeds the delivery budget.',
            )
          return { binding: retained.binding, bytes }
        }),
      )
      return value
    },
  })
  // Finish outer wrappers first while their inner ownership guards remain active.
  for (const publication of publications.toReversed()) await publication.complete()
  for (const retained of retainedPayloads) {
    const target = required(input.targets[retained.binding], retained.binding)
    await input.append(
      {
        bindingName: retained.binding,
        databaseId: target.databaseId ?? retained.binding,
      },
      retained.bytes,
      'bound',
    )
  }
  return { result: result.result, mutationSummary: result.summary }
}
