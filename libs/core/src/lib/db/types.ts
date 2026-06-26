type QueryResultValue = Promise<unknown> | unknown
type QueryResultRows = Promise<unknown[]> | unknown[]

type ReadQueryBuilder = {
  from: (...args: unknown[]) => ReadQueryBuilder
  innerJoin: (...args: unknown[]) => ReadQueryBuilder
  where: (...args: unknown[]) => ReadQueryBuilder
  orderBy: (...args: unknown[]) => ReadQueryBuilder
  limit: (...args: unknown[]) => ReadQueryBuilder
  get: () => QueryResultValue
  all: () => QueryResultRows
}

type InsertQueryBuilder = {
  values: (...args: unknown[]) => InsertQueryBuilder
  onConflictDoUpdate: (...args: unknown[]) => InsertQueryBuilder
  onConflictDoNothing: (...args: unknown[]) => InsertQueryBuilder
  run: () => QueryResultValue
}

type UpdateQueryBuilder = {
  set: (...args: unknown[]) => UpdateQueryBuilder
  where: (...args: unknown[]) => UpdateQueryBuilder
  run: () => QueryResultValue
}

type DeleteQueryBuilder = {
  where: (...args: unknown[]) => DeleteQueryBuilder
  run: () => QueryResultValue
}

export type HarbourReadableDb = {
  select: (...args: unknown[]) => ReadQueryBuilder
}

export type HarbourWritableDb = {
  delete: (...args: unknown[]) => DeleteQueryBuilder
  insert: (...args: unknown[]) => InsertQueryBuilder
  update: (...args: unknown[]) => UpdateQueryBuilder
}
