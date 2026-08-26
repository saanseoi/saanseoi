import { m } from '@repo/i18n/messages'
import type { AppLocale } from '#lib/bits/internal/localisedMessages.js'
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

export function buildSourceReleaseStatsPresentation(
  locale: AppLocale,
): ReleaseStatsCopy {
  return {
    labels: {
      added: m.source_added(),
      changed: m.source_changed(),
      removed: m.source_removed(),
      unchanged: m.source_unchanged(),
      dataset: m.source_dataset(),
      records: m.source_records(),
      overview: m.source_change_summary(),
      changeSummary: m.source_change_summary(),
      comparisonBaseline: m.source_comparison_baseline(),
      comparisonPrevious: m.source_comparison_previous(),
      coverage: m.source_coverage(),
      completeness: m.source_completeness(),
      namesByLocale: m.source_names_by_locale(),
      provided: m.source_locale_provided(),
      inferred: m.source_locale_inferred(),
      aiTranslated: m.source_locale_ai_translated(),
      humanTranslated: m.source_locale_human_translated(),
      localeLegend: 'Provided, inferred, AI-translated, and human-translated locales',
      completenessInfo: m.source_completeness_info(),
      completenessInfoDescription: m.source_completeness_info_description(),
      addressComponents: 'Address components',
      changeDistribution: m.source_change_distribution(),
      recordsByType: m.source_records_by_type(),
      recordsByGeometryClass: m.source_records_by_geometry_class(),
      typeLegend: 'Added, changed, removed, and unchanged records',
      changeDistributionInfo: m.source_change_distribution_info(),
      changeDistributionInfoDescription:
        m.source_change_distribution_info_description(),
      processingActions: m.source_processing_actions(),
      processingActionsInfo: m.source_processing_actions_info(),
      processingActionsInfoDescription: m.source_processing_actions_info_description(),
      qualityChecks: m.source_quality_checks(),
      qualityInfo: m.source_quality_info(),
      qualityInfoDescription: m.source_quality_info_description(),
      qualityNone: m.source_quality_none(),
      noStats: m.source_stats_unavailable(),
      stats: m.source_tab_stats(),
      recordsByDistrict: 'Records by district',
      district: 'District',
      geometry: m.source_geometry(),
      geometryByDistrict: m.source_geometry_by_district(),
      geometryInfo: m.source_geometry_info(),
      geometryInfoDescription: m.source_geometry_info_description(),
      geometryFeatures: m.source_geometry_features(),
      geometryPolygons: m.source_geometry_polygons(),
      geometryArea: m.source_geometry_area(),
      geometryBoundarySegments: m.source_geometry_boundary_segments(),
      geometryBoundaryLength: m.source_geometry_boundary_length(),
      geometryUnofficial: m.source_geometry_unofficial(),
      notApplicable: m.source_not_applicable(),
    },
    localeName: code =>
      ({
        en: m.source_locale_en(),
        'zh-hant': m.source_locale_zh_hant(),
        'zh-hans': m.source_locale_zh_hans(),
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
