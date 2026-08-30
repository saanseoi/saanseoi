<script lang="ts">
import { onMount } from 'svelte'

import { m } from '#lib/bits/internal/i18n.js'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import GuideCallout from '../../components/shared/guideCallout.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'
import GuidePreviewCodeBlock from '../../components/shared/guidePreviewCodeBlock.svelte'
import GuideSubSectionBody from '../../components/shared/guideSubSectionBody.svelte'
import GuideSubSectionHeader from '../../components/shared/guideSubSectionHeader.svelte'
import GuideInstructionCallout from '../../components/createAMap/guideInstructionCallout.svelte'

import GuideUrbanDensityDivisionsPreview from './guideUrbanDensityDivisionsPreview.svelte'
import GuideUrbanDensityCensusAreasPreview from './guideUrbanDensityCensusAreasPreview.svelte'
import GuideUrbanDensityLiveableDensityPreview from './guideUrbanDensityLiveableDensityPreview.svelte'
import GuideUrbanDensityLiveableLandInputs from './guideUrbanDensityLiveableLandInputs.svelte'
import { loadCachedDistrictLand } from './guideUrbanDensityLiveableMap.ts'
import GuideUrbanDensityLiveableResultPreview from './guideUrbanDensityLiveableResultPreview.svelte'
import GuideUrbanDensityLiveableAnalysisPreview from './guideUrbanDensityLiveableAnalysisPreview.svelte'
import GuideUrbanDensityPreview from './guideUrbanDensityPreview.svelte'
import GuideUrbanDensityMapPreview from './guideUrbanDensityMapPreview.svelte'
import GuideUrbanDensityStatsPreview from './guideUrbanDensityStatsPreview.svelte'

type ShareLink = {
  href: string
  icon: string
  label: string
  newWindow?: boolean
}

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
  setupZ14TileFetcherCode: string
  setupZ14TileFetcherDisplayCode: string
  collectNonLiveableLandCode: string
  collectNonLiveableLandDisplayCode: string
  liveableAreaCode: string
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
  shareLinks: ShareLink[]
  onShareExternalLink: (provider: string) => void
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
  setupZ14TileFetcherCode,
  setupZ14TileFetcherDisplayCode,
  collectNonLiveableLandCode,
  collectNonLiveableLandDisplayCode,
  liveableAreaCode,
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
  shareLinks,
  onShareExternalLink,
}: Props = $props()

onMount(() => {
  void loadCachedDistrictLand().catch(() => {
    // A later preview retries if the R2 result is temporarily unavailable.
  })
})

const statsComments = [
  { line: 4, text: m.guide_data_urban_density_stats_comment_api_base_url() },
  { line: 5, text: m.guide_data_urban_density_stats_comment_endpoint() },
  { line: 6, text: m.guide_data_urban_density_stats_comment_dataset() },
  { line: 8, text: m.guide_data_urban_density_stats_comment_helper() },
  { line: 9, text: m.guide_data_urban_density_stats_comment_url() },
  { line: 10, text: m.guide_data_urban_density_stats_comment_cohort() },
  { line: 11, text: m.guide_data_urban_density_stats_comment_dataset_filter() },
  { line: 12, text: m.guide_data_urban_density_stats_comment_field() },
  { line: 13, text: m.guide_data_urban_density_stats_comment_reference_period() },
  { line: 15, text: m.guide_data_urban_density_stats_comment_request() },
  { line: 16, text: m.guide_data_urban_density_stats_comment_values() },
  { line: 19, text: m.guide_data_urban_density_stats_comment_fields() },
]

const mapComments = [
  { line: 4, text: m.guide_data_urban_density_map_comment_ready() },
  { line: 6, text: m.guide_data_urban_density_map_comment_kinds() },
  { line: 15, text: m.guide_data_urban_density_map_comment_layer() },
  { line: 16, text: m.guide_data_urban_density_map_comment_id() },
  { line: 18, text: m.guide_data_urban_density_map_comment_source() },
  { line: 20, text: m.guide_data_urban_density_map_comment_filter() },
  { line: 21, text: m.guide_data_urban_density_map_comment_paint() },
  { line: 24, text: m.guide_data_urban_density_map_comment_outline() },
]

const metricsComments = [
  { line: 5, text: m.guide_data_urban_density_metrics_comment_section() },
  { line: 6, text: m.guide_data_urban_density_metrics_comment_identifier() },
  { line: 7, text: m.guide_data_urban_density_metrics_comment_label() },
  { line: 8, text: m.guide_data_urban_density_metrics_comment_cards() },
  { line: 15, text: m.guide_data_urban_density_metrics_comment_append() },
]

