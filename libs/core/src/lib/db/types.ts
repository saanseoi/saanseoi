type QueryResultValue<T = unknown> = Promise<T> | T
type QueryResultRows<T = unknown> = Promise<T[]> | T[]

type ReadQueryBuilder<T = unknown> = {
  innerJoin: (...args: any[]) => any
  where: (...args: any[]) => any
  orderBy: (...args: any[]) => any
  limit: (...args: any[]) => any
  get: () => QueryResultValue<T | undefined>
  all: () => QueryResultRows<T>
}

type SelectQueryBuilder<T = unknown> = {
  from: (...args: any[]) => ReadQueryBuilder<T>
}

type InsertQueryBuilder = {
  values: (...args: any[]) => any
}

type UpdateQueryBuilder = {
  set: (...args: any[]) => any
}

type DeleteQueryBuilder = {
  where: (...args: any[]) => any
}

export type HarbourReadableDb = {
  select: <T = unknown>(...args: any[]) => SelectQueryBuilder<T>
}

export type HarbourWritableDb = {
  delete: (...args: any[]) => DeleteQueryBuilder
  insert: (...args: any[]) => InsertQueryBuilder
  update: (...args: any[]) => UpdateQueryBuilder
}
