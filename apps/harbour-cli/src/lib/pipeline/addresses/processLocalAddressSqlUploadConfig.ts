import { resolve } from 'node:path'
import { resolveCpuCount } from './processLocalAddressSqlUploadImport.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')

export const LOCAL_RELEASE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/releases')

export const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)

export const ADDRESS_CHUNK_SIZE = 16_384

export const GENERATION_CONCURRENCY = Math.max(1, Math.min(resolveCpuCount(), 4))

export const LOCAL_SQL_WRITE_RETRY_LIMIT = 8

export const REMOTE_IMPORT_BATCH_BYTES = 64 * 1024 * 1024

export const SQL_STATEMENT_BYTE_TARGET = 99_000
