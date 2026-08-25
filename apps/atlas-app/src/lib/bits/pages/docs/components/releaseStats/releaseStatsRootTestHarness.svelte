<script lang="ts">
import Root from './components/releaseStatsRoot.svelte'
import type {
  ReleaseStat,
  ReleaseStatsCopy,
  ReleaseStatsDistrictArea,
  ReleaseStatsDistrictName,
  ReleaseStatsMeasure,
} from './releaseStats.types'

type Props = {
  stats?: ReleaseStat[]
  districtAreas?: ReleaseStatsDistrictArea[]
  districtNames?: ReleaseStatsDistrictName[]
  measures?: ReleaseStatsMeasure[]
}
let {
  stats = [],
  districtAreas = [],
  districtNames = [],
  measures = [],
}: Props = $props()
let activeHeadingId = $state<string | null>(null)
const presentation: ReleaseStatsCopy = {
  labels: {
    added: 'Added',
    changed: 'Changed',
    removed: 'Removed',
    unchanged: 'Unchanged',
    dataset: 'Dataset',
    records: 'records',
    overview: 'Overview',
    changeSummary: 'Change summary',
    comparisonBaseline: 'Baseline',
    comparisonPrevious: 'Previous release',
    coverage: 'Coverage',
    completeness: 'Completeness',
    namesByLocale: 'Names by locale',
    provided: 'Provided',
    inferred: 'Inferred',
    aiTranslated: 'AI translated',
    humanTranslated: 'Human translated',
    localeLegend: 'Locale legend',
    completenessInfo: 'Completeness info',
    completenessInfoDescription: 'Coverage details',
    addressComponents: 'Address components',
    changeDistribution: 'Change distribution',
    recordsByType: 'Records by type',
    recordsByGeometryClass: 'Records by geometry class',
    typeLegend: 'Type legend',
    changeDistributionInfo: 'Distribution info',
    changeDistributionInfoDescription: 'Distribution details',
    processingActions: 'Processing actions',
    processingActionsInfo: 'Processing info',
    processingActionsInfoDescription: 'Processing details',
    qualityChecks: 'Quality checks',
    qualityInfo: 'Quality info',
    qualityInfoDescription: 'Quality details',
    qualityNone: 'No issues',
    noStats: 'No stats',
    stats: 'Stats',
    recordsByDistrict: 'Records by district',
    district: 'District',
    geometry: 'Geometry',
    geometryByDistrict: 'By District',
    geometryInfo: 'About geometry measurements',
    geometryInfoDescription: 'Geometry details',
    geometryFeatures: 'Features',
    geometryPolygons: 'Polygons',
    geometryArea: 'Area',
    geometryBoundarySegments: 'Boundary segments',
    geometryBoundaryLength: 'Boundary length',
    geometryUnofficial: 'Unofficial',
    notApplicable: 'Not applicable',
  },
  localeName: value => value,
  statLabel: value => value ?? 'Unspecified',
  districtFallback: districtId => `District ${districtId}`,
  processingAction: code => ({ issue: code, outcome: 'Processed', mode: 'Automatic' }),
}
</script>

<Root
  {stats}
  {districtAreas}
  {districtNames}
  {measures}
  locale="en"
  {presentation}
  bind:activeHeadingId
/>
<output data-testid="active-heading">{activeHeadingId ?? ''}</output>
