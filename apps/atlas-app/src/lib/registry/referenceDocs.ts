import overtureLocalisation from '../../../../../docs/datasets/sources/overture/localisation.md?raw'
import overtureDivisionHierarchy from '../../../../../docs/datasets/sources/overture/divisionHierarchy.md?raw'
import overtureDivisionTypeLevelMapping from '../../../../../docs/datasets/sources/overture/divisionType.md?raw'
import censtatdTerms from '../../../../../docs/datasets/sources/hkgov-censtatd/terms.md?raw'
import censtatdMeasureNaming from '../../../../../docs/datasets/sources/hkgov-censtatd/statisticMeasureNaming.md?raw'
import censtatdMeasureOfferings from '../../../../../docs/datasets/sources/hkgov-censtatd/statisticMeasureOfferings.md?raw'
import censtatdMeasureCurationManifest from '../../../../../docs/datasets/sources/hkgov-censtatd/statisticMeasureCurationManifest.md?raw'
import glossary from '../../../../../docs/glossary.md?raw'

import {
  getLocalisedMessage,
  type AppLocale,
  type MessageKey,
} from '../bits/internal/localisedMessages'
import { selectMarkdownHeadingPath } from './markdown'

export const markdownReferenceScheme = 'saanseoi:'

export type MarkdownTransclusion = {
  displayTitleKey: ReferenceMessageKey
  markdown: string
  title: string
  type: 'definition' | 'note'
  version: string
}

type MarkdownReferenceSource = {
  displayTitleKey: ReferenceMessageKey
  glossary?: boolean
  source: string
  title: string
}

export type MarkdownGlossaryEntry = MarkdownTransclusion & {
  id: string
}

type ReferenceMessageKey = Extract<MessageKey, `reference_${string}`>

const markdownReferences: Record<string, MarkdownReferenceSource> = {
  api: {
    title: 'API',
    displayTitleKey: 'reference_api',
    glossary: true,
    source: glossary,
  },
  'api-family': {
    title: 'API family',
    displayTitleKey: 'reference_api_family',
    glossary: true,
    source: glossary,
  },
  basemap: {
    title: 'Basemap',
    displayTitleKey: 'reference_basemap',
    glossary: true,
    source: glossary,
  },
  render: {
    title: 'Render',
    displayTitleKey: 'reference_render',
    glossary: true,
    source: glossary,
  },
  'map-style': {
    title: 'Map style',
    displayTitleKey: 'reference_map_style',
    glossary: true,
    source: glossary,
  },
  bun: {
    title: 'Bun',
    displayTitleKey: 'reference_bun',
    glossary: true,
    source: glossary,
  },
  vite: {
    title: 'Vite',
    displayTitleKey: 'reference_vite',
    glossary: true,
    source: glossary,
  },
  typescript: {
    title: 'TypeScript',
    displayTitleKey: 'reference_typescript',
    glossary: true,
    source: glossary,
  },
  packages: {
    title: 'Packages',
    displayTitleKey: 'reference_packages',
    glossary: true,
    source: glossary,
  },
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
    glossary: true,
    source: censtatdTerms,
  },
  'hkgov-csdi': {
    title: 'CSDI',
    displayTitleKey: 'reference_csdi',
    glossary: true,
    source: censtatdTerms,
  },
  'hkgov-censtatd-measure-naming': {
    title: 'Statistic measure naming',
    displayTitleKey: 'reference_censtatd_measure_naming',
    source: censtatdMeasureNaming,
  },
  'hkgov-censtatd-measure-offerings': {
    title: 'Statistic measure offerings',
    displayTitleKey: 'reference_censtatd_measure_offerings',
    source: censtatdMeasureOfferings,
  },
  'hkgov-censtatd-measure-curation-manifest': {
    title: 'Measure curation manifest',
    displayTitleKey: 'reference_censtatd_measure_curation_manifest',
    source: censtatdMeasureCurationManifest,
  },
  'catalogue-revision': {
    title: 'Catalogue revision',
    displayTitleKey: 'reference_catalogue_revision',
    glossary: true,
    source: glossary,
  },
  catalogue: {
    title: 'Catalogue',
    displayTitleKey: 'reference_catalogue',
    glossary: true,
    source: glossary,
  },
  cohort: {
    title: 'Cohort',
    displayTitleKey: 'reference_cohort',
    glossary: true,
    source: glossary,
  },
  collection: {
    title: 'Collection',
    displayTitleKey: 'reference_collection',
    glossary: true,
    source: glossary,
  },
  'companion-resource': {
    title: 'Companion resource',
    displayTitleKey: 'reference_companion_resource',
    glossary: true,
    source: glossary,
  },
  'composition-policy': {
    title: 'Composition policy',
    displayTitleKey: 'reference_composition_policy',
    glossary: true,
    source: glossary,
  },
  domain: {
    title: 'Domain',
    displayTitleKey: 'reference_domain',
    glossary: true,
    source: glossary,
  },
  'hong-kong-extract': {
    title: 'Hong Kong extract',
    displayTitleKey: 'reference_hong_kong_extract',
    source: glossary,
  },
  lineage: {
    title: 'Lineage',
    displayTitleKey: 'reference_lineage',
    glossary: true,
    source: glossary,
  },
  profile: {
    title: 'Profile',
    displayTitleKey: 'reference_profile',
    glossary: true,
    source: glossary,
  },
  release: {
    title: 'Release',
    displayTitleKey: 'reference_release',
    glossary: true,
    source: glossary,
  },
  revision: {
    title: 'Revision',
    displayTitleKey: 'reference_revision',
    glossary: true,
    source: glossary,
  },
  'release-set': {
    title: 'Release set',
    displayTitleKey: 'reference_release_set',
    glossary: true,
    source: glossary,
  },
  snapshot: {
    title: 'Snapshot',
    displayTitleKey: 'reference_snapshot',
    glossary: true,
    source: glossary,
  },
  'source-release': {
    title: 'Source release',
    displayTitleKey: 'reference_source_release',
    glossary: true,
    source: glossary,
  },
  variant: {
    title: 'Variant',
    displayTitleKey: 'reference_variant',
    glossary: true,
    source: glossary,
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

  return getMarkdownReference({
    id,
    locale,
    type: type as MarkdownTransclusion['type'],
    version: `v${version}`,
  })
}

export function getMarkdownGlossaryEntries(locale: AppLocale): MarkdownGlossaryEntry[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base' })

  return Object.entries(markdownReferences)
    .filter(([, reference]) => reference.glossary)
    .map(([id]) =>
      getMarkdownReference({ id, locale, type: 'definition', version: 'v1' }),
    )
    .filter((entry): entry is MarkdownGlossaryEntry => entry !== null)
    .sort((left, right) =>
      collator.compare(
        getLocalisedMessage(left.displayTitleKey, locale),
        getLocalisedMessage(right.displayTitleKey, locale),
      ),
    )
}

function getMarkdownReference({
  id,
  locale,
  type,
  version,
}: {
  id: string
  locale: string
  type: MarkdownTransclusion['type']
  version: string
}): MarkdownGlossaryEntry | null {
  const reference =
    markdownReferences[id] ?? markdownReferences[markdownReferenceAliases[id] ?? '']
  if (!reference) return null

  return {
    ...reference,
    id,
    type,
    version,
    markdown: selectMarkdownHeadingPath(reference.source, [
      { heading: reference.title, level: 1 },
      { heading: version, level: 2 },
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
