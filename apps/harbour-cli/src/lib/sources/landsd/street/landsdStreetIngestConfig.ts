import { join, resolve } from 'node:path'

export const LANDSD_STREET_DATASET_CODE = 'ds-hk-hkgov-landsd-street'

export const DEFAULT_CURATION_PATH = resolve(
  import.meta.dir,
  '../../../../../../../fixtures/meta/curations/hkgov-landsd-street.json',
)

export const DEFAULT_BASELINE_REGISTRY_PATH = resolve(
  import.meta.dir,
  '../../../../../../../fixtures/meta/curations/hkgov-landsd-street-baseline.json',
)

export const REPO_ROOT = resolve(import.meta.dir, '../../../../../../..')

export const DEFAULT_EGAZETTE_ARCHIVE_DIR = join(
  REPO_ROOT,
  'data/hkgov/gld/egazette/street-name',
)
