<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideCallout from '../../components/shared/guideCallout.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'
import GuideParagraph from '../../components/shared/guideParagraph.svelte'
import GuidePreviewCodeBlock from '../../components/shared/guidePreviewCodeBlock.svelte'
import GuideSubSectionBody from '../../components/shared/guideSubSectionBody.svelte'
import GuideSubSectionHeader from '../../components/shared/guideSubSectionHeader.svelte'
import GuideInstructionCallout from '../../components/createAMap/guideInstructionCallout.svelte'

import GuideUrbanDensityDivisionsPreview from './guideUrbanDensityDivisionsPreview.svelte'
import GuideUrbanDensityCensusAreasPreview from './guideUrbanDensityCensusAreasPreview.svelte'
import GuideUrbanDensityLiveableDensityPreview from './guideUrbanDensityLiveableDensityPreview.svelte'
import GuideUrbanDensityLiveableLandInputs from './guideUrbanDensityLiveableLandInputs.svelte'
import GuideUrbanDensityLiveableResultPreview from './guideUrbanDensityLiveableResultPreview.svelte'
import GuideUrbanDensityLiveableAnalysisPreview from './guideUrbanDensityLiveableAnalysisPreview.svelte'
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
  metricsCode: string
  metricsDisplayCode: string
  metricsCss: string
  metricsCssDisplayCode: string
  statsCode: string
  statsDisplayCode: string
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
  metricsCode,
  metricsDisplayCode,
  metricsCss,
  metricsCssDisplayCode,
  statsCode,
  statsDisplayCode,
  turfInstallCode,
  turfInstallOutput,
}: Props = $props()

