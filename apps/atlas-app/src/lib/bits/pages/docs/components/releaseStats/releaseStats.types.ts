import type { MultiPolygon, Polygon } from 'geojson'

import type { ReleaseContentHeading } from '../releaseContentOutline'

export type ReleaseStat = {
  dimension?: string | null
  metric?: string | null
  metricUnit?: string | null
  value: number
  groupBy?: string | null
  groupValue?: string | null
}
export type ReleaseStatsDistrictArea = {
  divisionId: string
  geometry: Polygon | MultiPolygon
  name: string | null
}
export type ReleaseStatsCopy = {
  labels: ReleaseStatsLabels
  localeName: (locale: string) => string
  districtFallback: (districtId: string) => string
  statLabel: (value: string | null | undefined) => string
  processingAction: (code: string) => { issue: string; outcome: string; mode: string }
  qualityDescription?: (dimension: string) => string
}
export type ReleaseStatsLabels = {
  added: string
  changed: string
  removed: string
  unchanged: string
  dataset: string
  records: string
  overview: string
  changeSummary: string
  comparisonBaseline: string
  comparisonPrevious: string
  coverage: string
  completeness: string
  namesByLocale: string
  provided: string
  inferred: string
  localeLegend: string
  completenessInfo: string
  completenessInfoDescription: string
  addressComponents: string
  changeDistribution: string
  recordsByType: string
  recordsByGeometryClass: string
  typeLegend: string
  changeDistributionInfo: string
  changeDistributionInfoDescription: string
  processingActions: string
  processingActionsInfo: string
  processingActionsInfoDescription: string
  qualityChecks: string
  qualityInfo: string
  qualityInfoDescription: string
  qualityNone: string
  noStats: string
  stats: string
  recordsByDistrict: string
  district: string
  geometry: string
  geometryByDistrict: string
  geometryInfo: string
  geometryInfoDescription: string
  geometryFeatures: string
  geometryPolygons: string
  geometryArea: string
  geometryBoundarySegments: string
  geometryBoundaryLength: string
  notApplicable: string
}
export type ChurnMetricPresentation = {
  key: 'added' | 'changed' | 'removed' | 'unchanged'
  label: string
  value: number
  formattedValue: string
}
export type OverviewPresentation = {
  recordCount: string
  churn?: { baseline: boolean; metrics: ChurnMetricPresentation[] }
}
export type DistrictDistributionPresentation = {
  features: Array<{ id: string; geometry: Polygon | MultiPolygon; label: string }>
  values: Array<{ id: string; value: number }>
}
export type LocaleCoveragePresentation = {
  code: string
  label: string
  count: string
  coverage: number
  coverageLabel: string
  providedCoverage: number
}[]
export type ComponentCoveragePresentation = {
  label: string
  value: number
  formattedValue: string
}[]
export type TypeDistributionPresentation = {
  id: string
  title: string
  showChangeLegend: boolean
  rows: Array<{
    label: string
    count: string
    total: number
    added: number
    changed: number
    removed: number
    unchanged: number
  }>
  maxVolume: number
}
export type GeometryStatisticsPresentation = {
  id: string
  showFeatureCount: boolean
  rows: Array<{
    area?: string
    boundaryLength: string
    boundarySegmentCount: string
    districtId: string
    featureCount: string
    label: string
    polygonCount?: string
  }>
}
export type ProcessingPresentation = {
  issue: string
  outcome: string
  mode: string
  value: string
}[]
export type QualityPresentation = {
  issues: Array<{ label: string; description: string; value: string }>
}
export type GenericStatGroupPresentation = {
  id: string
  label: string
  rows: Array<{
    dimension: string
    metric: string
    groupValue: string
    unit: string
    value: string
  }>
}
export type ReleaseStatsPresentation = {
  headings: ReleaseContentHeading[]
  overview?: OverviewPresentation
  districtDistribution?: DistrictDistributionPresentation
  localeCoverage?: LocaleCoveragePresentation
  componentCoverage?: ComponentCoveragePresentation
  geometry?: GeometryStatisticsPresentation
  recordDistributions: TypeDistributionPresentation[]
  processing?: ProcessingPresentation
  quality?: QualityPresentation
  genericGroups: GenericStatGroupPresentation[]
}
