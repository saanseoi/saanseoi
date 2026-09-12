import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')

export const LOCAL_RELEASE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/releases')

export const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)

export const DIVISION_BATCH_SIZE = 1024

export const LOCAL_SQL_WRITE_RETRY_LIMIT = 8

export const REMOTE_IMPORT_BATCH_BYTES = 64 * 1024 * 1024

export const SQL_STATEMENT_BYTE_TARGET = 96 * 1024

export const PRIMARY_HISTORY_OWNER_KEY = 'history-current'

export const PRIMARY_SOURCE_OWNER_KEY = 'source-current'
