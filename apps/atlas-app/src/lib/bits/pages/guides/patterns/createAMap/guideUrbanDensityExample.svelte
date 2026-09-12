<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideCallout from '../../components/shared/guideCallout.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'
import type { GuideCodeVisibleLine } from '../../components/shared/guideCodeBlock.svelte'
import GuideLlmPromptCard, {
  type GuideLlmPromptReference,
} from '../../components/shared/guideLlmPromptCard.svelte'
import GuideParagraph from '../../components/shared/guideParagraph.svelte'
import GuidePreviewCodeBlock from '../../components/shared/guidePreviewCodeBlock.svelte'
import GuideSubSectionBody from '../../components/shared/guideSubSectionBody.svelte'
import GuideSubSectionHeader from '../../components/shared/guideSubSectionHeader.svelte'
import GuideTextSubHeader from '../../components/shared/guideTextSubHeader.svelte'
import GuideVisibleCodeCallouts from '../../components/createAMap/guideVisibleCodeCallouts.svelte'

import GuideUrbanDensityDivisionsPreview from './guideUrbanDensityDivisionsPreview.svelte'
import GuideUrbanDensityCensusAreasPreview from './guideUrbanDensityCensusAreasPreview.svelte'
import GuideUrbanDensityLiveableDensityPreview from './guideUrbanDensityLiveableDensityPreview.svelte'
import GuideUrbanDensityLiveableLandInputs from './guideUrbanDensityLiveableLandInputs.svelte'
import GuideUrbanDensityLiveableResultPreview from './guideUrbanDensityLiveableResultPreview.svelte'
import GuideUrbanDensityLiveableAnalysisPreview from './guideUrbanDensityLiveableAnalysisPreview.svelte'
import GuideUrbanDensityResourceDownload from './guideUrbanDensityResourceDownload.svelte'
import GuideUrbanDensityPreview from './guideUrbanDensityPreview.svelte'
import GuideUrbanDensityMapPreview from './guideUrbanDensityMapPreview.svelte'
import GuideUrbanDensityStatsPreview from './guideUrbanDensityStatsPreview.svelte'

type Props = {
  editorIcon?: string
  hasNonHongKongBasemap?: boolean
  hongKongBasemapNote?: string
  mapReadyCode: string
  mapAppearance: 'light' | 'dark'
  mapPreviewLabel: string
  renderer: 'leaflet' | 'mapbox' | 'maplibre'
  styleUrl: string
  terminalProjectPath: string
  tilejsonUrl: string
  mapCode: string
  mapDisplayCode: string
  calculationCode: string
  calculationDisplayCode: string
  geometryWorkerCode: string
  setupZ14TileFetcherCode: string
  setupZ14TileFetcherCss: string
  setupZ14TileFetcherDisplayCode: string
  collectNonLiveableLandCode: string
  collectNonLiveableLandDisplayCode: string
  liveableAreaCode: string
  liveableAreaCss: string
  liveableAreaDisplayCode: string
  liveableAreaMapCode: string
  liveableAreaMapDisplayCode: string
  liveableMetricsCode: string
  liveableMetricsDisplayCode: string
  llmGuidanceEnabled?: boolean
  llmPromptIcon?: string
  llmPrompts?: {
    calculateDensity: string
    calculateLiveableArea: string
    fetchStats: string
    finaliseMap: string
    findUnliveableLand: string
    addStatsToMap: string
  }
  llmReferences?: {
    calculation: GuideLlmPromptReference[]
    final: GuideLlmPromptReference[]
    liveable: GuideLlmPromptReference[]
    map: GuideLlmPromptReference[]
    metrics: GuideLlmPromptReference[]
    stats: GuideLlmPromptReference[]
  }
  metricsCode: string
  metricsDisplayCode: string
  metricsCss: string
  metricsCssDisplayCode: string
  statsCode: string
  statsDisplayCode: string
  showPublishLink?: boolean
  turfInstallCode: string
  turfInstallOutput: string
}

let {
  editorIcon,
  hasNonHongKongBasemap = false,
  hongKongBasemapNote,
  mapReadyCode,
  mapAppearance,
  mapPreviewLabel,
  renderer,
  styleUrl,
  terminalProjectPath,
  tilejsonUrl,
  mapCode,
  mapDisplayCode,
  calculationCode,
  calculationDisplayCode,
  geometryWorkerCode,
  setupZ14TileFetcherCode,
  setupZ14TileFetcherCss,
  setupZ14TileFetcherDisplayCode,
  collectNonLiveableLandCode,
  collectNonLiveableLandDisplayCode,
  liveableAreaCode,
  liveableAreaCss,
  liveableAreaDisplayCode,
  liveableAreaMapCode,
  liveableAreaMapDisplayCode,
  liveableMetricsCode,
  liveableMetricsDisplayCode,
  llmGuidanceEnabled = false,
  llmPromptIcon,
  llmPrompts = {
    calculateDensity: '',
    calculateLiveableArea: '',
    fetchStats: '',
    finaliseMap: '',
    findUnliveableLand: '',
    addStatsToMap: '',
  },
  llmReferences = {
    calculation: [],
    final: [],
    liveable: [],
    map: [],
    metrics: [],
    stats: [],
  },
  metricsCode,
  metricsDisplayCode,
  metricsCss,
  metricsCssDisplayCode,
  statsCode,
  statsDisplayCode,
  showPublishLink = false,
  turfInstallCode,
  turfInstallOutput,
}: Props = $props()

const renumberGuideTitle = (title: string, number: number) =>
  title.replace(/^\d+\.\s*/, `${number}. `)

const editorPathSeparator = $derived(
  terminalProjectPath.includes('\\') ? '\\' : undefined,
)
const landAnalysisFilePath = $derived(
  `src${editorPathSeparator ?? '/'}land-analysis.json.gz`,
)
let statsVisibleLines = $state<GuideCodeVisibleLine[]>([])
let calculationVisibleLines = $state<GuideCodeVisibleLine[]>([])
let tileFetcherVisibleLines = $state<GuideCodeVisibleLine[]>([])

const mapReadyComments = [
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_map_ready(),
    spacerAfter: true,
  },
]

const statsComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_stats()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_stats(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_stats_comment_data_shape(),
  },
  {
    line: 12,
    text: m.guide_data_urban_density_stats_comment_saved_result_path(),
    html: true,
  },
  {
    line: 16,
    text: m.guide_data_urban_density_stats_comment_gzip(),
  },
  {
    line: 26,
    text: m.guide_data_urban_density_stats_comment_population(),
  },
  {
    line: 27,
    text: m.guide_data_urban_density_stats_comment_land_area(),
  },
  {
    line: 28,
    text: m.guide_data_urban_density_stats_comment_districts(),
  },
  {
    line: 29,
    text: m.guide_data_urban_density_stats_comment_metrics(),
  },
  {
    line: 25,
    text: m.guide_data_urban_density_stats_comment_api_base_url(),
  },
  {
    line: 32,
    text: m.guide_data_urban_density_stats_comment_endpoint(),
  },
  {
    line: 33,
    text: m.guide_data_urban_density_stats_comment_dataset(),
  },
  {
    line: 35,
    text: m.guide_data_urban_density_stats_comment_helper(),
  },
  {
    line: 36,
    text: m.guide_data_urban_density_stats_comment_url(),
  },
  {
    line: 37,
    text: m.guide_data_urban_density_stats_comment_cohort(),
  },
  {
    line: 38,
    text: m.guide_data_urban_density_stats_comment_dataset_filter(),
  },
  {
    line: 39,
    text: m.guide_data_urban_density_stats_comment_field(),
  },
  {
    line: 40,
    text: m.guide_data_urban_density_stats_comment_reference_period(),
  },
  {
    line: 42,
    text: m.guide_data_urban_density_stats_comment_request(),
  },
  {
    line: 43,
    text: m.guide_data_urban_density_stats_comment_values(),
  },
  {
    line: 49,
    text: m.guide_data_urban_density_stats_comment_assign_fields(),
  },
]

const mapComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_land_use()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_land_use(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 1, text: m.guide_data_urban_density_map_comment_kinds() },
  { line: 5, text: m.guide_data_urban_density_map_comment_ready() },
  { line: 7, text: m.guide_data_urban_density_map_comment_saved_result() },
  { line: 8, text: m.guide_data_urban_density_map_comment_remove_metrics() },
  { line: 10, text: m.guide_data_urban_density_map_comment_first_label() },
  { line: 12, text: m.guide_data_urban_density_map_comment_completed_source() },
  { line: 14, text: m.guide_data_urban_density_map_comment_completed_source_empty() },
  { line: 17, text: m.guide_data_urban_density_map_comment_layer() },
  { line: 18, text: m.guide_data_urban_density_map_comment_id() },
  { line: 20, text: m.guide_data_urban_density_map_comment_source() },
  { line: 22, text: m.guide_data_urban_density_map_comment_filter() },
  { line: 23, text: m.guide_data_urban_density_map_comment_paint() },
  { line: 26, text: m.guide_data_urban_density_map_comment_outline() },
]

const metricsComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_metrics()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_metrics(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 2, text: m.guide_data_urban_density_metrics_comment_section() },
  { line: 3, text: m.guide_data_urban_density_metrics_comment_identifier() },
  { line: 4, text: m.guide_data_urban_density_metrics_comment_label() },
  { line: 5, text: m.guide_data_urban_density_metrics_comment_cards() },
  { line: 12, text: m.guide_data_urban_density_metrics_comment_append() },
]

const metricsCssComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_metrics_css()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_metrics_css(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 1, text: m.guide_data_urban_density_metrics_css_comment_bar() },
  { line: 2, text: m.guide_data_urban_density_metrics_css_comment_position() },
  { line: 3, text: m.guide_data_urban_density_metrics_css_comment_grid() },
  { line: 4, text: m.guide_data_urban_density_metrics_css_comment_font() },
  { line: 6, text: m.guide_data_urban_density_metrics_css_comment_card() },
  { line: 7, text: m.guide_data_urban_density_metrics_css_comment_second_card() },
  { line: 8, text: m.guide_data_urban_density_metrics_css_comment_third_card() },
  { line: 9, text: m.guide_data_urban_density_metrics_css_comment_label() },
  { line: 10, text: m.guide_data_urban_density_metrics_css_comment_hong_kong_island() },
  { line: 11, text: m.guide_data_urban_density_metrics_css_comment_kowloon() },
  { line: 12, text: m.guide_data_urban_density_metrics_css_comment_new_territories() },
  { line: 13, text: m.guide_data_urban_density_metrics_css_comment_value() },
  { line: 14, text: m.guide_data_urban_density_metrics_css_comment_detail() },
  { line: 15, text: m.guide_data_urban_density_metrics_css_comment_supporting_copy() },
  { line: 16, text: m.guide_data_urban_density_metrics_css_comment_supporting_value() },
  { line: 17, text: m.guide_data_urban_density_metrics_css_comment_secondary_stats() },
  { line: 18, text: m.guide_data_urban_density_metrics_css_comment_animation() },
  { line: 19, text: m.guide_data_urban_density_metrics_css_comment_reduced_motion() },
  { line: 21, text: m.guide_data_urban_density_metrics_css_comment_mobile() },
  { line: 22, text: m.guide_data_urban_density_metrics_css_comment_mobile_spacing() },
  { line: 30, text: m.guide_data_urban_density_metrics_css_comment_map_header() },
  { line: 35, text: m.guide_data_urban_density_metrics_css_comment_map_title() },
  { line: 40, text: m.guide_data_urban_density_metrics_css_comment_map_index() },
]

const calculationComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_calculation()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_calculation(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_calculation_comment_data_shape(),
  },
  { line: 10, text: m.guide_data_urban_density_saved_result_missing() },
  { line: 11, text: m.guide_data_urban_density_calculation_comment_divisions() },
  { line: 13, text: m.guide_data_urban_density_calculation_comment_level() },
  {
    line: 14,
    text: m.guide_data_urban_density_calculation_comment_hierarchy(),
  },
  {
    line: 14,
    text: m.guide_data_urban_density_calculation_comment_hierarchy_geometry(),
  },
  { line: 15, text: m.guide_data_urban_density_calculation_comment_request() },
  { line: 16, text: m.guide_data_urban_density_calculation_comment_error() },
  { line: 21, text: m.guide_data_urban_density_calculation_comment_response() },
  { line: 23, text: m.guide_data_urban_density_calculation_comment_index() },
  { line: 23, text: m.guide_data_urban_density_calculation_comment_each_district() },
  { line: 24, text: m.guide_data_urban_density_calculation_comment_district_code() },
  { line: 25, text: m.guide_data_urban_density_calculation_comment_area() },
  { line: 26, text: m.guide_data_urban_density_calculation_comment_geometry() },
  { line: 36, text: m.guide_data_urban_density_calculation_comment_totals() },
  { line: 38, text: m.guide_data_urban_density_calculation_comment_start_total() },
  { line: 39, text: m.guide_data_urban_density_calculation_comment_population() },
  { line: 40, text: m.guide_data_urban_density_calculation_comment_land_area() },
  { line: 41, text: m.guide_data_urban_density_calculation_comment_save_total() },
  { line: 43, text: m.guide_data_urban_density_calculation_comment_empty_totals() },
  { line: 45, text: m.guide_data_urban_density_calculation_comment_metrics() },
  { line: 46, text: m.guide_data_urban_density_calculation_comment_details() },
  { line: 48, text: m.guide_data_urban_density_calculation_comment_density() },
]

const collectNonLiveableLandComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_collect_land()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_collect_land(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 1, text: m.guide_data_urban_density_collect_comment_yield() },
  {
    line: 2,
    text: m.guide_data_urban_density_liveable_area_comment_completed_exclusions(),
  },
  { line: 3, text: m.guide_data_urban_density_map_comment_completed_exclusions() },
  {
    line: 7,
    text: m.guide_data_urban_density_map_comment_completed_exclusions_outline(),
  },
  { line: 12, text: m.guide_data_urban_density_liveable_area_comment_each_district() },
  { line: 13, text: m.guide_data_urban_density_collect_comment_bounds() },
  { line: 14, text: m.guide_data_urban_density_collect_comment_district_tiles() },
  { line: 15, text: m.guide_data_urban_density_setup_comment_cache() },
  { line: 20, text: m.guide_data_urban_density_collect_comment_request() },
  { line: 22, text: m.guide_data_urban_density_collect_comment_process_features() },
  { line: 23, text: m.guide_data_urban_density_collect_comment_tile_outline() },
  { line: 24, text: m.guide_data_urban_density_setup_comment_tile_status() },
  { line: 26, text: m.guide_data_urban_density_collect_comment_add_features() },
  { line: 32, text: m.guide_data_urban_density_collect_comment_yield() },
  { line: 34, text: m.guide_data_urban_density_collect_comment_clear_tile_outline() },
  { line: 35, text: m.guide_data_urban_density_setup_comment_district_progress() },
  { line: 36, text: m.guide_data_urban_density_setup_comment_precision() },
  {
    line: 37,
    text: m.guide_data_urban_density_liveable_area_comment_clipped_exclusions(),
  },
  { line: 38, text: m.guide_data_urban_density_liveable_area_comment_each_part() },
  { line: 39, text: m.guide_data_urban_density_liveable_area_comment_clip() },
  { line: 40, text: m.guide_data_urban_density_liveable_area_comment_keep_clipped() },
  { line: 42, text: m.guide_data_urban_density_collect_comment_yield() },
  { line: 44, text: m.guide_data_urban_density_liveable_area_comment_excluded() },
  { line: 46, text: m.guide_data_urban_density_liveable_area_comment_union() },
  { line: 48, text: m.guide_data_urban_density_liveable_area_comment_record() },
  { line: 49, text: m.guide_data_urban_density_liveable_area_comment_completed() },
  { line: 54, text: m.guide_data_urban_density_collect_comment_clear_outlines() },
  { line: 56, text: m.guide_data_urban_density_collect_comment_hide_tile_layers() },
  { line: 59, text: m.guide_data_urban_density_collect_comment_stop_geometry_worker() },
  { line: 61, text: m.guide_data_urban_density_collect_comment_remove_progress() },
]

const setupZ14TileFetcherComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_tile_fetcher()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_tile_fetcher(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 1, text: m.guide_data_urban_density_collect_comment_vector_tile() },
  { line: 2, text: m.guide_data_urban_density_collect_comment_pbf() },
  { line: 3, text: m.guide_data_urban_density_liveable_area_comment_import() },
  { line: 6, text: m.guide_data_urban_density_collect_comment_zoom() },
  { line: 7, text: m.guide_data_urban_density_setup_comment_analysis_extent() },
  { line: 8, text: m.guide_data_urban_density_setup_comment_precision() },
  { line: 10, text: m.guide_data_urban_density_collect_comment_longitude() },
  { line: 11, text: m.guide_data_urban_density_collect_comment_latitude() },
  { line: 20, text: m.guide_data_urban_density_setup_comment_tile_edges() },
  { line: 25, text: m.guide_data_urban_density_setup_comment_map_polygon_positions() },
  { line: 32, text: m.guide_data_urban_density_setup_comment_coordinate_space() },
  { line: 39, text: m.guide_data_urban_density_setup_comment_from_analysis_position() },
  { line: 43, text: m.guide_data_urban_density_setup_comment_analysis_geometry() },
  { line: 47, text: m.guide_data_urban_density_setup_comment_tile_core() },
  { line: 54, text: m.guide_data_urban_density_collect_comment_envelope() },
  { line: 175, text: m.guide_data_urban_density_setup_comment_tile_outline() },
  { line: 191, text: m.guide_data_urban_density_setup_comment_tile_outline_source() },
  { line: 194, text: m.guide_data_urban_density_setup_comment_show_tile_outline() },
  { line: 68, text: m.guide_data_urban_density_setup_comment_non_liveable_kinds() },
  { line: 78, text: m.guide_data_urban_density_setup_comment_geos() },
  { line: 97, text: m.guide_data_urban_density_setup_comment_repair_overlay() },
  { line: 107, text: m.guide_data_urban_density_setup_comment_precision() },
  { line: 112, text: m.guide_data_urban_density_liveable_area_comment_union() },
  { line: 114, text: m.guide_data_urban_density_liveable_area_comment_clip() },
  { line: 116, text: m.guide_data_urban_density_setup_comment_tile_merge() },
  { line: 120, text: m.guide_data_urban_density_collect_comment_tile_url() },
  { line: 122, text: m.guide_data_urban_density_collect_comment_tile_url_for() },
  { line: 127, text: m.guide_data_urban_density_setup_comment_cache() },
  { line: 128, text: m.guide_data_urban_density_setup_comment_tile_decoder() },
  { line: 139, text: m.guide_data_urban_density_setup_comment_features() },
  { line: 143, text: m.guide_data_urban_density_collect_comment_filter() },
  { line: 145, text: m.guide_data_urban_density_setup_comment_geojson() },
  { line: 146, text: m.guide_data_urban_density_setup_comment_areas() },
  { line: 160, text: m.guide_data_urban_density_setup_comment_cache() },
  { line: 208, text: m.guide_data_urban_density_setup_comment_tile_grid() },
  { line: 220, text: m.guide_data_urban_density_collect_comment_district_tiles() },
  { line: 228, text: m.guide_data_urban_density_setup_comment_tile_status() },
  { line: 231, text: m.guide_data_urban_density_collect_comment_progress() },
  { line: 251, text: m.guide_data_urban_density_setup_comment_progress() },
  { line: 274, text: m.guide_data_urban_density_collect_comment_progress_wrapper() },
  { line: 280, text: m.guide_data_urban_density_setup_comment_district_progress() },
]

const setupZ14TileFetcherCssComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_tile_fetcher_css()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_tile_fetcher_css(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 1, text: m.guide_data_urban_density_tile_fetcher_css_comment_panel() },
  { line: 9, text: m.guide_data_urban_density_tile_fetcher_css_comment_font() },
  { line: 15, text: m.guide_data_urban_density_tile_fetcher_css_comment_phase() },
  { line: 19, text: m.guide_data_urban_density_tile_fetcher_css_comment_district() },
  {
    line: 23,
    text: m.guide_data_urban_density_tile_fetcher_css_comment_district_counts(),
  },
  { line: 27, text: m.guide_data_urban_density_tile_fetcher_css_comment_label() },
  { line: 30, text: m.guide_data_urban_density_tile_fetcher_css_comment_value() },
  { line: 33, text: m.guide_data_urban_density_tile_fetcher_css_comment_connector() },
  { line: 36, text: m.guide_data_urban_density_tile_fetcher_css_comment_bar() },
  {
    line: 44,
    text: m.guide_data_urban_density_tile_fetcher_css_comment_progress_glow(),
  },
]

