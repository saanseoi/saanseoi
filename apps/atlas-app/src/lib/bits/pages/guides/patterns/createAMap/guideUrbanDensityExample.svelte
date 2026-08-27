<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import GuideCallout from '../../components/shared/guideCallout.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'
import GuidePreviewCodeBlock from '../../components/shared/guidePreviewCodeBlock.svelte'
import GuideSubSectionBody from '../../components/shared/guideSubSectionBody.svelte'
import GuideSubSectionHeader from '../../components/shared/guideSubSectionHeader.svelte'

import GuideUrbanDensityDivisionsPreview from './guideUrbanDensityDivisionsPreview.svelte'
import GuideUrbanDensityCensusAreasPreview from './guideUrbanDensityCensusAreasPreview.svelte'
import GuideUrbanDensityLiveableAreaPreview from './guideUrbanDensityLiveableAreaPreview.svelte'
import GuideUrbanDensityLiveableDensityPreview from './guideUrbanDensityLiveableDensityPreview.svelte'
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
  mapPreviewLabel: string
  styleUrl: string
  terminalProjectPath: string
  tilejsonUrl: string
  mapCode: string
  calculationCode: string
  calculationDisplayCode: string
  censusAreasCode: string
  liveableAreaCode: string
  liveableMetricsCode: string
  metricsCode: string
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
  mapPreviewLabel,
  styleUrl,
  terminalProjectPath,
  tilejsonUrl,
  mapCode,
  calculationCode,
  calculationDisplayCode,
  censusAreasCode,
  liveableAreaCode,
  liveableMetricsCode,
  metricsCode,
  metricsCss,
  metricsCssDisplayCode,
  statsCode,
  statsDisplayCode,
  turfInstallCode,
  shareLinks,
  onShareExternalLink,
}: Props = $props()

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
  { line: 17, text: m.guide_data_urban_density_stats_comment_error() },
  { line: 22, text: m.guide_data_urban_density_stats_comment_values() },
  { line: 25, text: m.guide_data_urban_density_stats_comment_fields() },
]

const calculationComments = [
  { line: 1, text: m.guide_data_urban_density_calculation_comment_divisions() },
  { line: 4, text: m.guide_data_urban_density_calculation_comment_level() },
  { line: 5, text: m.guide_data_urban_density_calculation_comment_hierarchy() },
  { line: 6, text: m.guide_data_urban_density_calculation_comment_request() },
  { line: 7, text: m.guide_data_urban_density_calculation_comment_error() },
  { line: 8, text: m.guide_data_urban_density_calculation_comment_response() },
  { line: 11, text: m.guide_data_urban_density_calculation_comment_index() },
  { line: 12, text: m.guide_data_urban_density_calculation_comment_each_district() },
  { line: 13, text: m.guide_data_urban_density_calculation_comment_district_code() },
  { line: 14, text: m.guide_data_urban_density_calculation_comment_area() },
  { line: 19, text: m.guide_data_urban_density_calculation_comment_available() },
  { line: 26, text: m.guide_data_urban_density_calculation_comment_totals() },
  { line: 28, text: m.guide_data_urban_density_calculation_comment_lookup() },
  { line: 29, text: m.guide_data_urban_density_calculation_comment_missing_area() },
  { line: 31, text: m.guide_data_urban_density_calculation_comment_start_total() },
  { line: 34, text: m.guide_data_urban_density_calculation_comment_population() },
  { line: 35, text: m.guide_data_urban_density_calculation_comment_land_area() },
  { line: 36, text: m.guide_data_urban_density_calculation_comment_save_total() },
  { line: 39, text: m.guide_data_urban_density_calculation_comment_empty_totals() },
  { line: 42, text: m.guide_data_urban_density_calculation_comment_metrics() },
  { line: 44, text: m.guide_data_urban_density_calculation_comment_density() },
]

const mapComments = [
  { line: 4, text: m.guide_data_urban_density_map_comment_ready() },
  { line: 6, text: m.guide_data_urban_density_map_comment_kinds() },
  { line: 8, text: m.guide_data_urban_density_map_comment_layer() },
  { line: 9, text: m.guide_data_urban_density_map_comment_id() },
  { line: 11, text: m.guide_data_urban_density_map_comment_source() },
  { line: 13, text: m.guide_data_urban_density_map_comment_filter() },
  { line: 14, text: m.guide_data_urban_density_map_comment_paint() },
  { line: 17, text: m.guide_data_urban_density_map_comment_outline() },
]

