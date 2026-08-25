<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideCallout from '../../components/shared/guideCallout.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'
import GuidePreviewCodeBlock from '../../components/shared/guidePreviewCodeBlock.svelte'
import GuideSubSectionBody from '../../components/shared/guideSubSectionBody.svelte'
import GuideSubSectionHeader from '../../components/shared/guideSubSectionHeader.svelte'

import GuideUrbanDensityDivisionsPreview from './guideUrbanDensityDivisionsPreview.svelte'
import GuideUrbanDensityPreview from './guideUrbanDensityPreview.svelte'
import GuideUrbanDensityMapPreview from './guideUrbanDensityMapPreview.svelte'
import GuideUrbanDensityStatsPreview from './guideUrbanDensityStatsPreview.svelte'

type Props = {
  editorIcon?: string
  hongKongBasemapNote?: string
  mapReadyCode: string
  mapPreviewLabel: string
  styleUrl: string
  tilejsonUrl: string
  mapCode: string
  calculationCode: string
  calculationDisplayCode: string
  metricsCode: string
  metricsCss: string
  metricsCssDisplayCode: string
  statsCode: string
  statsDisplayCode: string
}

let {
  editorIcon,
  hongKongBasemapNote,
  mapReadyCode,
  mapPreviewLabel,
  styleUrl,
  tilejsonUrl,
  mapCode,
  calculationCode,
  calculationDisplayCode,
  metricsCode,
  metricsCss,
  metricsCssDisplayCode,
  statsCode,
  statsDisplayCode,
}: Props = $props()

const statsComments = [
  { line: 8, text: m.guide_data_urban_density_stats_comment_api_base_url() },
  { line: 9, text: m.guide_data_urban_density_stats_comment_endpoint() },
  { line: 10, text: m.guide_data_urban_density_stats_comment_dataset() },
  { line: 12, text: m.guide_data_urban_density_stats_comment_helper() },
  { line: 13, text: m.guide_data_urban_density_stats_comment_url() },
  { line: 14, text: m.guide_data_urban_density_stats_comment_cohort() },
  { line: 15, text: m.guide_data_urban_density_stats_comment_dataset_filter() },
  { line: 16, text: m.guide_data_urban_density_stats_comment_field() },
  { line: 17, text: m.guide_data_urban_density_stats_comment_reference_period() },
  { line: 19, text: m.guide_data_urban_density_stats_comment_request() },
  { line: 21, text: m.guide_data_urban_density_stats_comment_error() },
  { line: 22, text: m.guide_data_urban_density_stats_comment_values() },
  { line: 25, text: m.guide_data_urban_density_stats_comment_fields() },
]

const calculationComments = [
  { line: 5, text: m.guide_data_urban_density_calculation_comment_divisions() },
  { line: 6, text: m.guide_data_urban_density_calculation_comment_level() },
  { line: 7, text: m.guide_data_urban_density_calculation_comment_hierarchy() },
  { line: 8, text: m.guide_data_urban_density_calculation_comment_request() },
  { line: 9, text: m.guide_data_urban_density_calculation_comment_error() },
  { line: 10, text: m.guide_data_urban_density_calculation_comment_response() },
  { line: 13, text: m.guide_data_urban_density_calculation_comment_index() },
  { line: 14, text: m.guide_data_urban_density_calculation_comment_each_district() },
  { line: 15, text: m.guide_data_urban_density_calculation_comment_district_code() },
  { line: 16, text: m.guide_data_urban_density_calculation_comment_area() },
  { line: 20, text: m.guide_data_urban_density_calculation_comment_available() },
  { line: 27, text: m.guide_data_urban_density_calculation_comment_totals() },
  { line: 29, text: m.guide_data_urban_density_calculation_comment_lookup() },
  { line: 30, text: m.guide_data_urban_density_calculation_comment_missing_area() },
  { line: 32, text: m.guide_data_urban_density_calculation_comment_start_total() },
  { line: 33, text: m.guide_data_urban_density_calculation_comment_population() },
  { line: 34, text: m.guide_data_urban_density_calculation_comment_land_area() },
  { line: 35, text: m.guide_data_urban_density_calculation_comment_save_total() },
  { line: 38, text: m.guide_data_urban_density_calculation_comment_empty_totals() },
  { line: 41, text: m.guide_data_urban_density_calculation_comment_metrics() },
  { line: 42, text: m.guide_data_urban_density_calculation_comment_details() },
  { line: 43, text: m.guide_data_urban_density_calculation_comment_density() },
]
</script>

