import { fillPlaceholders } from 'drizzle-orm'
import { sql } from '@repo/db'
import { splitSqlStatements } from '../addresses/sqlImportStages'
import {
  buildBeginPublicationSql,
  buildCompletePublicationSql,
  buildPublicationGuardSql,
  type PublicationPreparation,
} from './sql'

type SqlRunner = {
  run(statement: ReturnType<typeof sql.raw>): unknown
  transaction?: (operation: () => unknown) => unknown
  $client?: { prepare(text: string): unknown; batch(statements: unknown[]): unknown }
}

/** Keep assertions and receipt updates in one transaction, including native planning. */
export async function runPublicationSql(db: unknown, text: string) {
  const driver = db as SqlRunner
  const statements = splitSqlStatements(text)
  if (driver.$client?.batch) {
    await driver.$client.batch(
      statements.map(statement => driver.$client!.prepare(statement)),
    )
    return
  }
  if (driver.transaction) {
    driver.transaction(() => {
      for (const statement of statements) driver.run(sql.raw(statement))
    })
    return
  }
  throw new Error(
    'Publication preparation requires atomic database batches or transactions.',
  )
}

export async function beginSnapshotPublication(
  db: unknown,
  input: PublicationPreparation,
) {
  // The caller captures the predecessor before reading baseline rows. Resolving
  // it here could let a stale plan overwrite a newer completed scope.
  await runPublicationSql(db, buildBeginPublicationSql(input))
}

/** Resolve a completed local mirror, including an acknowledged deferred publication. */
export async function getPreparedPublication(
  db: import('../../../lib/db/types').HarbourReadableDb,
  table: import('./sql').PublicationTable,
  scopeId: string,
) {
  return (
    (await db
      .select({
        snapshotId: sql<string>`snapshotId`,
        publicationToken: sql<string>`publicationToken`,
      })
      .from(sql.raw(`"${table}"`))
      .where(
        sql`scopeId = ${scopeId} AND preparedAt IS NOT NULL AND publicationToken <> ''`,
      )
      .get()) ?? null
  )
}

/** Lookup reads retain logical revision selection while current records use stable keys. */
export async function resolvePreparedPublicationScope(
  db: import('../../../lib/db/types').HarbourReadableDb,
  table: import('./sql').PublicationTable,
  snapshotId: string,
) {
  const row = await db
    .select({ scopeId: sql<string>`scopeId` })
    .from(sql.raw(`"${table}"`))
    .where(
      sql`snapshotId = ${snapshotId} AND preparedAt IS NOT NULL AND publicationToken <> ''`,
    )
    .get()
  if (!row) throw new Error(`Snapshot ${snapshotId} has no complete ${table} receipt.`)
  return row.scopeId
}

export async function assertSnapshotPublication(
  db: unknown,
  input: PublicationPreparation,
) {
  await runPublicationSql(db, buildPublicationGuardSql(input))
}

export async function completeSnapshotPublication(
  db: unknown,
  input: PublicationPreparation,
  validationSql: string,
) {
  await runPublicationSql(db, buildCompletePublicationSql({ ...input, validationSql }))
}

type PreparedMutation = {
  executeMethod: 'run' | 'all' | 'get'
  getQuery(): { sql: string; params: unknown[] }
  mapRunResult(result: unknown, fromBatch: boolean): unknown
  mapAllResult(result: unknown, fromBatch: boolean): unknown
  mapGetResult(result: unknown, fromBatch: boolean): unknown
}