const calculationComments = [
  { line: 3, text: m.guide_data_urban_density_calculation_comment_divisions() },
  { line: 5, text: m.guide_data_urban_density_calculation_comment_level() },
  {
    line: 6,
    text: m.guide_data_urban_density_calculation_comment_hierarchy_geometry(),
  },
  { line: 8, text: m.guide_data_urban_density_calculation_comment_request() },
  { line: 9, text: m.guide_data_urban_density_calculation_comment_error() },
  { line: 14, text: m.guide_data_urban_density_calculation_comment_response() },
  { line: 19, text: m.guide_data_urban_density_calculation_comment_index() },
  { line: 19, text: m.guide_data_urban_density_calculation_comment_each_district() },
  { line: 20, text: m.guide_data_urban_density_calculation_comment_district_code() },
  { line: 21, text: m.guide_data_urban_density_calculation_comment_area() },
  { line: 22, text: m.guide_data_urban_density_calculation_comment_geometry() },
  { line: 32, text: m.guide_data_urban_density_calculation_comment_totals() },
  { line: 34, text: m.guide_data_urban_density_calculation_comment_start_total() },
  { line: 35, text: m.guide_data_urban_density_calculation_comment_population() },
  { line: 36, text: m.guide_data_urban_density_calculation_comment_land_area() },
  { line: 37, text: m.guide_data_urban_density_calculation_comment_save_total() },
  { line: 39, text: m.guide_data_urban_density_calculation_comment_empty_totals() },
  { line: 41, text: m.guide_data_urban_density_calculation_comment_metrics() },
  { line: 42, text: m.guide_data_urban_density_calculation_comment_details() },
  { line: 43, text: m.guide_data_urban_density_calculation_comment_density() },
]

const collectNonLiveableLandComments = [
  {
    line: 1,
    text: '{ 255 LINES OMITTED: KEEP YOUR WORKING CODE }',
    alwaysVisible: true,
  },
  {
    line: 1,
    text: 'APPEND THIS Z14 LAND-USE COLLECTION TO THE END OF src/main.ts',
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 1, text: m.guide_data_urban_density_collect_comment_feature_list() },
  { line: 3, text: m.guide_data_urban_density_saved_result_missing() },
  { line: 5, text: m.guide_data_urban_density_collect_comment_request() },
  { line: 6, text: m.guide_data_urban_density_collect_comment_tile_outline() },
  { line: 8, text: m.guide_data_urban_density_collect_comment_add_features() },
  { line: 10, text: m.guide_data_urban_density_collect_comment_yield() },
  { line: 13, text: m.guide_data_urban_density_collect_comment_clear_tile_outline() },
  { line: 15, text: m.guide_data_urban_density_collect_comment_bounds() },
]

const setupZ14TileFetcherComments = [
  {
    line: 1,
    text: '{ 125 LINES OMITTED: KEEP YOUR WORKING MAP, STATISTICS, AND DIVISIONS REQUEST }',
    alwaysVisible: true,
  },
  {
    line: 1,
    text: 'APPEND THIS Z14 TILE FETCHER SETUP TO THE END OF src/main.ts',
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 1, text: m.guide_data_urban_density_collect_comment_vector_tile() },
  { line: 2, text: m.guide_data_urban_density_collect_comment_pbf() },
  { line: 3, text: m.guide_data_urban_density_liveable_area_comment_import() },
  { line: 11, text: m.guide_data_urban_density_collect_comment_zoom() },
  { line: 12, text: m.guide_data_urban_density_collect_comment_longitude() },
  { line: 13, text: m.guide_data_urban_density_collect_comment_latitude() },
  { line: 17, text: m.guide_data_urban_density_setup_comment_tile_edges() },
  { line: 22, text: m.guide_data_urban_density_setup_comment_tile_rectangle() },
  { line: 27, text: m.guide_data_urban_density_collect_comment_overlap() },
  { line: 30, text: m.guide_data_urban_density_collect_comment_envelope() },
  { line: 42, text: m.guide_data_urban_density_setup_comment_tile_outline_feedback() },
  { line: 46, text: m.guide_data_urban_density_setup_comment_tile_outline() },
  { line: 50, text: m.guide_data_urban_density_setup_comment_tile_outline_source() },
  { line: 52, text: m.guide_data_urban_density_setup_comment_show_tile_outline() },
  { line: 57, text: m.guide_data_urban_density_setup_comment_focus_district() },
  { line: 62, text: m.guide_data_urban_density_setup_comment_non_liveable_kinds() },
  { line: 63, text: m.guide_data_urban_density_collect_comment_tile_url() },
  { line: 65, text: m.guide_data_urban_density_collect_comment_tile_url_for() },
  { line: 70, text: m.guide_data_urban_density_setup_comment_cache() },
  { line: 71, text: m.guide_data_urban_density_setup_comment_tile_decoder() },
  { line: 80, text: m.guide_data_urban_density_collect_comment_decode() },
  { line: 81, text: m.guide_data_urban_density_setup_comment_features() },
  { line: 84, text: m.guide_data_urban_density_collect_comment_filter() },
  { line: 85, text: m.guide_data_urban_density_setup_comment_geojson() },
  { line: 86, text: m.guide_data_urban_density_setup_comment_areas() },
  { line: 98, text: m.guide_data_urban_density_collect_comment_district_tiles() },
  { line: 107, text: m.guide_data_urban_density_collect_comment_progress() },
  { line: 109, text: m.guide_data_urban_density_setup_comment_progress_panel() },
  { line: 120, text: m.guide_data_urban_density_setup_comment_progress() },
  { line: 131, text: m.guide_data_urban_density_collect_comment_progress_wrapper() },
  { line: 133, text: m.guide_data_urban_density_setup_comment_district_progress() },
]