const editorPathSeparator = $derived(
  terminalProjectPath.includes('\\') ? '\\' : undefined,
)
const landAnalysisFilePath = $derived(
  `src${editorPathSeparator ?? '/'}land-analysis.json`,
)

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
    line: 14,
    text: m.guide_data_urban_density_stats_comment_saved_result_path(),
    html: true,
  },
  {
    line: 23,
    text: m.guide_data_urban_density_stats_comment_population(),
  },
  {
    line: 24,
    text: m.guide_data_urban_density_stats_comment_land_area(),
  },
  {
    line: 25,
    text: m.guide_data_urban_density_stats_comment_districts(),
  },
  {
    line: 26,
    text: m.guide_data_urban_density_stats_comment_metrics(),
  },
  {
    line: 22,
    text: m.guide_data_urban_density_stats_comment_api_base_url(),
  },
  {
    line: 29,
    text: m.guide_data_urban_density_stats_comment_endpoint(),
  },
  {
    line: 30,
    text: m.guide_data_urban_density_stats_comment_dataset(),
  },
  {
    line: 32,
    text: m.guide_data_urban_density_stats_comment_helper(),
  },
  {
    line: 33,
    text: m.guide_data_urban_density_stats_comment_url(),
  },
  {
    line: 34,
    text: m.guide_data_urban_density_stats_comment_cohort(),
  },
  {
    line: 35,
    text: m.guide_data_urban_density_stats_comment_dataset_filter(),
  },
  {
    line: 36,
    text: m.guide_data_urban_density_stats_comment_field(),
  },
  {
    line: 37,
    text: m.guide_data_urban_density_stats_comment_reference_period(),
  },
  {
    line: 39,
    text: m.guide_data_urban_density_stats_comment_request(),
  },
  {
    line: 40,
    text: m.guide_data_urban_density_stats_comment_values(),
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
  { line: 8, text: m.guide_data_urban_density_map_comment_saved_result() },
  { line: 12, text: m.guide_data_urban_density_map_comment_first_label() },
  { line: 14, text: m.guide_data_urban_density_map_comment_completed_source() },
  { line: 16, text: m.guide_data_urban_density_map_comment_completed_source_empty() },
  { line: 19, text: m.guide_data_urban_density_map_comment_layer() },
  { line: 20, text: m.guide_data_urban_density_map_comment_id() },
  { line: 22, text: m.guide_data_urban_density_map_comment_source() },
  { line: 24, text: m.guide_data_urban_density_map_comment_filter() },
  { line: 25, text: m.guide_data_urban_density_map_comment_paint() },
  { line: 28, text: m.guide_data_urban_density_map_comment_outline() },
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
  { line: 39, text: m.guide_data_urban_density_calculation_comment_start_total() },
  { line: 40, text: m.guide_data_urban_density_calculation_comment_population() },
  { line: 41, text: m.guide_data_urban_density_calculation_comment_land_area() },
  { line: 42, text: m.guide_data_urban_density_calculation_comment_save_total() },
  { line: 44, text: m.guide_data_urban_density_calculation_comment_empty_totals() },
  { line: 46, text: m.guide_data_urban_density_calculation_comment_metrics() },
  { line: 47, text: m.guide_data_urban_density_calculation_comment_details() },
  { line: 49, text: m.guide_data_urban_density_calculation_comment_density() },
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
  { line: 1, text: m.guide_data_urban_density_saved_result_missing() },
  { line: 2, text: m.guide_data_urban_density_collect_comment_yield() },
  {
    line: 3,
    text: m.guide_data_urban_density_liveable_area_comment_completed_exclusions(),
  },
  { line: 4, text: m.guide_data_urban_density_map_comment_completed_exclusions() },
  {
    line: 8,
    text: m.guide_data_urban_density_map_comment_completed_exclusions_outline(),
  },
  { line: 13, text: m.guide_data_urban_density_liveable_area_comment_each_district() },
  { line: 14, text: m.guide_data_urban_density_collect_comment_bounds() },
  { line: 15, text: m.guide_data_urban_density_collect_comment_district_tiles() },
  { line: 16, text: m.guide_data_urban_density_setup_comment_cache() },
  { line: 21, text: m.guide_data_urban_density_collect_comment_request() },
  { line: 23, text: m.guide_data_urban_density_collect_comment_process_features() },
  { line: 24, text: m.guide_data_urban_density_collect_comment_tile_outline() },
  { line: 25, text: m.guide_data_urban_density_setup_comment_tile_status() },
  { line: 27, text: m.guide_data_urban_density_collect_comment_add_features() },
  { line: 33, text: m.guide_data_urban_density_collect_comment_yield() },
  { line: 35, text: m.guide_data_urban_density_collect_comment_clear_tile_outline() },
  { line: 36, text: m.guide_data_urban_density_setup_comment_district_progress() },
  { line: 37, text: m.guide_data_urban_density_setup_comment_precision() },
  {
    line: 38,
    text: m.guide_data_urban_density_liveable_area_comment_clipped_exclusions(),
  },
  { line: 39, text: m.guide_data_urban_density_liveable_area_comment_each_part() },
  { line: 40, text: m.guide_data_urban_density_liveable_area_comment_clip() },
  { line: 41, text: m.guide_data_urban_density_liveable_area_comment_keep_clipped() },
  { line: 43, text: m.guide_data_urban_density_collect_comment_yield() },
  { line: 45, text: m.guide_data_urban_density_liveable_area_comment_excluded() },
  { line: 47, text: m.guide_data_urban_density_liveable_area_comment_union() },
  { line: 49, text: m.guide_data_urban_density_liveable_area_comment_record() },
  { line: 50, text: m.guide_data_urban_density_liveable_area_comment_completed() },
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
  { line: 9, text: m.guide_data_urban_density_setup_comment_precision() },
  { line: 11, text: m.guide_data_urban_density_collect_comment_longitude() },
  { line: 12, text: m.guide_data_urban_density_collect_comment_latitude() },
  { line: 21, text: m.guide_data_urban_density_setup_comment_tile_edges() },
  { line: 33, text: m.guide_data_urban_density_setup_comment_coordinate_space() },
  { line: 48, text: m.guide_data_urban_density_setup_comment_tile_core() },
  { line: 55, text: m.guide_data_urban_density_collect_comment_envelope() },
  { line: 68, text: m.guide_data_urban_density_setup_comment_tile_outline() },
  { line: 76, text: m.guide_data_urban_density_setup_comment_district_progress() },
  { line: 84, text: m.guide_data_urban_density_setup_comment_tile_outline_source() },
  { line: 87, text: m.guide_data_urban_density_setup_comment_show_tile_outline() },
  { line: 101, text: m.guide_data_urban_density_setup_comment_non_liveable_kinds() },
  { line: 111, text: m.guide_data_urban_density_setup_comment_geos() },
  { line: 130, text: m.guide_data_urban_density_setup_comment_repair_overlay() },
  { line: 140, text: m.guide_data_urban_density_setup_comment_precision() },
  { line: 146, text: m.guide_data_urban_density_liveable_area_comment_union() },
  { line: 148, text: m.guide_data_urban_density_liveable_area_comment_clip() },
  { line: 150, text: m.guide_data_urban_density_setup_comment_tile_merge() },
  { line: 154, text: m.guide_data_urban_density_collect_comment_tile_url() },
  { line: 156, text: m.guide_data_urban_density_collect_comment_tile_url_for() },
  { line: 161, text: m.guide_data_urban_density_setup_comment_cache() },
  { line: 162, text: m.guide_data_urban_density_setup_comment_tile_decoder() },
  { line: 173, text: m.guide_data_urban_density_setup_comment_features() },
  { line: 177, text: m.guide_data_urban_density_collect_comment_filter() },
  { line: 179, text: m.guide_data_urban_density_setup_comment_geojson() },
  { line: 180, text: m.guide_data_urban_density_setup_comment_areas() },
  { line: 194, text: m.guide_data_urban_density_setup_comment_cache() },
  { line: 209, text: m.guide_data_urban_density_setup_comment_tile_grid() },
  { line: 221, text: m.guide_data_urban_density_collect_comment_district_tiles() },
  { line: 229, text: m.guide_data_urban_density_setup_comment_tile_status() },
  { line: 232, text: m.guide_data_urban_density_collect_comment_progress() },
  { line: 253, text: m.guide_data_urban_density_setup_comment_progress() },
  { line: 270, text: m.guide_data_urban_density_collect_comment_progress_wrapper() },
  { line: 274, text: m.guide_data_urban_density_setup_comment_district_progress() },
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
  },
  { line: 1, text: m.guide_data_urban_density_liveable_map_comment_hide() },
  { line: 2, text: m.guide_data_urban_density_liveable_map_comment_order() },
  { line: 5, text: m.guide_data_urban_density_liveable_map_comment_liveable_source() },
  { line: 6, text: m.guide_data_urban_density_liveable_area_comment_layer() },
  { line: 8, text: m.guide_data_urban_density_liveable_map_comment_liveable_fill() },
  { line: 11, text: m.guide_data_urban_density_liveable_map_comment_excluded_source() },
  { line: 12, text: m.guide_data_urban_density_liveable_map_comment_excluded_fill() },
  { line: 15, text: m.guide_data_urban_density_liveable_map_comment_outline() },
]
</script>