const metricsComments = [
  { line: 1, text: m.guide_data_urban_density_metrics_comment_section() },
  { line: 2, text: m.guide_data_urban_density_metrics_comment_identifier() },
  { line: 3, text: m.guide_data_urban_density_metrics_comment_label() },
  { line: 4, text: m.guide_data_urban_density_metrics_comment_cards() },
  { line: 11, text: m.guide_data_urban_density_metrics_comment_append() },
]

const censusAreasComments = [
  { line: 1, text: m.guide_data_urban_density_census_comment_request() },
  { line: 3, text: m.guide_data_urban_density_census_comment_geometry() },
  { line: 8, text: m.guide_data_urban_density_census_comment_index() },
  { line: 17, text: m.guide_data_urban_density_census_comment_districts() },
  { line: 25, text: m.guide_data_urban_density_census_comment_map() },
]

const liveableAreaComments = [
  { line: 1, text: m.guide_data_urban_density_liveable_area_comment_import() },
  { line: 5, text: m.guide_data_urban_density_liveable_area_comment_query() },
  { line: 9, text: m.guide_data_urban_density_liveable_area_comment_union() },
  { line: 12, text: m.guide_data_urban_density_liveable_area_comment_subtract() },
  { line: 20, text: m.guide_data_urban_density_liveable_area_comment_layer() },
]

const liveableMetricsComments = [
  { line: 1, text: m.guide_data_urban_density_liveable_metrics_comment_totals() },
  { line: 6, text: m.guide_data_urban_density_liveable_metrics_comment_start() },
  { line: 14, text: m.guide_data_urban_density_liveable_metrics_comment_density() },
  { line: 20, text: m.guide_data_urban_density_liveable_metrics_comment_display() },
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
      <GuideSubSectionHeader title={m.guide_data_urban_density_inputs_title()} />
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
      <GuideSubSectionHeader title={m.guide_data_urban_density_calculate_title()} />
      <GuideSubSectionBody content={m.guide_data_urban_density_calculate_description()}>
        <p
          class="font-body text-body-lg leading-8 text-foreground-alt [&_a]:font-semibold [&_a]:text-secondary [&_a]:underline [&_a]:underline-offset-4"
        >
          {@html m.guide_data_urban_density_calculate_explore_statistics()}
        </p>
        <p
          class="font-body text-body-lg leading-8 text-foreground-alt [&_code]:mx-0.75 [&_code]:inline-flex [&_code]:items-center [&_code]:rounded-sm [&_code]:border [&_code]:!border-[#005142] [&_code]:!bg-secondary-container/15 [&_code]:px-1 [&_code]:py-1 [&_code]:align-middle [&_code]:font-mono [&_code]:!text-[0.78em] [&_code]:font-semibold [&_code]:leading-none [&_code]:text-secondary dark:[&_code]:!border-[#2f8f78]"
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
              label={m.guide_data_urban_density_results_map_code()}
              code={metricsCode}
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
        <GuideSubSectionBody
          content={m.guide_data_urban_density_exclusion_description()}
        >
          <GuidePreviewCodeBlock
            label={m.guide_data_urban_density_map_code()}
            code={mapCode}
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
        </GuideSubSectionBody>
        <div class="mt-8">
          <GuideSubSectionBody
            content={m.guide_data_urban_density_census_areas_description()}
          >
            <GuidePreviewCodeBlock
              label={m.guide_data_urban_density_census_areas_code()}
              code={censusAreasCode}
              comments={censusAreasComments}
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
                <GuideUrbanDensityCensusAreasPreview
                  label={mapPreviewLabel}
                  {styleUrl}
                  {tilejsonUrl}
                />
              {/snippet}
            </GuidePreviewCodeBlock>
          </GuideSubSectionBody>
        </div>
        <div class="mt-8">
          <GuideSubSectionBody
            content={m.guide_data_urban_density_install_description()}
          >
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
        </div>
        <div class="mt-8">
          <GuideSubSectionBody
            content={m.guide_data_urban_density_liveable_area_description()}
          >
            <GuidePreviewCodeBlock
              label={m.guide_data_urban_density_liveable_area_code()}
              code={liveableAreaCode}
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
                <GuideUrbanDensityLiveableAreaPreview
                  label={mapPreviewLabel}
                  {styleUrl}
                  {tilejsonUrl}
                />
              {/snippet}
            </GuidePreviewCodeBlock>
          </GuideSubSectionBody>
        </div>
        <div class="mt-8">
          <GuideSubSectionBody
            content={m.guide_data_urban_density_liveable_metrics_description()}
          >
            <GuidePreviewCodeBlock
              label={m.guide_data_urban_density_liveable_metrics_code()}
              code={liveableMetricsCode}
              comments={liveableMetricsComments}
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
