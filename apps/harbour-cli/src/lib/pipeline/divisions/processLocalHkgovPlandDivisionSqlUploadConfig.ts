import { resolve } from 'node:path'

export const LOCAL_RELEASE_ROOT = `${import.meta.dir}/../../../../../../.local/harbour-sql/releases`

export const PLANNING_DIVISION_SNAPSHOT_SOURCE_ROLE = 'primary'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')

export const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)

export const REMOTE_IMPORT_BATCH_BYTES = 64 * 1024 * 1024