<section class="mt-10">
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
      <p class="mt-5 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
        {@html m.guide_data_urban_density_description()}
      </p>
    </div>
  </header>
  {#if hongKongBasemapNote}
    <GuideCallout class="mt-6">
      <p class="font-body text-body-md leading-7 text-foreground-alt">
        {hongKongBasemapNote}
      </p>
    </GuideCallout>
  {/if}
  <div class="mt-8 space-y-12">
    <section>
      <GuideSubSectionHeader title={m.guide_data_urban_density_inputs_title()} />
      <GuideSubSectionBody content={m.guide_data_urban_density_inputs_description()}>
        <GuidePreviewCodeBlock
          label={m.guide_data_urban_density_inputs_code()}
          code={mapReadyCode}
          {editorIcon}
          language="typescript"
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          previewLabel={m.guide_code_block_preview()}
          showCodeLabel={m.guide_code_block_code()}
        >
          {#snippet preview()}
            <GuideUrbanDensityMapPreview
              label={mapPreviewLabel}
              {styleUrl}
              {tilejsonUrl}
            />
          {/snippet}
        </GuidePreviewCodeBlock>
      </GuideSubSectionBody>
    </section>
    <section>
      <GuideSubSectionHeader title={m.guide_data_urban_density_calculate_title()} />
      <GuideSubSectionBody content={m.guide_data_urban_density_calculate_description()}>
        <GuidePreviewCodeBlock
          label={m.guide_data_urban_density_calculate_code()}
          code={statsCode}
          displayCode={statsDisplayCode}
          comments={statsComments}
          {editorIcon}
          language="typescript"
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          previewLabel={m.guide_code_block_preview()}
          showCodeLabel={m.guide_code_block_code()}
        >
          {#snippet preview()}
            <GuideUrbanDensityStatsPreview />
          {/snippet}
        </GuidePreviewCodeBlock>
        <div class="mt-8">
          <GuideSubSectionHeader title={m.guide_data_urban_density_results_title()} />
          <GuideSubSectionBody
            content={m.guide_data_urban_density_results_description()}
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
            >
              {#snippet preview()}
                <GuideUrbanDensityDivisionsPreview />
              {/snippet}
            </GuidePreviewCodeBlock>
          </GuideSubSectionBody>
        </div>
        <div class="mt-8">
          <GuideSubSectionHeader
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
            />
          </GuideSubSectionBody>
        </div>
        <div class="mt-8">
          <GuideSubSectionHeader title={m.guide_data_urban_density_markup_title()} />
          <GuideSubSectionBody
            content={m.guide_data_urban_density_markup_description()}
          >
            <GuidePreviewCodeBlock
              label={m.guide_data_urban_density_results_map_code()}
              code={metricsCode}
              {editorIcon}
              language="typescript"
              copyLabel={m.common_copy()}
              copiedLabel={m.common_copied()}
              previewLabel={m.guide_code_block_preview()}
              showCodeLabel={m.guide_code_block_code()}
            >
              {#snippet preview()}
                <GuideUrbanDensityPreview
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
      <GuideSubSectionHeader title={m.guide_data_urban_density_map_title()} />
      <GuideSubSectionBody content={m.guide_data_urban_density_map_description()}>
        <GuideCodeBlock
          label={m.guide_data_urban_density_map_code()}
          code={mapCode}
          {editorIcon}
          language="typescript"
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      </GuideSubSectionBody>
    </section>
  </div>
</section>