/** Every mutation checks ownership in the same database transaction as its data write. */
export function guardSnapshotPublicationWrites<T extends object>(
  db: T,
  input: PublicationPreparation,
): T {
  const guardText = buildPublicationGuardSql(input)
    .replace(/^SELECT /, '')
    .replace(/;$/, '')
  const driver = db as T & {
    select(fields: Record<string, unknown>): {
      from(table: unknown): { all(): unknown }
    }
    batch?: (statements: unknown[]) => Promise<unknown[]>
    transaction?: (operation: () => unknown) => unknown
  }
  const originals = new WeakMap<object, object>()
  const guardQuery = () =>
    driver.select({ publicationGuard: sql.raw(guardText) }).from(sql`(SELECT 1)`)
  const unwrap = (value: unknown) =>
    value && typeof value === 'object' ? (originals.get(value) ?? value) : value
  const execute = (target: object, terminal: string, args: unknown[]) => {
    const mutation = target as unknown as PreparedMutation & {
      _prepare?: () => PreparedMutation
    }
    const prepared = mutation._prepare?.() ?? mutation
    const method = terminal === 'execute' ? prepared.executeMethod : terminal
    const guard = guardQuery()
    if (driver.batch) {
      // Drizzle batch uses a query's default method. Preserve the caller's explicit
      // run/all/get/values method and placeholders when adapting it to an atomic batch.
      const adapted = new Proxy(prepared, {
        get(statement, property, receiver) {
          if (property === 'getQuery')
            return () => {
              const query = statement.getQuery()
              return {
                ...query,
                params: fillPlaceholders(
                  query.params,
                  (args[0] ?? {}) as Record<string, unknown>,
                ),
              }
            }
          if (property === 'mapResult')
            return (result: { results: Record<string, unknown>[] }) => {
              if (method === 'run') return statement.mapRunResult(result, true)
              if (method === 'get') return statement.mapGetResult(result, true)
              if (method === 'values')
                return result.results.map(row => Object.values(row))
              return statement.mapAllResult(result, true)
            }
          const value = Reflect.get(statement, property, receiver)
          return typeof value === 'function' ? value.bind(statement) : value
        },
      })
      return driver
        .batch([guard, { _prepare: () => adapted }])
        .then(results => results[1])
    }
    if (driver.transaction)
      return driver.transaction(() => {
        guard.all()
        return (target as Record<string, (...args: unknown[]) => unknown>)[
          method
        ]!.apply(target, args)
      })
    throw new Error(
      'Publication writes require atomic database batches or transactions.',
    )
  }
  const guarded = (statement: object): object => {
    const proxy = new Proxy(statement, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver)
        if (typeof value !== 'function') return value
        if (property === 'catch')
          return (onRejected: (reason: unknown) => unknown) =>
            Promise.resolve()
              .then(() => execute(target, 'execute', []))
              .catch(onRejected)
        if (property === 'finally')
          return (onFinally: () => void) =>
            Promise.resolve()
              .then(() => execute(target, 'execute', []))
              .finally(onFinally)
        if (property === 'then')
          return (...args: Parameters<Promise<unknown>['then']>) =>
            Promise.resolve(execute(target, 'execute', [])).then(...args)
        if (
          ['run', 'all', 'get', 'execute'].includes(String(property)) ||
          (property === 'values' && ('_prepare' in target || 'getQuery' in target))
        )
          return (...args: unknown[]) => execute(target, String(property), args)
        return (...args: unknown[]) => {
          const result = value.apply(target, args)
          return result && typeof result === 'object' && !(result instanceof Promise)
            ? guarded(result)
            : result
        }
      },
    })
    originals.set(proxy, statement)
    return proxy
  }
  return new Proxy(db, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      if (property === 'batch')
        return (statements: unknown[]) =>
          driver.batch!([guardQuery(), ...statements.map(unwrap)]).then(results =>
            results.slice(1),
          )
      if (['insert', 'update', 'delete'].includes(String(property)))
        return (...args: unknown[]) => guarded(value.apply(target, args))
      return value.bind(target)
    },
  })
}

/** A zero-row parent is usable only when its publication receipt proves completion. */
/** Metadata chooses the published predecessor; the local mirror proves acknowledged delivery. */
export async function assertPublishedSnapshotMaterialised(
  db: import('../../../lib/db/types').HarbourReadableDb,
  table: import('./sql').PublicationTable,
  snapshotId: string,
) {
  const row = await db
    .select({ snapshotId: sql<string>`snapshotId` })
    .from(sql.raw(`"${table}"`))
    .where(
      sql`snapshotId = ${snapshotId} AND preparedAt IS NOT NULL AND publicationToken <> ''`,
    )
    .get()
  if (!row)
    throw new Error(
      `Published snapshot ${snapshotId} has no complete ${table} receipt.`,
    )
}
