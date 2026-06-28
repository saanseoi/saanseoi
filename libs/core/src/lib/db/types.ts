type QueryResultValue<T = unknown> = Promise<T> | T
type QueryResultRows<T = unknown> = Promise<T[]> | T[]
type QueryArgs = readonly unknown[]

type ReadQueryBuilder<T = unknown> = {
  innerJoin: (...args: QueryArgs) => ReadQueryBuilder<T>
  where: (...args: QueryArgs) => ReadQueryBuilder<T>
  orderBy: (...args: QueryArgs) => ReadQueryBuilder<T>
  limit: (...args: QueryArgs) => ReadQueryBuilder<T>
  get: () => QueryResultValue<T | undefined>
  all: () => QueryResultRows<T>
}

type SelectQueryBuilder<T = unknown> = {
  from: (...args: QueryArgs) => ReadQueryBuilder<T>
}

type RunnableQueryBuilder<T = unknown> = {
  run: () => QueryResultValue<T>
}

type InsertQueryBuilder = {
  values: (...args: QueryArgs) => RunnableQueryBuilder
}

type UpdateQueryBuilder = {
  set: (...args: QueryArgs) => {
    where: (...args: QueryArgs) => RunnableQueryBuilder
  }
}

type DeleteQueryBuilder = {
  where: (...args: QueryArgs) => RunnableQueryBuilder
}

export type HarbourReadableDb = {
  select: <T = unknown>(...args: QueryArgs) => SelectQueryBuilder<T>
}

export type HarbourWritableDb = {
  delete: (...args: QueryArgs) => DeleteQueryBuilder
  insert: (...args: QueryArgs) => InsertQueryBuilder
  update: (...args: QueryArgs) => UpdateQueryBuilder
}
