declare type D1PreparedStatement = {
  all: <T = unknown>(...args: unknown[]) => Promise<T>
  bind: (...args: unknown[]) => D1PreparedStatement
  first: <T = unknown>(...args: unknown[]) => Promise<T | null>
  raw: <T = unknown>(...args: unknown[]) => Promise<T>
  run: (...args: unknown[]) => Promise<unknown>
}

declare type D1Database = {
  batch: (...args: unknown[]) => Promise<unknown>
  dump: (...args: unknown[]) => Promise<unknown>
  exec: (...args: unknown[]) => Promise<unknown>
  prepare: (...args: unknown[]) => D1PreparedStatement
  withSession: (...args: unknown[]) => D1Database
}