<section id="saanseoi-project" class="mt-10 scroll-mt-28">
  <header
    class="relative isolate overflow-hidden bg-[radial-gradient(circle_at_90%_5%,color-mix(in_srgb,var(--color-secondary)_22%,transparent),transparent_38%),linear-gradient(135deg,color-mix(in_srgb,var(--color-secondary-container)_78%,transparent),transparent_64%)] px-6 py-7 shadow-card sm:px-9 sm:py-9"
  >
    <div class="relative max-w-4xl">
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
  </header>
  {#if hongKongBasemapNote}
    <GuideCallout class="mt-6">
      <GuideParagraph>
        {hongKongBasemapNote}
      </GuideParagraph>
    </GuideCallout>
  {/if}
  <div class="mt-8 space-y-12">
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
              showExclusions={false}
              {styleUrl}
              {tilejsonUrl}
            />
          {/snippet}
        </GuidePreviewCodeBlock>
      </GuideSubSectionBody>
    </section>
    <section>
      <GuideSubSectionHeader
        id="project-fetch-stats"
        title={m.guide_data_urban_density_calculate_title()}
      />
      <GuideSubSectionBody
        content={m.guide_data_urban_density_calculate_description()}
        contentClass="[&_code.guide-urban-density-level]:text-foreground"
      >
        <div
          class="grid gap-6 font-mono lg:-mr-96 lg:w-[calc(100%+24rem)] lg:grid-cols-[minmax(0,80ch)_minmax(0,1fr)] lg:items-start"
        >
          <div class="space-y-5">
            <GuideParagraph
              class="[&_code]:mx-0.75 [&_code]:inline-flex [&_code]:items-center [&_code]:rounded-sm [&_code]:border [&_code]:border-[#005142]! [&_code]:!bg-secondary-container/15 [&_code]:px-1 [&_code]:py-1 [&_code]:align-middle [&_code]:font-mono [&_code]:text-[0.78em]! [&_code]:font-semibold [&_code]:leading-none [&_code]:text-secondary dark:[&_code]:border-[#2f8f78]!"
            >
              {@html m.guide_data_urban_density_calculate_preview_explanation()}
            </GuideParagraph>
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
            >
              {#snippet preview()}
                <GuideUrbanDensityStatsPreview />
              {/snippet}
            </GuidePreviewCodeBlock>
          </div>
          <aside class="lg:pt-309.5">
            <GuideInstructionCallout
              label={m.guide_data_urban_density_statistics_callout_label()}
              title={m.guide_data_urban_density_statistics_callout_title()}
              description={m.guide_data_urban_density_calculate_explore_statistics()}
            />
          </aside>
        </div>
        <div class="mt-8">
          <GuideSubSectionHeader
            id="project-calc-pop-density"
            title={m.guide_data_urban_density_results_title()}
          />
          <GuideSubSectionBody
            content={m.guide_data_urban_density_results_description()}
          >
            <GuideParagraph
              class="[&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code.guide-urban-density-metrics]:text-secondary"
            >
              {@html m.guide_data_urban_density_results_instruction()}
            </GuideParagraph>
            <div
              class="grid gap-6 font-mono lg:-mr-96 lg:w-[calc(100%+24rem)] lg:grid-cols-[minmax(0,80ch)_minmax(0,1fr)] lg:items-start"
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
              >
                {#snippet preview()}
                  <GuideUrbanDensityDivisionsPreview />
                {/snippet}
              </GuidePreviewCodeBlock>
              <aside class="lg:pt-52">
                <GuideInstructionCallout
                  label={m.guide_data_urban_density_calculation_level_callout_label()}
                  title={m.guide_data_urban_density_calculation_level_callout_title()}
                  description={m.guide_data_urban_density_calculation_comment_level_explainer()}
                />
                <div class="mt-6 lg:mt-169">
                  <GuideInstructionCallout
                    label={m.guide_data_urban_density_calculation_geojson_feature_callout_label()}
                    title={m.guide_data_urban_density_calculation_geojson_feature_callout_title()}
                    description={m.guide_data_urban_density_calculation_geojson_feature_callout_description()}
                  />
                </div>
              </aside>
            </div>
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
            {styleUrl}
            {tilejsonUrl}
          />
        </div>
        <div class="mt-8">
          <GuideSubSectionHeader
            id="project-add-stats-to-map"
            title={m.guide_data_urban_density_results_map_title()}
          />
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
          </GuideSubSectionBody>
        </div>
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
                  {styleUrl}
                  {tilejsonUrl}
                />
              {/snippet}
            </GuidePreviewCodeBlock>
          </GuideSubSectionBody>
        </div>
      </GuideSubSectionBody>
      <GuideParagraph class="mt-8">
        {@html m.guide_data_urban_density_density_reflection()}
      </GuideParagraph>
    </section>
    <section>
      <GuideSubSectionHeader
        id="project-highlight-excl"
        title={m.guide_data_urban_density_map_title()}
      />
      <GuideSubSectionBody content={m.guide_data_urban_density_map_description()}>
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
                {styleUrl}
                {tilejsonUrl}
              />
            {/snippet}
          </GuidePreviewCodeBlock>
          <GuideParagraph>
            {@html m.guide_data_urban_density_exclusion_detail_description()}
          </GuideParagraph>
        </GuideSubSectionBody>
        <div class="mt-8">
          <GuideSubSectionHeader
            id="project-calc-liveable-land"
            title={m.guide_data_urban_density_liveable_area_title()}
          />
          <GuideSubSectionBody>
            <GuideUrbanDensityLiveableLandInputs
              closeLabel={m.common_close()}
              introduction={m.guide_data_urban_density_liveable_area_introduction()}
              description={m.guide_data_urban_density_install_description()}
              nonLiveableLand={m.guide_data_urban_density_install_non_liveable_land()}
              landClippedGeometry={m.guide_data_urban_density_install_land_clipped_geometry()}
              explanation={m.guide_data_urban_density_install_explanation()}
              resourceDownloadJsonResult={m.guide_data_urban_density_resource_download_json_result()}
              resourceDownloadInstructions={m.guide_data_urban_density_resource_download_instructions({
                path: landAnalysisFilePath,
              })}
              resourceDownloadInstructionsTitle={m.guide_data_urban_density_resource_download_instructions_title()}
              resourceExplanation={m.guide_data_urban_density_resource_explanation()}
              resourceSkipSection={m.guide_data_urban_density_resource_skip_section()}
              resourceTitle={m.guide_data_urban_density_resource_title()}
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
                m.guide_data_urban_density_liveable_approach_display(),
              ]}
            />
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
            <GuideParagraph class="mt-6">
              {@html m.guide_data_urban_density_geometry_worker_description()}
            </GuideParagraph>
            <GuideCodeBlock
              label={m.guide_data_urban_density_geometry_worker_code()}
              code={geometryWorkerCode}
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
            <div
              class="grid gap-6 lg:-mr-96 lg:w-[calc(100%+24rem)] lg:grid-cols-[minmax(0,64ch)_minmax(0,1fr)] lg:items-start"
            >
              <div class="space-y-6">
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
                />
                <GuideParagraph>
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
              </div>
              <aside class="lg:pt-96">
                <GuideInstructionCallout
                  label={m.guide_data_urban_density_web_mercator_callout_label()}
                  title={m.guide_data_urban_density_web_mercator_callout_title()}
                  description={m.guide_data_urban_density_web_mercator_callout_description()}
                />
                <div class="mt-6 lg:mt-[106rem]">
                  <GuideInstructionCallout
                    label={m.guide_data_urban_density_tile_decoding_callout_label()}
                    title={m.guide_data_urban_density_tile_decoding_callout_title()}
                    description={m.guide_data_urban_density_tile_decoding_callout_description()}
                  />
                </div>
              </aside>
            </div>
          </GuideSubSectionBody>
          <GuideSubSectionBody
            content={m.guide_data_urban_density_collect_non_liveable_land_description()}
          >
            <div
              class="grid gap-6 lg:-mr-96 lg:w-[calc(100%+24rem)] lg:grid-cols-[minmax(0,64ch)_minmax(0,1fr)] lg:items-start"
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
                    {styleUrl}
                    {tilejsonUrl}
                  />
                {/snippet}
              </GuidePreviewCodeBlock>
            </div>
          </GuideSubSectionBody>
          <GuideSubSectionBody
            content={m.guide_data_urban_density_liveable_area_description()}
          >
            <div id="project-liveable-land-result" class="scroll-mt-24">
              <div class="space-y-6">
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
        </div>
        <div class="mt-8">
          <GuideSubSectionHeader
            id="project-finalise-map"
            title={m.guide_data_urban_density_liveable_metrics_title()}
          />
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
                  {styleUrl}
                  {tilejsonUrl}
                />
              {/snippet}
            </GuidePreviewCodeBlock>
          </GuideSubSectionBody>
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