const liveableAreaComments = [
  {
    line: 1,
    text: '{ 166 LINES OMITTED: KEEP YOUR WORKING MAP, STATISTICS, DIVISIONS REQUEST, AND Z14 LAND-USE COLLECTION }',
    alwaysVisible: true,
  },
  {
    line: 1,
    text: 'APPEND THIS CALCULATION AND JSON DOWNLOAD TO THE END OF src/main.ts',
    alwaysVisible: true,
    spacerAfter: true,
  },
  { line: 2, text: m.guide_data_urban_density_collect_comment_yield() },
  { line: 3, text: m.guide_data_urban_density_liveable_area_comment_district_land() },
  { line: 4, text: m.guide_data_urban_density_liveable_area_comment_each_district() },
  { line: 10, text: m.guide_data_urban_density_setup_comment_district_progress() },
  { line: 8, text: m.guide_data_urban_density_collect_comment_yield() },
  { line: 9, text: m.guide_data_urban_density_liveable_area_comment_district_parts() },
  {
    line: 14,
    text: m.guide_data_urban_density_liveable_area_comment_clipped_exclusions(),
  },
  { line: 13, text: m.guide_data_urban_density_liveable_area_comment_each_part() },
  { line: 15, text: m.guide_data_urban_density_collect_comment_overlap() },
  { line: 16, text: m.guide_data_urban_density_liveable_area_comment_clip() },
  { line: 17, text: m.guide_data_urban_density_liveable_area_comment_keep_clipped() },
  { line: 19, text: m.guide_data_urban_density_collect_comment_yield() },
  { line: 28, text: m.guide_data_urban_density_liveable_area_comment_excluded() },
  { line: 29, text: m.guide_data_urban_density_liveable_area_comment_subtract() },
  { line: 30, text: m.guide_data_urban_density_liveable_area_comment_record() },
  {
    line: 35,
    text: m.guide_data_urban_density_liveable_area_comment_analysis_result(),
  },
  {
    line: 36,
    text: m.guide_data_urban_density_liveable_area_comment_liveable_districts(),
  },
  { line: 38, text: m.guide_data_urban_density_liveable_area_comment_json() },
  { line: 39, text: m.guide_data_urban_density_liveable_area_comment_dialog() },
  { line: 41, text: m.guide_data_urban_density_liveable_area_comment_result_title() },
  {
    line: 42,
    text: m.guide_data_urban_density_liveable_area_comment_result_title_content(),
  },
  {
    line: 43,
    text: m.guide_data_urban_density_liveable_area_comment_result_title_style(),
  },
  { line: 44, text: m.guide_data_urban_density_liveable_area_comment_download() },
  { line: 45, text: m.guide_data_urban_density_liveable_area_comment_download_label() },
  { line: 47, text: m.guide_data_urban_density_liveable_area_comment_download_url() },
  { line: 48, text: m.guide_data_urban_density_liveable_area_comment_download_name() },
  {
    line: 49,
    text: m.guide_data_urban_density_liveable_area_comment_dialog_contents(),
  },
  { line: 50, text: m.guide_data_urban_density_liveable_area_comment_attach_dialog() },
  { line: 51, text: m.guide_data_urban_density_liveable_area_comment_show_dialog() },
  { line: 52, text: m.guide_data_urban_density_saved_result_keep() },
]

