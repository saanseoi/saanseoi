type QueryFieldValue<TField> = TField extends { _: { data: infer TValue } }
  ? TValue
  : TField extends { _: { type: infer TValue } }
    ? TValue
    : TField extends Record<string, unknown>
      ? QueryRow<TField>
      : unknown

type QueryRow<TSelection extends Record<string, unknown>> = {
  [TKey in keyof TSelection]: QueryFieldValue<TSelection[TKey]>
}

type MaybePromise<TValue> = TValue | Promise<TValue>

type QueryResult<TResult> = {
  all(): MaybePromise<TResult[]>
  get(): MaybePromise<TResult | undefined>
}

type SelectGroupedQuery<TResult> = QueryResult<TResult> & {
  innerJoin(source: unknown, on: unknown): SelectGroupedQuery<TResult>
  limit(count: number): SelectGroupedQuery<TResult>
  orderBy(...values: unknown[]): SelectGroupedQuery<TResult>
  where(condition: unknown): SelectGroupedQuery<TResult>
}

type SelectQuery<TResult> = QueryResult<TResult> & {
  groupBy(...values: unknown[]): SelectGroupedQuery<TResult>
  innerJoin(source: unknown, on: unknown): SelectQuery<TResult>
  limit(count: number): SelectQuery<TResult>
  orderBy(...values: unknown[]): SelectQuery<TResult>
  where(condition: unknown): SelectQuery<TResult>
}

type SelectBuilder<TResult> = {
  from(source: unknown): SelectQuery<TResult>
}

type RunnableStatement = {
  run(): MaybePromise<unknown>
}

type InsertStatement = RunnableStatement & {
  onConflictDoNothing(config?: { target?: unknown | unknown[] }): RunnableStatement
  onConflictDoUpdate(config: {
    set: Record<string, unknown>
    target: unknown | unknown[]
  }): RunnableStatement
}

type InsertBuilder = {
  select(query: unknown): InsertStatement
  values(
    value: Record<string, unknown> | Array<Record<string, unknown>>,
  ): InsertStatement
}

type UpdateStatement = RunnableStatement & {
  where(condition: unknown): RunnableStatement
}

type DeleteStatement = RunnableStatement & {
  where(condition: unknown): RunnableStatement
}

export type HarbourReadableDb = {
  select(): SelectBuilder<Record<string, unknown>>
  select<TSelection extends Record<string, unknown>>(
    fields: TSelection,
  ): SelectBuilder<QueryRow<TSelection>>
}

export type HarbourWritableDb = {
  delete(from: unknown): DeleteStatement
  insert(into: unknown): InsertBuilder
  update(table: unknown): {
    set(values: Record<string, unknown>): UpdateStatement
  }
}
