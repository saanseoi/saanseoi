import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')

export const LOCAL_RELEASE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/releases')

export const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)

// Combined 2D/3D payloads include large inventories and publisher evidence.
// Bound both the Parquet window and concurrent normalisation heaps.
export const ADDRESS_CHUNK_SIZE = 4_096

export const GENERATION_CONCURRENCY = 1

export const LOCAL_SQL_WRITE_RETRY_LIMIT = 8

export const REMOTE_IMPORT_BATCH_BYTES = 64 * 1024 * 1024

export const SQL_STATEMENT_BYTE_TARGET = 99_000
