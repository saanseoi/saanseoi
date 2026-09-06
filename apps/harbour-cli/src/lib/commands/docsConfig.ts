import { resolve } from 'node:path'

export const REPO_ROOT = resolve(import.meta.dir, '../../../../..')

export const API_RELEASE_SET_DOCS_ROOT = resolve(
  REPO_ROOT,
  'fixtures/meta/apiReleaseSets',
)

export const API_RELEASE_SET_NOTES_DIRECTORY = 'notes'

export const API_RELEASE_SET_GUIDES_DIRECTORY = 'guides'

export const RELEASE_DOCS_ROOT = resolve(REPO_ROOT, 'fixtures/meta/releases')

export const CURATION_ROOT = resolve(REPO_ROOT, 'fixtures/meta/curations')

export const API_COMPOSITIONS_ROOT = resolve(REPO_ROOT, 'fixtures/meta/apiCompositions')