const geometryWorkerComments = [
  {
    line: 1,
    text: m.guide_data_urban_density_geometry_worker_comment_header(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 1, text: m.guide_data_urban_density_geometry_worker_comment_turf() },
  { line: 2, text: m.guide_data_urban_density_geometry_worker_comment_geos() },
  { line: 6, text: m.guide_data_urban_density_geometry_worker_comment_messages() },
  { line: 10, text: m.guide_data_urban_density_geometry_worker_comment_ready() },
  { line: 11, text: m.guide_data_urban_density_geometry_worker_comment_polygonal() },
  { line: 25, text: m.guide_data_urban_density_geometry_worker_comment_repair() },
  { line: 34, text: m.guide_data_urban_density_geometry_worker_comment_snap() },
  { line: 56, text: m.guide_data_urban_density_geometry_worker_comment_union() },
  { line: 75, text: m.guide_data_urban_density_geometry_worker_comment_intersection() },
  { line: 93, text: m.guide_data_urban_density_geometry_worker_comment_listen() },
  { line: 95, text: m.guide_data_urban_density_geometry_worker_comment_choose() },
  { line: 100, text: m.guide_data_urban_density_geometry_worker_comment_reply() },
]

const liveableAreaComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_calculate_land()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_calculate_land(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  {
    line: 2,
    text: m.guide_data_urban_density_liveable_area_comment_analysis_result(),
  },
  {
    line: 4,
    text: m.guide_data_urban_density_liveable_area_comment_excluded_districts(),
  },
  { line: 6, text: m.guide_data_urban_density_liveable_area_comment_json() },
  { line: 7, text: m.guide_data_urban_density_liveable_area_comment_dialog() },
  {
    line: 8,
    text: m.guide_data_urban_density_liveable_area_comment_dialog_style(),
  },
  { line: 9, text: m.guide_data_urban_density_liveable_area_comment_result_title() },
  {
    line: 10,
    text: m.guide_data_urban_density_liveable_area_comment_result_title_content(),
  },
  {
    line: 11,
    text: m.guide_data_urban_density_liveable_area_comment_result_title_style(),
  },
  { line: 12, text: m.guide_data_urban_density_liveable_area_comment_download() },
  { line: 13, text: m.guide_data_urban_density_liveable_area_comment_download_label() },
  {
    line: 14,
    text: m.guide_data_urban_density_liveable_area_comment_download_style(),
  },
  { line: 15, text: m.guide_data_urban_density_liveable_area_comment_download_url() },
  { line: 16, text: m.guide_data_urban_density_liveable_area_comment_download_name() },
  {
    line: 17,
    text: m.guide_data_urban_density_liveable_area_comment_dialog_contents(),
  },
  { line: 18, text: m.guide_data_urban_density_liveable_area_comment_attach_dialog() },
  { line: 19, text: m.guide_data_urban_density_liveable_area_comment_show_dialog() },
  { line: 20, text: m.guide_data_urban_density_saved_result_keep() },
]

const liveableAreaCssComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_liveable_area_css()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_liveable_area_css(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 1, text: m.guide_data_urban_density_liveable_area_css_comment_dialog() },
  { line: 8, text: m.guide_data_urban_density_liveable_area_css_comment_shared() },
  { line: 11, text: m.guide_data_urban_density_liveable_area_css_comment_title() },
  { line: 15, text: m.guide_data_urban_density_liveable_area_css_comment_download() },
]

const liveableMetricsComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_liveable_metrics()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_liveable_metrics(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  {
    line: 2,
    text: m.guide_data_urban_density_liveable_metrics_comment_exclusions(),
  },
  { line: 3, text: m.guide_data_urban_density_liveable_metrics_comment_totals() },
  {
    line: 4,
    text: m.guide_data_urban_density_liveable_metrics_comment_district_details(),
  },
  { line: 5, text: m.guide_data_urban_density_liveable_metrics_comment_start() },
  { line: 6, text: m.guide_data_urban_density_liveable_metrics_comment_population() },
  { line: 7, text: m.guide_data_urban_density_liveable_metrics_comment_land_area() },
  {
    line: 8,
    text: m.guide_data_urban_density_liveable_metrics_comment_excluded_area(),
  },
  {
    line: 11,
    text: m.guide_data_urban_density_liveable_metrics_comment_save(),
  },
  { line: 15, text: m.guide_data_urban_density_liveable_metrics_comment_remaining() },
  { line: 19, text: m.guide_data_urban_density_liveable_metrics_comment_density() },
  { line: 20, text: m.guide_data_urban_density_liveable_metrics_comment_percentage() },
  { line: 25, text: m.guide_data_urban_density_liveable_metrics_comment_display() },
  { line: 34, text: m.guide_data_urban_density_liveable_metrics_comment_append() },
]

const liveableAreaMapComments = [
  {
    line: 1,
    text: `{ ${m.guide_data_urban_density_code_omitted_liveable_map()} }`,
    alwaysVisible: true,
  },
  {
    line: 1,
    text: m.guide_data_urban_density_code_header_liveable_map(),
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 1, text: m.guide_data_urban_density_liveable_map_comment_hide() },
  { line: 2, text: m.guide_data_urban_density_liveable_map_comment_order() },
  { line: 5, text: m.guide_data_urban_density_liveable_map_comment_liveable_source() },
  { line: 6, text: m.guide_data_urban_density_liveable_area_comment_layer() },
  { line: 8, text: m.guide_data_urban_density_liveable_map_comment_liveable_fill() },
  { line: 11, text: m.guide_data_urban_density_liveable_map_comment_excluded_source() },
  { line: 12, text: m.guide_data_urban_density_liveable_map_comment_excluded_fill() },
  { line: 15, text: m.guide_data_urban_density_liveable_map_comment_outline() },
  { line: 19, text: m.guide_data_urban_density_liveable_map_comment_header() },
  { line: 21, text: m.guide_data_urban_density_liveable_map_comment_title() },
  { line: 23, text: m.guide_data_urban_density_liveable_map_comment_legend() },
  { line: 33, text: m.guide_data_urban_density_liveable_map_comment_reveal() },
]
</script>

