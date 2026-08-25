import type { AppLocale, MessageKey } from '#lib/bits/internal/i18n.js'
import type {
  ReleaseStatsCopy,
  ReleaseStatsDistrictArea,
} from '#lib/bits/pages/docs/components/releaseStats/index.js'

export type SourceRecordFamily = 'divisions'

export type SourceReleaseTab =
  | 'notes'
  | 'schema'
  | 'samples'
  | 'releases'
  | 'assembly'
  | 'stats'
  | 'audit'

const sourceReleaseTabs: readonly SourceReleaseTab[] = [
  'notes',
  'schema',
  'samples',
  'releases',
  'assembly',
  'stats',
  'audit',
]

const sourceRecordResourceTypes = new Set([
  'division',
  'divisionArea',
  'divisionBoundary',
])

/**
 * Public raw-record storage is currently available for Division-family sources.
 * Keep this explicit so a source page never suggests records for a family whose
 * endpoint has no source-record catalogue.
 */
export function getSourceRecordFamily(
  resourceTypes: readonly string[],
): SourceRecordFamily | null {
  return resourceTypes.some(type => sourceRecordResourceTypes.has(type))
    ? 'divisions'
    : null
}

type SourceReleaseUrl = {
  searchParams: {
    get(name: string): string | null
  }
}

export function getSourceReleaseTabFromUrl(url: SourceReleaseUrl): SourceReleaseTab {
  const tab = url.searchParams.get('tab')
  return tab && sourceReleaseTabs.includes(tab as SourceReleaseTab)
    ? (tab as SourceReleaseTab)
    : 'notes'
}

export function humaniseStat(value: string | null | undefined) {
  if (!value) return 'Unspecified'

  return value.trim().toLowerCase() === 'sar'
    ? 'SAR'
    : value
        .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
        .replaceAll(/[_-]/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase())
}

export function isDistrictGeometry(
  geometry: unknown,
): geometry is ReleaseStatsDistrictArea['geometry'] {
  return Boolean(
    geometry &&
      typeof geometry === 'object' &&
      'type' in geometry &&
      'coordinates' in geometry &&
      ((geometry as { type?: unknown }).type === 'Polygon' ||
        (geometry as { type?: unknown }).type === 'MultiPolygon'),
  )
}

type DistrictCoverageRow = {
  divisionId: string
  geometry: unknown
  name: string | null
}

export function selectDistrictAreas(
  rows: readonly DistrictCoverageRow[],
): ReleaseStatsDistrictArea[] {
  return rows.flatMap(row =>
    isDistrictGeometry(row.geometry)
      ? [
          {
            divisionId: row.divisionId,
            geometry: row.geometry,
            name: row.name,
          },
        ]
      : [],
  )
}

type SourceReleaseVersion = {
  code: string
  sourceVersion?: string | null
}

export function buildSourceReleaseVersionLinks({
  datasetCode,
  versions,
  activeTab,
  showNoteDiff,
}: {
  datasetCode: string
  versions: readonly SourceReleaseVersion[]
  activeTab: SourceReleaseTab
  showNoteDiff: boolean
}) {
  return versions.map((item, index) => {
    const searchParams = new URLSearchParams()
    if (activeTab !== 'notes') searchParams.set('tab', activeTab)
    if (activeTab === 'notes' && showNoteDiff && index < versions.length - 1)
      searchParams.set('view', 'diff')

    const search = searchParams.toString()
    return {
      code: item.code,
      href: `/sources/${datasetCode}/${item.code}${search ? `?${search}` : ''}`,
      label: item.sourceVersion || item.code,
    }
  })
}

type SourceReleaseMessages = { [K in MessageKey]: () => string }

export function buildSourceReleaseStatsPresentation(
  locale: AppLocale,
  messages: SourceReleaseMessages,
): ReleaseStatsCopy {
  return {
    labels: {
      added: messages.source_added(),
      changed: messages.source_changed(),
      removed: messages.source_removed(),
      unchanged: messages.source_unchanged(),
      dataset: messages.source_dataset(),
      records: messages.source_records(),
      overview: messages.source_change_summary(),
      changeSummary: messages.source_change_summary(),
      comparisonBaseline: messages.source_comparison_baseline(),
      comparisonPrevious: messages.source_comparison_previous(),
      coverage: messages.source_coverage(),
      completeness: messages.source_completeness(),
      namesByLocale: messages.source_names_by_locale(),
      provided: messages.source_locale_provided(),
      inferred: messages.source_locale_inferred(),
      aiTranslated: messages.source_locale_ai_translated(),
      humanTranslated: messages.source_locale_human_translated(),
      localeLegend: 'Provided, inferred, AI-translated, and human-translated locales',
      completenessInfo: messages.source_completeness_info(),
      completenessInfoDescription: messages.source_completeness_info_description(),
      addressComponents: 'Address components',
      changeDistribution: messages.source_change_distribution(),
      recordsByType: messages.source_records_by_type(),
      recordsByGeometryClass: messages.source_records_by_geometry_class(),
      typeLegend: 'Added, changed, removed, and unchanged records',
      changeDistributionInfo: messages.source_change_distribution_info(),
      changeDistributionInfoDescription:
        messages.source_change_distribution_info_description(),
      processingActions: messages.source_processing_actions(),
      processingActionsInfo: messages.source_processing_actions_info(),
      processingActionsInfoDescription:
        messages.source_processing_actions_info_description(),
      qualityChecks: messages.source_quality_checks(),
      qualityInfo: messages.source_quality_info(),
      qualityInfoDescription: messages.source_quality_info_description(),
      qualityNone: messages.source_quality_none(),
      noStats: messages.source_stats_unavailable(),
      stats: messages.source_tab_stats(),
      recordsByDistrict: 'Records by district',
      district: 'District',
      geometry: messages.source_geometry(),
      geometryByDistrict: messages.source_geometry_by_district(),
      geometryInfo: messages.source_geometry_info(),
      geometryInfoDescription: messages.source_geometry_info_description(),
      geometryFeatures: messages.source_geometry_features(),
      geometryPolygons: messages.source_geometry_polygons(),
      geometryArea: messages.source_geometry_area(),
      geometryBoundarySegments: messages.source_geometry_boundary_segments(),
      geometryBoundaryLength: messages.source_geometry_boundary_length(),
      geometryUnofficial: messages.source_geometry_unofficial(),
      notApplicable: messages.source_not_applicable(),
    },
    localeName: code =>
      ({
        en: messages.source_locale_en(),
        'zh-hant': messages.source_locale_zh_hant(),
        'zh-hans': messages.source_locale_zh_hans(),
      })[code] ?? code,
    statLabel: humaniseStat,
    districtFallback: districtId =>
      locale === 'zh-Hant'
        ? `地區 ${districtId}`
        : locale === 'zh-Hans'
          ? `地区 ${districtId}`
          : `District ${districtId}`,
    processingAction: code => {
      const [rawMode, ...rawAction] = code.split(':')
      return {
        issue: humaniseStat(rawAction.join(':')),
        outcome: 'Processed',
        mode: rawMode === 'manual' ? 'Manual' : 'Automatic',
      }
    },
    qualityDescription: humaniseStat,
  }
}
