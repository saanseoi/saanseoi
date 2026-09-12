import { resolve } from 'node:path'

export const REPO_ROOT = resolve(import.meta.dir, '../../../../..')

export const DATASET_ROOT = resolve(REPO_ROOT, 'fixtures/meta/datasets')

export const API_COMPOSITION_ROOT = resolve(REPO_ROOT, 'fixtures/meta/apiCompositions')

export const STATE_PATH = resolve(REPO_ROOT, '.local/harbour/update-state.json')

export const OVERTURIST_ROOT = resolve(REPO_ROOT, '../overturist')

export const OVERTURIST_ENTRYPOINT = resolve(OVERTURIST_ROOT, 'overturist.ts')

export const OVERTURE_HONG_KONG_DIVISION_ID = 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d'

export const DATA_GOV_HK_ALS_RESOURCE_URL =
  'https://www.als.gov.hk/data/ALS-GeoJSON.zip'

export const CSDI_ARCHIVE_ORIGIN = 'https://static.csdi.gov.hk'

export const CSDI_ARCHIVE_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

export const MAX_CSDI_ARCHIVE_BYTES = 1024 * 1024 * 1024

export const MAX_DATA_GOV_HK_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024

export const DATA_GOV_HK_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

export const MAX_CSDI_ARCHIVE_REDIRECTS = 5

export const HTTP_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
