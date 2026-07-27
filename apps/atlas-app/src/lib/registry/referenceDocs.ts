import overtureLocalisation from '../../../../../docs/datasets/sources/overture/localisation.md?raw'
import overtureDivisionHierarchy from '../../../../../docs/datasets/sources/overture/divisionHierarchy.md?raw'
import overtureDivisionTypeLevelMapping from '../../../../../docs/datasets/sources/overture/divisionType.md?raw'
import censtatdTerms from '../../../../../docs/datasets/sources/hkgov-censtatd/terms.md?raw'

import {
  getLocalisedMessage,
  type AppLocale,
  type MessageKey,
} from '$lib/bits/internal/i18n'
import { selectMarkdownHeadingPath } from './markdown'

export const markdownReferenceScheme = 'saanseoi:'

type MarkdownTransclusion = {
  displayTitleKey: ReferenceMessageKey
  markdown: string
  title: string
  type: 'definition' | 'note'
  version: string
}

type MarkdownReferenceSource = {
  displayTitleKey: ReferenceMessageKey
  source: string
  title: string
}

type ReferenceMessageKey = Extract<MessageKey, `reference_${string}`>

const markdownReferences: Record<string, MarkdownReferenceSource> = {
  'overture-division-locale-normalisation': {
    title: 'locale',
    displayTitleKey: 'reference_locale_normalisation',
    source: overtureLocalisation,
  },
  'overture-division-type-level-mapping': {
    title: 'division type and level',
    displayTitleKey: 'reference_division_type_level',
    source: overtureDivisionTypeLevelMapping,
  },
  'overture-division-hierarchy-normalisation': {
    title: 'division hierarchy normalisation',
    displayTitleKey: 'reference_division_hierarchy_normalisation',
    source: overtureDivisionHierarchy,
  },
  'hkgov-censtatd': {
    title: 'C&SD',
    displayTitleKey: 'reference_censtatd',
    source: censtatdTerms,
  },
  'hkgov-csdi': {
    title: 'CSDI',
    displayTitleKey: 'reference_csdi',
    source: censtatdTerms,
  },
}

// Release notes published before the catalogue spelling was standardised use
// the American `normalization` spelling in their reference IDs.
const markdownReferenceAliases: Record<string, string> = {
  'overture-division-locale-normalization': 'overture-division-locale-normalisation',
  'overture-division-hierarchy-normalization':
    'overture-division-hierarchy-normalisation',
}

export function getMarkdownTransclusion(href: string | null | undefined) {
  if (!href?.startsWith(markdownReferenceScheme)) return null

  const match =
    /^saanseoi:([a-z0-9-]+):(note|definition)\/([a-z0-9-]+)\/v([1-9]\d*)$/.exec(href)
  if (!match) return null

  const [, locale, type, id, version] = match
  if (!locale || !type || !id || !version) return null

  const reference =
    markdownReferences[id] ?? markdownReferences[markdownReferenceAliases[id] ?? '']
  if (!reference) return null

  return {
    ...reference,
    type: type as MarkdownTransclusion['type'],
    version: `v${version}`,
    markdown: selectMarkdownHeadingPath(reference.source, [
      { heading: reference.title, level: 1 },
      { heading: `v${version}`, level: 2 },
      { heading: locale, level: 3 },
    ]),
  }
}

export function getMarkdownTransclusionDisplayTitle(
  transclusion: MarkdownTransclusion | null,
  locale: AppLocale,
) {
  return getLocalisedMessage(
    transclusion?.displayTitleKey ?? 'reference_documentation',
    locale,
  )
}