const liveableMetricsComments = [
  { line: 1, text: m.guide_data_urban_density_liveable_metrics_comment_result() },
  { line: 2, text: m.guide_data_urban_density_liveable_metrics_comment_exclusions() },
  { line: 3, text: m.guide_data_urban_density_liveable_metrics_comment_measure() },
  { line: 6, text: m.guide_data_urban_density_liveable_metrics_comment_totals() },
  {
    line: 7,
    text: m.guide_data_urban_density_liveable_metrics_comment_district_details(),
  },
  {
    line: 8,
    text: m.guide_data_urban_density_liveable_metrics_comment_excluded_lookup(),
  },
  {
    line: 9,
    text: m.guide_data_urban_density_liveable_metrics_comment_excluded_area(),
  },
  { line: 10, text: m.guide_data_urban_density_liveable_metrics_comment_start() },
  { line: 11, text: m.guide_data_urban_density_liveable_metrics_comment_population() },
  { line: 12, text: m.guide_data_urban_density_liveable_metrics_comment_land_area() },
  {
    line: 13,
    text: m.guide_data_urban_density_liveable_metrics_comment_save(),
  },
  { line: 21, text: m.guide_data_urban_density_liveable_metrics_comment_remaining() },
  { line: 22, text: m.guide_data_urban_density_liveable_metrics_comment_density() },
  { line: 23, text: m.guide_data_urban_density_liveable_metrics_comment_percentage() },
  { line: 27, text: m.guide_data_urban_density_liveable_metrics_comment_display() },
  { line: 36, text: m.guide_data_urban_density_liveable_metrics_comment_append() },
]

