import { resolve } from 'node:path'

export const REPO_ROOT = resolve(import.meta.dir, '../../../../..')

export const WRANGLER_CONFIG_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-api/wrangler.jsonc',
)

export const LOCAL_D1_PERSIST_ROOT = resolve(REPO_ROOT, '.local/d1/dev')

export const CACHE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/db-cache')

export const SQLITE_CACHE_WORKER_PATH = resolve(import.meta.dir, 'sqliteCacheWorker.ts')

// v6 requires byte-for-byte validation of every mirrored binary geometry.
export const DB_CACHE_MANIFEST_VERSION = 6

export const REMOTE_CACHE_BINDING_CONCURRENCY = 4

export const WRANGLER_CONFIG_HOME = resolve(REPO_ROOT, '.local/wrangler')

export const WRANGLER_LOG_PATH = resolve(WRANGLER_CONFIG_HOME, 'logs')

export const DB_CACHE_PROGRESS_HEARTBEAT_MS = 1000

export const REMOTE_CACHE_REPLAY_RETRY_LIMIT = 3

export const REMOTE_CACHE_REPLAY_RETRY_DELAY_MS = 750

export const REMOTE_META_CACHE_REFRESH_RETRY_LIMIT = 3

export const REMOTE_META_CACHE_REFRESH_RETRY_DELAY_MS = 1_000

export const BEFORE_SHARD_CUTOFF_YEAR = 2025

// Each release receives historyShard and sourceShard assignments on publication.
export const REQUIRED_RELEASE_SHARD_ASSIGNMENTS = 2

export const LOCAL_SQLITE_OPEN_RETRY_LIMIT = 8

export const LOCAL_SQLITE_OPEN_RETRY_DELAY_MS = 250

export const REMOTE_GEOMETRY_PAGE_SIZE = 100

export const REMOTE_GEOMETRY_QUERY_CONCURRENCY = 4

export const REMOTE_CACHE_PARTIAL_DIR = '.partial'

export const VERSION_TABLES_WITH_CURRENT_ROWS = new Set([
  'address2d',
  'address2dI18n',
  'divisions',
  'divisionsI18n',
  'hkgovAlsAddresses2d',
  'hkgovLandsdStreets',
  'hkgovLandsdStreetI18n',
  'hkgovPlandNewTowns',
  'hkgovPlandPlanningCells',
  'overtureDivisions',
  'overtureDivisionAreas',
  'overtureDivisionBoundaries',
  'overturePlaces',
  'places',
  'placesI18n',
])
