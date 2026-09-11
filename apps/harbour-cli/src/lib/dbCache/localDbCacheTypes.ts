import type { Database as SQLiteDatabase } from 'bun:sqlite'
import type {
  CurrentDatabase,
  HistoryDatabase,
  MetaDatabase,
  SourceDatabase,
} from '@repo/db'

export type D1TargetRecord = {
  bindingName: string
  databaseId: string | null
  databaseName: string
  localDatabaseId: string
}

export type DbCacheManifest = {
  cacheVersion: number
  cacheScopeKey?: string
  cacheTableProfile?: CacheTableProfile
  preparedAt: string
  target: 'local' | 'preview' | 'production'
  files: Record<string, string>
}

export type RemoteCachePartialCheckpoint = {
  bindingName: string
  cacheScopeKey?: string
  cacheTableProfile?: CacheTableProfile
  cacheVersion: number
  filePath: string
  target: 'preview' | 'production'
  validatedAt: string
}

export type RemoteCacheReplayJournal = {
  attemptCount: number
  cacheDir: string
  completedAt?: string
  failedAt?: string
  lastError?: string
  releaseCode: string
  startedAt: string
  status: 'failed' | 'replayed' | 'replaying'
  target: 'preview' | 'production'
}

type LocalD1PreparedStatement = {
  run(): Promise<unknown>
  sql: string
  params?: import('bun:sqlite').SQLQueryBindings[]
  bind(...params: unknown[]): LocalD1PreparedStatement
  all(): Promise<{ results: Record<string, unknown>[] }>
}

export type LocalD1ExecBinding = {
  bindingName?: string
  /** Native SQLite-only atomic execution of a generated SQL payload. */
  executeSqlBatch?(sql: string): Promise<void>
  batch(statements: LocalD1PreparedStatement[]): Promise<unknown>
  prepare(sql: string): LocalD1PreparedStatement
}

export type LocalAddressDbContext = {
  cleanup(): void
  currentBinding?: LocalD1ExecBinding
  currentDb: CurrentDatabase
  historyBinding?: LocalD1ExecBinding
  historyDb: HistoryDatabase
  historyTargets: Array<{
    binding?: LocalD1ExecBinding
    bindingName: string
    databaseId: string | null
    databaseName: string
    db: unknown
    year: string
  }>
  metaBinding?: LocalD1ExecBinding
  metaDb: MetaDatabase
  sourceBinding?: LocalD1ExecBinding
  sourceDb: SourceDatabase
  sourceTargets: Array<{
    binding?: LocalD1ExecBinding
    bindingName: string
    databaseId: string | null
    databaseName: string
    db: unknown
    year: string
  }>
  state: {
    files?: Record<string, string>
    bindings: Record<
      string,
      {
        databaseId: string | null
        databaseName: string
      }
    >
    dbCacheDir: string
    preparedAt: string
    target: 'local' | 'preview' | 'production'
  }
}

export type LocalDbCacheProgressEvent = {
  action:
    | 'check-cache'
    | 'export-binding'
    | 'reuse-cache'
    | 'mirror-table'
    | 'copy-binding'
    | 'validate-binding'
  bindingName: string
  current: number
  filter?: string
  tableName?: string
  target: 'preview' | 'production'
  total: number
}

export type OpenSqliteDb<TDb> = {
  db: TDb
  sqlite: SQLiteDatabase
}

export type InternalLocalShardTarget<TDb> = {
  binding?: LocalD1ExecBinding
  bindingName: string
  databaseId: string | null
  databaseName: string
  openDb: OpenSqliteDb<TDb> | OpenSqliteDb<unknown>
  year: string
}

export type RemoteTableImport = {
  binaryRowsPath?: string
  hasRows: boolean
  pruneOperation?: CachePruneOperation | null
  sqlPath: string
  tableName: string
}

export type CachePruneOperation = {
  retainedRowsWhereSql: string
  tableName: string
  whereSql: string
}

export type CacheTableProfile =
  | 'address'
  | 'division'
  | 'divisionGeometry'
  | 'divisionStatistic'
  | 'places'
  | 'statistics'
  | 'planningDivisionGeometry'
  | 'nativeSource'
  | 'street'

export type SqliteCacheWorkerPayload =
  | {
      binaryTableImports?: Array<
        Pick<RemoteTableImport, 'binaryRowsPath' | 'tableName'>
      >
      destinationPath: string
      dumpPaths: string[]
      pruneOperations?: CachePruneOperation[]
      kind: 'import-dumps'
    }
  | {
      bindingName: string
      filePath: string
      tableImports: RemoteTableImport[]
      kind: 'replace-table-rows'
    }
  | {
      filePath: string
      kind: 'checkpoint'
    }