const liveableAreaMapComments = [
  { line: 7, text: m.guide_data_urban_density_liveable_map_comment_hide() },
  { line: 9, text: m.guide_data_urban_density_liveable_map_comment_order() },
  { line: 11, text: m.guide_data_urban_density_liveable_map_comment_excluded_source() },
  { line: 13, text: m.guide_data_urban_density_liveable_map_comment_excluded_fill() },
  { line: 15, text: m.guide_data_urban_density_liveable_map_comment_outline() },
  { line: 19, text: m.guide_data_urban_density_liveable_map_comment_liveable_source() },
  { line: 20, text: m.guide_data_urban_density_liveable_area_comment_layer() },
  { line: 22, text: m.guide_data_urban_density_liveable_map_comment_liveable_fill() },
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
        class="mt-5 max-w-3xl font-display text-[clamp(2.25rem,4.5vw,3.75rem)] font-bold leading-[0.92] tracking-[-0.045em] text-primary"
      >
        {@html m.guide_data_urban_density_title()}
      </h3>
      <p class="mt-5 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
        {@html m.guide_data_urban_density_description()}
      </p>
    </div>
  </header>
  {#if hongKongBasemapNote}
    <GuideCallout class="mt-6">
      <p class="font-body text-body-lg leading-8 text-foreground-alt">
        {hongKongBasemapNote}
      </p>
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
          {editorIcon}
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
            <p
              class="font-body text-body-lg leading-8 text-foreground-alt [&_code]:mx-0.75 [&_code]:inline-flex [&_code]:items-center [&_code]:rounded-sm [&_code]:border [&_code]:border-[#005142]! [&_code]:!bg-secondary-container/15 [&_code]:px-1 [&_code]:py-1 [&_code]:align-middle [&_code]:font-mono [&_code]:text-[0.78em]! [&_code]:font-semibold [&_code]:leading-none [&_code]:text-secondary dark:[&_code]:border-[#2f8f78]!"
            >
              {@html m.guide_data_urban_density_calculate_preview_explanation()}
            </p>
            <GuidePreviewCodeBlock
              label={m.guide_data_urban_density_calculate_code()}
              code={`\n${statsCode}`}
              displayCode={statsDisplayCode}
              comments={statsComments}
              {editorIcon}
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
          <aside class="lg:pt-81.5">
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
            <p
              class="font-body text-body-lg leading-8 text-foreground-alt [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code.guide-urban-density-metrics]:text-secondary"
            >
              {@html m.guide_data_urban_density_results_instruction()}
            </p>
            <div
              class="grid gap-6 font-mono lg:-mr-96 lg:w-[calc(100%+24rem)] lg:grid-cols-[minmax(0,80ch)_minmax(0,1fr)] lg:items-start"
            >
              <GuidePreviewCodeBlock
                label={m.guide_data_urban_density_results_code()}
                code={calculationCode}
                displayCode={calculationDisplayCode}
                comments={calculationComments}
                {editorIcon}
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
              </aside>
            </div>
          </GuideSubSectionBody>
        </div>
        <p class="mt-8 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
          {@html m.guide_data_urban_density_census_areas_map_description()}
        </p>
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
              {editorIcon}
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
      <p class="mt-8 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
        {@html m.guide_data_urban_density_density_reflection()}
      </p>
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
          <p class="font-body text-body-lg leading-8 text-foreground-alt">
            {@html m.guide_data_urban_density_exclusion_detail_description()}
          </p>
        </GuideSubSectionBody>
        <div class="mt-8">
          <GuideSubSectionHeader
            id="project-calc-liveable-land"
            title={m.guide_data_urban_density_liveable_area_title()}
          />
          <GuideSubSectionBody>
            <GuideUrbanDensityLiveableLandInputs
              introduction={m.guide_data_urban_density_liveable_area_introduction()}
              description={m.guide_data_urban_density_install_description()}
              nonLiveableLand={m.guide_data_urban_density_install_non_liveable_land()}
              landClippedGeometry={m.guide_data_urban_density_install_land_clipped_geometry()}
              explanation={m.guide_data_urban_density_install_explanation()}
              resourceDownloadJsonResult={m.guide_data_urban_density_resource_download_json_result()}
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
          </GuideSubSectionBody>
          <GuideSubSectionBody
            content={m.guide_data_urban_density_setup_z14_tile_fetcher_description()}
          >
            <div
              class="grid gap-6 lg:-mr-96 lg:w-[calc(100%+24rem)] lg:grid-cols-[minmax(0,64ch)_minmax(0,1fr)] lg:items-start"
            >
              <GuideCodeBlock
                label={m.guide_data_urban_density_setup_z14_tile_fetcher_code()}
                code={setupZ14TileFetcherCode}
                displayCode={setupZ14TileFetcherDisplayCode}
                comments={setupZ14TileFetcherComments}
                {editorIcon}
                language="typescript"
                variant="editor"
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
              />
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
              <GuidePreviewCodeBlock
                label={m.guide_data_urban_density_liveable_area_code()}
                code={liveableAreaCode}
                displayCode={liveableAreaDisplayCode}
                comments={liveableAreaComments}
                {editorIcon}
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
            <p
              class="mt-8 font-body text-body-lg leading-8 text-foreground-alt [&_code]:rounded-sm [&_code]:bg-black [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-white"
            >
              {@html m.guide_data_urban_density_liveable_result_description()}
            </p>
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
              language="typescript"
              copyLabel={m.common_copy()}
              copiedLabel={m.common_copied()}
              variant="editor"
            />
            <p class="mt-8 font-body text-body-lg leading-8 text-foreground-alt">
              {@html m.guide_data_urban_density_liveable_area_map_description()}
            </p>
            <GuidePreviewCodeBlock
              label={m.guide_data_urban_density_liveable_area_map_code()}
              code={liveableAreaMapCode}
              displayCode={liveableAreaMapDisplayCode}
              comments={liveableAreaMapComments}
              {editorIcon}
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
    </section>
    <section>
      <GuideSubSectionHeader title={m.guide_data_urban_density_conclusion_title()} />
      <div
        class="mt-3 max-w-3xl space-y-5 font-body text-body-lg leading-8 text-foreground-alt [&_a]:font-semibold [&_a]:text-secondary [&_a]:underline [&_a]:underline-offset-4"
      >
        <p>{@html m.guide_data_urban_density_conclusion_community()}</p>
        <p>{@html m.guide_data_urban_density_conclusion_explore()}</p>
        <nav class="flex flex-wrap gap-2" aria-label={m.guide_share_title()}>
          {#each shareLinks as link}
            <a
              class="inline-flex size-10 items-center justify-center border border-border-card bg-background text-secondary no-underline transition-colors hover:bg-secondary-container"
              href={link.href}
              onclick={() => onShareExternalLink(link.icon)}
              target={link.newWindow === false ? undefined : '_blank'}
              rel={link.newWindow === false ? undefined : 'noreferrer'}
              aria-label={link.label}
              title={link.label}
            >
              <Icon icon={link.icon} class="size-4.5" aria-hidden="true" />
            </a>
          {/each}
        </nav>
      </div>
    </section>
  </div>
</section>