<section id="saanseoi-project" class="mt-10 scroll-mt-28">
  <header
    class="relative isolate left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[radial-gradient(circle_at_90%_5%,color-mix(in_srgb,var(--color-secondary)_22%,transparent),transparent_38%),linear-gradient(135deg,color-mix(in_srgb,var(--color-secondary-container)_78%,transparent),transparent_64%)] px-6 pt-15 pb-20 sm:px-9 sm:pt-17 sm:pb-22 min-[1000px]:left-[calc(50%+7.5rem)]"
  >
    <svg
      class="pointer-events-none absolute inset-x-0 top-0 z-0 h-10 w-full sm:h-12"
      viewBox="0 0 1440 48"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        fill="var(--color-background)"
        d="M0 0H1440V23c-57 1-84 10-143 6-62-4-83-16-144-13-63 3-84 17-144 15-60-2-87-15-146-17-59-2-89 14-147 16-60 2-92-8-147-13-58-5-87 10-144 10-60 0-84-14-143-14-58 0-87 16-144 17-54 1-85-7-128-4-40 3-72 6-108 4V0Z"
      />
    </svg>
    <div class="relative z-10 mx-auto max-w-4xl min-[1000px]:-translate-x-30">
      <span
        class="inline-flex -rotate-1 items-center gap-2 rounded-full border border-secondary/30 bg-surface-container-low px-3 py-1 font-body text-label-sm font-bold tracking-[0.08em] text-secondary uppercase shadow-sm"
      >
        <span class="size-1.5 rounded-full bg-secondary"></span>
        {@html m.guide_data_urban_density_badge()}
      </span>
      <h3
        class="mt-5 max-w-232 font-display text-[clamp(2.25rem,4.5vw,3.75rem)] font-bold leading-[0.92] tracking-[-0.045em] text-primary"
      >
        {@html m.guide_data_urban_density_title()}
      </h3>
      <GuideParagraph class="mt-5">
        {@html m.guide_data_urban_density_description()}
      </GuideParagraph>
    </div>
    <svg
      class="pointer-events-none absolute inset-x-0 bottom-0 h-14 w-full sm:h-16"
      viewBox="0 0 1440 96"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        fill="var(--color-background)"
        d="M0 49C70 44 106 29 163 33c63 4 88 24 148 25 65 1 91-22 148-30 52-8 77 4 118 20 49 19 82 31 136 20 56-11 83-39 137-37 50 2 77 24 121 31 54 9 86-8 126-25 45-19 77-17 119-2 53 19 73 40 129 42 52 2 81-17 95-28V96H0Z"
      />
    </svg>
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-px bg-background"
      aria-hidden="true"
    ></div>
  </header>
  {#if hongKongBasemapNote}
    <GuideCallout class="mt-6">
      <GuideParagraph>
        {hongKongBasemapNote}
      </GuideParagraph>
    </GuideCallout>
  {/if}
  <div class="mt-8 space-y-12">
    {#if !llmGuidanceEnabled}
      <section>
        <GuideSubSectionHeader
          id="project-pre-check"
          title={m.guide_data_urban_density_inputs_title()}
        />
        <GuideSubSectionBody
          content={hasNonHongKongBasemap
            ? m.guide_data_urban_density_inputs_hong_kong_description()
            : m.guide_data_urban_density_inputs_description()}
        >
          <GuidePreviewCodeBlock
            label={m.guide_data_urban_density_inputs_code()}
            code={mapReadyCode}
            comments={mapReadyComments}
            {editorIcon}
            pathSeparator={editorPathSeparator}
            language="typescript"
            copyLabel={m.common_copy()}
            copiedLabel={m.common_copied()}
            previewLabel={m.guide_code_block_preview()}
            showCodeLabel={m.guide_code_block_code()}
            expandable
            expandLabel={m.guide_code_block_expand()}
            closeLabel={m.common_close()}
          >
            {#snippet preview()}
              <GuideUrbanDensityMapPreview
                label={mapPreviewLabel}
                {renderer}
                showExclusions={false}
                {styleUrl}
                {tilejsonUrl}
              />
            {/snippet}
          </GuidePreviewCodeBlock>
        </GuideSubSectionBody>
      </section>
    {/if}
    <section>
      <GuideSubSectionHeader
        id="project-fetch-stats"
        title={renumberGuideTitle(m.guide_data_urban_density_calculate_title(), llmGuidanceEnabled ? 1 : 2)}
      />
      <GuideSubSectionBody
        content={llmGuidanceEnabled
          ? m.guide_data_urban_density_calculate_llm_description()
          : m.guide_data_urban_density_calculate_description()}
        contentClass="[&_code.guide-urban-density-level]:text-foreground"
      >
        {#if !llmGuidanceEnabled}
          <GuideParagraph
            class="mb-5 [&_code]:mx-0.75 [&_code]:inline-flex [&_code]:items-center [&_code]:rounded-sm [&_code]:border [&_code]:border-[#005142]! [&_code]:!bg-secondary-container/15 [&_code]:px-1 [&_code]:py-1 [&_code]:align-middle [&_code]:font-mono [&_code]:text-[0.78em]! [&_code]:font-semibold [&_code]:leading-none [&_code]:text-secondary dark:[&_code]:border-[#2f8f78]!"
          >
            {@html m.guide_data_urban_density_calculate_preview_explanation()}
          </GuideParagraph>
        {/if}
        {#if llmGuidanceEnabled}
          <div class="max-w-232">
            <GuideLlmPromptCard
              prompt={llmPrompts.fetchStats}
              promptIcon={llmPromptIcon}
              previewHeightMultiplier={2}
              references={llmReferences.stats}
              title={renumberGuideTitle(m.guide_data_urban_density_calculate_title(), 1)}
            >
              {#snippet preview()}
                <GuideUrbanDensityStatsPreview table />
              {/snippet}
            </GuideLlmPromptCard>
          </div>
        {:else}
          <div
            class="grid gap-6 font-mono min-[1000px]:-mr-56 min-[1000px]:w-[calc(100%+14rem)] min-[1000px]:grid-cols-[minmax(0,44.5rem)_minmax(0,1fr)] min-[1000px]:items-start"
          >
            <GuidePreviewCodeBlock
              label={m.guide_data_urban_density_calculate_code()}
              code={`\n${statsCode}`}
              displayCode={statsDisplayCode}
              comments={statsComments}
              {editorIcon}
              pathSeparator={editorPathSeparator}
              language="typescript"
              variant="editor"
              copyLabel={m.common_copy()}
              copiedLabel={m.common_copied()}
              previewLabel={m.guide_code_block_preview()}
              showCodeLabel={m.guide_code_block_code()}
              expandable
              expandLabel={m.guide_code_block_expand()}
              closeLabel={m.common_close()}
              onVisibleLinesChange={lines => (statsVisibleLines = lines)}
            >
              {#snippet preview()}
                <GuideUrbanDensityStatsPreview />
              {/snippet}
            </GuidePreviewCodeBlock>
            <GuideVisibleCodeCallouts
              visibleLines={statsVisibleLines}
              callouts={[
                {
                  line: 28,
                  label: m.guide_data_urban_density_statistics_callout_label(),
                  title: m.guide_data_urban_density_statistics_callout_title(),
                  description: m.guide_data_urban_density_calculate_explore_statistics(),
                },
              ]}
            />
          </div>
        {/if}
        <div class="mt-8">
          <GuideSubSectionHeader
            id="project-calc-pop-density"
            title={renumberGuideTitle(m.guide_data_urban_density_results_title(), llmGuidanceEnabled ? 2 : 3)}
          />
          <GuideSubSectionBody
            content={m.guide_data_urban_density_results_description()}
          >
            {#if !llmGuidanceEnabled}
              <GuideParagraph
                class="[&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code.guide-urban-density-metrics]:text-secondary"
              >
                {@html m.guide_data_urban_density_results_instruction()}
              </GuideParagraph>
            {/if}
            {#if llmGuidanceEnabled}
              <div class="max-w-232">
                <GuideLlmPromptCard
                  prompt={llmPrompts.calculateDensity}
                  promptIcon={llmPromptIcon}
                  previewHeightMultiplier={2}
                  references={llmReferences.calculation}
                  title={renumberGuideTitle(m.guide_data_urban_density_results_title(), 2)}
                >
                  {#snippet preview()}
                    <GuideUrbanDensityDivisionsPreview />
                  {/snippet}
                </GuideLlmPromptCard>
              </div>
            {:else}
              <div
                class="grid gap-6 font-mono min-[1000px]:-mr-56 min-[1000px]:w-[calc(100%+14rem)] min-[1000px]:grid-cols-[minmax(0,44.5rem)_minmax(0,1fr)] min-[1000px]:items-start"
              >
                <GuidePreviewCodeBlock
                  label={m.guide_data_urban_density_results_code()}
                  code={calculationCode}
                  displayCode={calculationDisplayCode}
                  comments={calculationComments}
                  {editorIcon}
                  pathSeparator={editorPathSeparator}
                  language="typescript"
                  copyLabel={m.common_copy()}
                  copiedLabel={m.common_copied()}
                  previewLabel={m.guide_code_block_preview()}
                  showCodeLabel={m.guide_code_block_code()}
                  expandable
                  expandLabel={m.guide_code_block_expand()}
                  closeLabel={m.common_close()}
                  onVisibleLinesChange={lines => (calculationVisibleLines = lines)}
                >
                  {#snippet preview()}
                    <GuideUrbanDensityDivisionsPreview />
                  {/snippet}
                </GuidePreviewCodeBlock>
                <GuideVisibleCodeCallouts
                  visibleLines={calculationVisibleLines}
                  callouts={[
                    {
                      line: 13,
                      label: m.guide_data_urban_density_calculation_level_callout_label(),
                      title: m.guide_data_urban_density_calculation_level_callout_title(),
                      description: m.guide_data_urban_density_calculation_comment_level_explainer(),
                    },
                    {
                      line: 30,
                      label: m.guide_data_urban_density_calculation_geojson_feature_callout_label(),
                      title: m.guide_data_urban_density_calculation_geojson_feature_callout_title(),
                      description: m.guide_data_urban_density_calculation_geojson_feature_callout_description(),
                    },
                  ]}
                />
              </div>
            {/if}
          </GuideSubSectionBody>
        </div>
        <GuideParagraph class="mt-8">
          {@html m.guide_data_urban_density_census_areas_map_description()}
        </GuideParagraph>
        <div
          class="mt-5 h-208 max-w-[80ch] overflow-hidden border border-[#596074] bg-[#10151a] shadow-card"
        >
          <GuideUrbanDensityCensusAreasPreview
            label={mapPreviewLabel}
            {renderer}
            {styleUrl}
            {tilejsonUrl}
          />
        </div>
        <div class="mt-8">
          <GuideSubSectionHeader
            id="project-add-stats-to-map"
            title={renumberGuideTitle(m.guide_data_urban_density_results_map_title(), llmGuidanceEnabled ? 3 : 4)}
          />
          {#if llmGuidanceEnabled}
            <GuideSubSectionBody
              content={m.guide_data_urban_density_results_map_description()}
            >
              <div class="mt-6 max-w-232">
                <GuideLlmPromptCard
                  prompt={llmPrompts.addStatsToMap}
                  promptIcon={llmPromptIcon}
                  references={llmReferences.metrics}
                  title={renumberGuideTitle(m.guide_data_urban_density_results_map_title(), 3)}
                >
                  {#snippet preview()}
                    <GuideUrbanDensityPreview
                      appearance={mapAppearance}
                      highlightAreas
                      label={mapPreviewLabel}
                      {renderer}
                      {styleUrl}
                      {tilejsonUrl}
                    />
                  {/snippet}
                </GuideLlmPromptCard>
              </div>
            </GuideSubSectionBody>
          {:else}
            <GuideSubSectionBody
              content={m.guide_data_urban_density_results_map_description()}
            >
              <GuideCodeBlock
                label={m.guide_data_urban_density_metrics_css()}
                code={metricsCss}
                displayCode={metricsCssDisplayCode}
                comments={metricsCssComments}
                {editorIcon}
                pathSeparator={editorPathSeparator}
                language="css"
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
                variant="editor"
              />
              <div class="mt-8">
                <h4 class="font-display text-title-lg font-bold text-primary">
                  {@html m.guide_data_urban_density_markup_title()}
                </h4>
                <GuideSubSectionBody
                  content={m.guide_data_urban_density_markup_description()}
                >
                  <GuidePreviewCodeBlock
                    minHeight="44rem"
                    label={m.guide_data_urban_density_results_map_code()}
                    code={metricsCode}
                    displayCode={metricsDisplayCode}
                    comments={metricsComments}
                    {editorIcon}
                    pathSeparator={editorPathSeparator}
                    language="typescript"
                    copyLabel={m.common_copy()}
                    copiedLabel={m.common_copied()}
                    previewLabel={m.guide_code_block_preview()}
                    showCodeLabel={m.guide_code_block_code()}
                    expandable
                    expandLabel={m.guide_code_block_expand()}
                    closeLabel={m.common_close()}
                  >
                    {#snippet preview()}
                      <GuideUrbanDensityPreview
                        appearance={mapAppearance}
                        label={mapPreviewLabel}
                        {renderer}
                        {styleUrl}
                        {tilejsonUrl}
                      />
                    {/snippet}
                  </GuidePreviewCodeBlock>
                </GuideSubSectionBody>
              </div>
            </GuideSubSectionBody>
          {/if}
        </div>
      </GuideSubSectionBody>
      <GuideParagraph class="mt-8">
        {@html m.guide_data_urban_density_density_reflection()}
      </GuideParagraph>
      {#if showPublishLink}
        <GuideSubSectionBody
          content={m.guide_data_urban_density_density_publishable()}
        />
      {/if}
    </section>
    <section>
      <GuideSubSectionHeader
        id="project-highlight-excl"
        title={renumberGuideTitle(m.guide_data_urban_density_map_title(), llmGuidanceEnabled ? 4 : 5)}
      />
      <GuideSubSectionBody content={m.guide_data_urban_density_map_description()}>
        {#if llmGuidanceEnabled}
          <div class="mt-6 max-w-232">
            <GuideLlmPromptCard
              prompt={llmPrompts.findUnliveableLand}
              promptIcon={llmPromptIcon}
              references={llmReferences.map}
              title={renumberGuideTitle(m.guide_data_urban_density_map_title(), 4)}
            >
              {#snippet preview()}
                <GuideUrbanDensityMapPreview
                  label={mapPreviewLabel}
                  {renderer}
                  {styleUrl}
                  {tilejsonUrl}
                />
              {/snippet}
            </GuideLlmPromptCard>
          </div>
        {:else}
          <GuideSubSectionBody
            content={m.guide_data_urban_density_exclusion_description()}
          >
            <GuidePreviewCodeBlock
              label={m.guide_data_urban_density_map_code()}
              code={mapCode}
              displayCode={mapDisplayCode}
              comments={mapComments}
              {editorIcon}
              pathSeparator={editorPathSeparator}
              language="typescript"
              copyLabel={m.common_copy()}
              copiedLabel={m.common_copied()}
              previewLabel={m.guide_code_block_preview()}
              showCodeLabel={m.guide_code_block_code()}
              expandable
              expandLabel={m.guide_code_block_expand()}
              closeLabel={m.common_close()}
            >
              {#snippet preview()}
                <GuideUrbanDensityMapPreview
                  label={mapPreviewLabel}
                  {renderer}
                  {styleUrl}
                  {tilejsonUrl}
                />
              {/snippet}
            </GuidePreviewCodeBlock>
            <GuideParagraph>
              {@html m.guide_data_urban_density_exclusion_detail_description()}
            </GuideParagraph>
          </GuideSubSectionBody>
        {/if}
        <div class="mt-8">
          <GuideSubSectionHeader
            id="project-calc-liveable-land"
            title={renumberGuideTitle(m.guide_data_urban_density_liveable_area_title(), llmGuidanceEnabled ? 5 : 6)}
          />
          {#if llmGuidanceEnabled}
            <GuideSubSectionBody>
              <GuideParagraph>
                {@html m.guide_data_urban_density_liveable_area_introduction()}
              </GuideParagraph>
              <aside
                class="min-w-0 max-w-full overflow-hidden rounded-sm bg-[repeating-linear-gradient(135deg,var(--secondary)_0_7px,var(--surface-container-high)_7px_14px)] p-3"
              >
                <div
                  class="bg-surface-container-low px-6 py-5 font-body text-body-lg leading-8 text-foreground-alt sm:px-10"
                >
                  <p>
                    {@html m.guide_data_urban_density_analysis_loading_warning_llm()}
                  </p>
                </div>
              </aside>
              <GuideUrbanDensityLiveableLandInputs
                description={m.guide_data_urban_density_install_description()}
                nonLiveableLand={m.guide_data_urban_density_install_non_liveable_land()}
                landClippedGeometry={m.guide_data_urban_density_install_land_clipped_geometry()}
                explanation={m.guide_data_urban_density_install_explanation()}
                tileZoomCalloutLabel={m.guide_data_urban_density_tile_zoom_callout_label()}
                tileZoomCalloutTitle={m.guide_data_urban_density_tile_zoom_callout_title()}
                tileZoomCalloutDescription={m.guide_data_urban_density_tile_zoom_callout_description()}
                approachSteps={[
                  m.guide_data_urban_density_liveable_approach_features(),
                  m.guide_data_urban_density_liveable_approach_download(),
                  m.guide_data_urban_density_liveable_approach_intersect(),
                  m.guide_data_urban_density_liveable_approach_measure(),
                  m.guide_data_urban_density_liveable_approach_sum(),
                  m.guide_data_urban_density_liveable_approach_subtract(),
                  m.guide_data_urban_density_liveable_approach_display(),
                ]}
              />
              <GuideTextSubHeader
                class="mt-8"
                title={m.guide_data_urban_density_geometry_repair_title()}
              />
              <GuideParagraph class="mt-3">
                {@html m.guide_data_urban_density_geometry_repair_llm_description()}
              </GuideParagraph>
              <div class="mt-6 max-w-232">
                <GuideLlmPromptCard
                  prompt={llmPrompts.calculateLiveableArea}
                  promptIcon={llmPromptIcon}
                  references={llmReferences.liveable}
                  title={renumberGuideTitle(m.guide_data_urban_density_liveable_area_title(), 5)}
                >
                  {#snippet preview()}
                    <GuideUrbanDensityLiveableAnalysisPreview
                      label={mapPreviewLabel}
                      {renderer}
                      {styleUrl}
                      {tilejsonUrl}
                    />
                  {/snippet}
                </GuideLlmPromptCard>
              </div>
            </GuideSubSectionBody>
          {:else}
            <GuideSubSectionBody>
              <GuideUrbanDensityLiveableLandInputs
                introduction={m.guide_data_urban_density_liveable_area_introduction()}
                description={m.guide_data_urban_density_install_description()}
                nonLiveableLand={m.guide_data_urban_density_install_non_liveable_land()}
                landClippedGeometry={m.guide_data_urban_density_install_land_clipped_geometry()}
                explanation={m.guide_data_urban_density_install_explanation()}
                geospatialToolsTitle={m.guide_data_urban_density_geospatial_tools_title()}
                tileZoomCalloutLabel={m.guide_data_urban_density_tile_zoom_callout_label()}
                tileZoomCalloutTitle={m.guide_data_urban_density_tile_zoom_callout_title()}
                tileZoomCalloutDescription={m.guide_data_urban_density_tile_zoom_callout_description()}
                turfExplanation={m.guide_data_urban_density_turf_explanation()}
                approachSteps={[
                m.guide_data_urban_density_liveable_approach_features(),
                m.guide_data_urban_density_liveable_approach_download(),
                m.guide_data_urban_density_liveable_approach_intersect(),
                m.guide_data_urban_density_liveable_approach_measure(),
                m.guide_data_urban_density_liveable_approach_sum(),
                m.guide_data_urban_density_liveable_approach_subtract(),
                m.guide_data_urban_density_liveable_approach_display(),
              ]}
              >
                {#snippet children()}
                  <GuideUrbanDensityResourceDownload
                    closeLabel={m.common_close()}
                    downloadInstructions={m.guide_data_urban_density_resource_download_instructions({
                    path: landAnalysisFilePath,
                  })}
                    downloadInstructionsTitle={m.guide_data_urban_density_resource_download_instructions_title()}
                    downloadLabel={m.guide_data_urban_density_resource_download_json_result()}
                    explanation={m.guide_data_urban_density_resource_explanation()}
                    skipLabel={m.guide_data_urban_density_resource_skip_section()}
                    title={m.guide_data_urban_density_resource_title()}
                  />
                {/snippet}
              </GuideUrbanDensityLiveableLandInputs>
              <GuideCodeBlock
                label={m.guide_setup_terminal_label({
                action: m.guide_data_urban_density_install_code(),
                path: terminalProjectPath,
              })}
                code={turfInstallCode}
                language="bash"
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
              />
              <GuideCodeBlock
                class="mt-3"
                label={m.guide_data_urban_density_install_output()}
                code={turfInstallOutput}
                language="text"
                copyable={false}
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
              />
              <GuideTextSubHeader
                class="mt-6"
                title={m.guide_data_urban_density_geometry_repair_title()}
              />
              <GuideParagraph class="mt-3">
                {@html m.guide_data_urban_density_geometry_worker_description()}
              </GuideParagraph>
              <GuideParagraph class="mt-3">
                {@html m.guide_data_urban_density_geometry_worker_instruction()}
              </GuideParagraph>
              <GuideCodeBlock
                label={m.guide_data_urban_density_geometry_worker_code()}
                code={geometryWorkerCode}
                comments={geometryWorkerComments}
                {editorIcon}
                pathSeparator={editorPathSeparator}
                language="typescript"
                variant="editor"
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
              />
            </GuideSubSectionBody>
            <GuideSubSectionBody
              content={m.guide_data_urban_density_setup_z14_tile_fetcher_description()}
            >
              <aside
                class="mt-6 min-w-0 max-w-full overflow-hidden rounded-sm bg-[repeating-linear-gradient(135deg,var(--secondary)_0_7px,var(--surface-container-high)_7px_14px)] p-3"
              >
                <div
                  class="bg-surface-container-low px-6 py-5 font-body text-body-lg leading-8 text-foreground-alt sm:px-10"
                >
                  <p>
                    {@html m.guide_data_urban_density_analysis_loading_warning()}
                  </p>
                </div>
              </aside>
              <div
                class="grid gap-6 min-[1000px]:-mr-56 min-[1000px]:w-[calc(100%+14rem)] min-[1000px]:grid-cols-[minmax(0,64ch)_minmax(0,1fr)] min-[1000px]:items-start min-[1000px]:gap-0"
              >
                <GuideCodeBlock
                  label={m.guide_data_urban_density_setup_z14_tile_fetcher_code()}
                  code={setupZ14TileFetcherCode}
                  displayCode={setupZ14TileFetcherDisplayCode}
                  comments={setupZ14TileFetcherComments}
                  {editorIcon}
                  pathSeparator={editorPathSeparator}
                  language="typescript"
                  variant="editor"
                  copyLabel={m.common_copy()}
                  copiedLabel={m.common_copied()}
                  onVisibleLinesChange={lines => (tileFetcherVisibleLines = lines)}
                />
                <GuideVisibleCodeCallouts
                  visibleLines={tileFetcherVisibleLines}
                  callouts={[
                  {
                    line: 10,
                    label: m.guide_data_urban_density_web_mercator_callout_label(),
                    title: m.guide_data_urban_density_web_mercator_callout_title(),
                    description: m.guide_data_urban_density_web_mercator_callout_description(),
                  },
                  {
                    line: 47,
                    label: m.guide_data_urban_density_tile_ownership_callout_label(),
                    title: m.guide_data_urban_density_tile_ownership_callout_title(),
                    description: m.guide_data_urban_density_tile_ownership_callout_description(),
                  },
                  {
                    line: 170,
                    label: m.guide_data_urban_density_tile_decoding_callout_label(),
                    title: m.guide_data_urban_density_tile_decoding_callout_title(),
                    description: m.guide_data_urban_density_tile_decoding_callout_description(),
                  },
                ]}
                />
              </div>
              <GuideParagraph class="mt-6">
                {m.guide_data_urban_density_setup_z14_tile_fetcher_css_description()}
              </GuideParagraph>
              <GuideCodeBlock
                label={m.guide_data_urban_density_setup_z14_tile_fetcher_css()}
                code={setupZ14TileFetcherCss}
                comments={setupZ14TileFetcherCssComments}
                {editorIcon}
                pathSeparator={editorPathSeparator}
                language="css"
                variant="editor"
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
              />
            </GuideSubSectionBody>
            <GuideSubSectionBody
              class="mt-6"
              content={m.guide_data_urban_density_collect_non_liveable_land_description()}
            >
              <div
                class="grid gap-6 min-[1000px]:-mr-56 min-[1000px]:w-[calc(100%+14rem)] min-[1000px]:grid-cols-[minmax(0,64ch)_minmax(0,1fr)] min-[1000px]:items-start"
              >
                <GuidePreviewCodeBlock
                  label={m.guide_data_urban_density_collect_non_liveable_land_code()}
                  code={collectNonLiveableLandCode}
                  displayCode={collectNonLiveableLandDisplayCode}
                  comments={collectNonLiveableLandComments}
                  {editorIcon}
                  pathSeparator={editorPathSeparator}
                  language="typescript"
                  copyLabel={m.common_copy()}
                  copiedLabel={m.common_copied()}
                  previewLabel={m.guide_code_block_preview()}
                  showCodeLabel={m.guide_code_block_code()}
                  expandable
                  expandLabel={m.guide_code_block_expand()}
                  closeLabel={m.common_close()}
                >
                  {#snippet preview()}
                    <GuideUrbanDensityLiveableAnalysisPreview
                      label={mapPreviewLabel}
                      {renderer}
                      {styleUrl}
                      {tilejsonUrl}
                    />
                  {/snippet}
                </GuidePreviewCodeBlock>
              </div>
            </GuideSubSectionBody>
            <GuideSubSectionBody>
              <div id="project-liveable-land-result" class="scroll-mt-24">
                <div class="space-y-6">
                  <GuideParagraph>
                    {@html m.guide_data_urban_density_liveable_area_css_description()}
                  </GuideParagraph>
                  <GuideCodeBlock
                    label={m.guide_data_urban_density_liveable_area_css()}
                    code={liveableAreaCss}
                    comments={liveableAreaCssComments}
                    {editorIcon}
                    pathSeparator={editorPathSeparator}
                    language="css"
                    variant="editor"
                    copyLabel={m.common_copy()}
                    copiedLabel={m.common_copied()}
                  />
                  <GuideParagraph>
                    {@html m.guide_data_urban_density_liveable_area_code_description()}
                  </GuideParagraph>
                  <GuidePreviewCodeBlock
                    label={m.guide_data_urban_density_liveable_area_code()}
                    code={liveableAreaCode}
                    displayCode={liveableAreaDisplayCode}
                    comments={liveableAreaComments}
                    {editorIcon}
                    pathSeparator={editorPathSeparator}
                    language="typescript"
                    copyLabel={m.common_copy()}
                    copiedLabel={m.common_copied()}
                    previewLabel={m.guide_code_block_preview()}
                    showCodeLabel={m.guide_code_block_code()}
                    expandable
                    expandLabel={m.guide_code_block_expand()}
                    closeLabel={m.common_close()}
                  >
                    {#snippet preview()}
                      <GuideUrbanDensityLiveableResultPreview
                        label={mapPreviewLabel}
                        {renderer}
                        {styleUrl}
                        {tilejsonUrl}
                      />
                    {/snippet}
                  </GuidePreviewCodeBlock>
                </div>
              </div>
              <GuideParagraph
                class="mt-8 [&_code]:rounded-sm [&_code]:bg-black [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-white"
              >
                {@html m.guide_data_urban_density_liveable_result_description()}
              </GuideParagraph>
            </GuideSubSectionBody>
          {/if}
        </div>
        <div class="mt-8">
          <GuideSubSectionHeader
            id="project-finalise-map"
            title={renumberGuideTitle(m.guide_data_urban_density_liveable_metrics_title(), llmGuidanceEnabled ? 6 : 7)}
          />
          {#if llmGuidanceEnabled}
            <GuideSubSectionBody
              content={m.guide_data_urban_density_liveable_metrics_llm_description()}
            >
              <div class="mt-6 max-w-232">
                <GuideLlmPromptCard
                  prompt={llmPrompts.finaliseMap}
                  promptIcon={llmPromptIcon}
                  references={llmReferences.final}
                  title={renumberGuideTitle(m.guide_data_urban_density_liveable_metrics_title(), 6)}
                >
                  {#snippet preview()}
                    <GuideUrbanDensityLiveableDensityPreview
                      label={mapPreviewLabel}
                      {renderer}
                      {styleUrl}
                      {tilejsonUrl}
                    />
                  {/snippet}
                </GuideLlmPromptCard>
              </div>
            </GuideSubSectionBody>
          {:else}
            <GuideSubSectionBody
              content={m.guide_data_urban_density_liveable_metrics_description()}
            >
              <GuideCodeBlock
                label={m.guide_data_urban_density_liveable_metrics_code()}
                code={liveableMetricsCode}
                displayCode={liveableMetricsDisplayCode}
                comments={liveableMetricsComments}
                {editorIcon}
                pathSeparator={editorPathSeparator}
                language="typescript"
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
                variant="editor"
              />
              <GuideParagraph class="mt-8">
                {@html m.guide_data_urban_density_liveable_area_map_description()}
              </GuideParagraph>
              <GuidePreviewCodeBlock
                label={m.guide_data_urban_density_liveable_area_map_code()}
                code={liveableAreaMapCode}
                displayCode={liveableAreaMapDisplayCode}
                comments={liveableAreaMapComments}
                {editorIcon}
                pathSeparator={editorPathSeparator}
                language="typescript"
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
                previewLabel={m.guide_code_block_preview()}
                showCodeLabel={m.guide_code_block_code()}
                expandable
                expandLabel={m.guide_code_block_expand()}
                closeLabel={m.common_close()}
              >
                {#snippet preview()}
                  <GuideUrbanDensityLiveableDensityPreview
                    label={mapPreviewLabel}
                    {renderer}
                    {styleUrl}
                    {tilejsonUrl}
                  />
                {/snippet}
              </GuidePreviewCodeBlock>
            </GuideSubSectionBody>
          {/if}
        </div>
      </GuideSubSectionBody>
      <GuideParagraph
        class="mt-8 [&_code]:rounded-sm [&_code]:bg-black [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-white"
      >
        {@html m.guide_data_urban_density_conclusion_summary()}
      </GuideParagraph>
    </section>
  </div>
</section>
