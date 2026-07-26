declare type D1PreparedStatement = {
  all: <T = unknown>(...args: any[]) => Promise<T>
  bind: (...args: any[]) => D1PreparedStatement
  first: <T = unknown>(...args: any[]) => Promise<T | null>
  raw: <T = unknown>(...args: any[]) => Promise<T>
  run: (...args: any[]) => Promise<unknown>
}

declare type D1Database = {
  batch: (...args: any[]) => Promise<unknown>
  dump: (...args: any[]) => Promise<unknown>
  exec: (...args: any[]) => Promise<unknown>
  prepare: (...args: any[]) => D1PreparedStatement
  withSession: (...args: any[]) => D1Database
}
