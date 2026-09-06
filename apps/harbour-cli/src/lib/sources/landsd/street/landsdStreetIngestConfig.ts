import { join, resolve } from 'node:path'

export const LANDSD_STREET_DATASET_CODE = 'ds-hk-hkgov-landsd-street'

export const LANDSD_STREET_INITIAL_SOURCE_VERSION = '2016-01-01.0'

export const DEFAULT_CURATION_PATH = resolve(
  import.meta.dir,
  '../../../../../../../fixtures/meta/curations/hkgov-landsd-street.json',
)

export const REPO_ROOT = resolve(import.meta.dir, '../../../../../../..')

export const DEFAULT_EGAZETTE_ARCHIVE_DIR = join(
  REPO_ROOT,
  'data/hkgov/gld/egazette/street-name',
)

export const PADDLE_OCR_SCRIPT = join(
  REPO_ROOT,
  'apps/harbour-dataops/paddleocrTraditional.py',
)

export const PADDLE_OCR_PYTHON =
  process.env.SAANSEOI_PADDLEOCR_PYTHON ??
  join(REPO_ROOT, 'apps/harbour-dataops/.venv/bin/python')
