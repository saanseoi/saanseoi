import { resolve } from 'node:path'

export const LOCAL_RELEASE_ROOT = `${import.meta.dir}/../../../../../.local/harbour-sql/releases`

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')

export const HARBOUR_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)

export const CENSTATD_2021_DISTRICT_VARIANT = 'hkgov-censtatd-landclipped'

export const HKGOV_DISPLAY_SIMPLIFICATION_TOLERANCE_METRES = 10

// D1 accepts statements no larger than 100 KB. Reserve a small margin for
// platform-side import handling rather than producing statements at the limit.
export const MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES = 96 * 1024
