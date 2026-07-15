import overtureLocalisation from '../../../../../docs/datasets/sources/overture/localisation.md?raw'
import overtureAddressDivisionNormalization from '../../../../../docs/datasets/sources/overture/addressDivisions.md?raw'
import overtureDivisionHierarchy from '../../../../../docs/datasets/sources/overture/divisionHierarchy.md?raw'
import overtureDivisionTypeLevelMapping from '../../../../../docs/datasets/sources/overture/divisionType.md?raw'

import {
  getLocalizedMessage,
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

const markdownReferences = {
  'overture-division-locale-normalization': {
    title: 'locale',
    displayTitleKey: 'reference_locale_normalization',
    source: overtureLocalisation,
  },
  'overture-division-type-level-mapping': {
    title: 'division type and level',
    displayTitleKey: 'reference_division_type_level',
    source: overtureDivisionTypeLevelMapping,
  },
  'overture-division-hierarchy-normalization': {
    title: 'division hierarchy normalization',
    displayTitleKey: 'reference_division_hierarchy_normalization',
    source: overtureDivisionHierarchy,
  },
  'overture-address-division-normalization': {
    title: 'address division normalization',
    displayTitleKey: 'reference_address_division_normalization',
    source: overtureAddressDivisionNormalization,
  },
} satisfies Record<string, MarkdownReferenceSource>

export function getMarkdownTransclusion(href: string | null | undefined) {
  if (!href?.startsWith(markdownReferenceScheme)) return null

  const match =
    /^saanseoi:([a-z0-9-]+):(note|definition)\/([a-z0-9-]+)\/v([1-9]\d*)$/.exec(href)
  if (!match) return null

  const [, locale, type, id, version] = match
  const reference = markdownReferences[id as keyof typeof markdownReferences]
  if (!locale || !type || !reference || !version) return null

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
  return getLocalizedMessage(
    transclusion?.displayTitleKey ?? 'reference_documentation',
    locale,
  )
}
