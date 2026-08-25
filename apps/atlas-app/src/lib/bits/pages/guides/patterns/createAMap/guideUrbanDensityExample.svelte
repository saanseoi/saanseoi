<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'
import GuideCallout from '../../components/shared/guideCallout.svelte'
import GuidePreviewCodeBlock from '../../components/shared/guidePreviewCodeBlock.svelte'
import GuideSubSectionBody from '../../components/shared/guideSubSectionBody.svelte'
import GuideSubSectionHeader from '../../components/shared/guideSubSectionHeader.svelte'

import GuideUrbanDensityPreview from './guideUrbanDensityPreview.svelte'
import GuideUrbanDensityMapPreview from './guideUrbanDensityMapPreview.svelte'

type Props = {
  headerImage: string
  hongKongBasemapNote?: string
  mapReadyCode: string
  mapPreviewImage: string
  mapPreviewLabel: string
  mapCode: string
  metricsCode: string
  metricsCss: string
  statsCode: string
}

let {
  headerImage,
  hongKongBasemapNote,
  mapReadyCode,
  mapPreviewImage,
  mapPreviewLabel,
  mapCode,
  metricsCode,
  metricsCss,
  statsCode,
}: Props = $props()
</script>

<section class="mt-10">
  <img
    class="mb-8 aspect-[16/9] w-full rounded-sm border border-border-card object-cover shadow-card"
    src={headerImage}
    alt="Hand-drawn map of Hong Kong’s built-up land, hills and density cards"
  >
  <span
    class="inline-flex rounded-full bg-secondary-container px-3 py-1 font-body text-label-sm font-semibold text-secondary"
    >{@html m.guide_data_urban_density_badge()}</span
  >
  <h3 class="mt-4 font-display text-headline-sm font-bold text-primary">
    {@html m.guide_data_urban_density_title()}
  </h3>
  <p class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
    {@html m.guide_data_urban_density_description()}
  </p>
  <p class="mt-4 max-w-3xl font-body text-body-sm leading-6 text-foreground-alt">
    {@html m.guide_data_urban_density_definition()}
  </p>
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
          editorIcon="material-symbols-light:map-rounded"
          language="typescript"
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          previewLabel={m.guide_code_block_preview()}
          showCodeLabel={m.guide_code_block_code()}
        >
          {#snippet preview()}
            <GuideUrbanDensityMapPreview
              src={mapPreviewImage}
              label={mapPreviewLabel}
            />
          {/snippet}
        </GuidePreviewCodeBlock>
      </GuideSubSectionBody>
    </section>
    <section>
      <GuideSubSectionHeader title={m.guide_data_urban_density_calculate_title()} />
      <GuideSubSectionBody content={m.guide_data_urban_density_calculate_description()}>
        <GuideCodeBlock
          label={m.guide_data_urban_density_calculate_code()}
          code={statsCode}
          editorIcon="material-symbols-light:data-object-rounded"
          language="typescript"
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      </GuideSubSectionBody>
    </section>
    <section>
      <GuideSubSectionHeader title={m.guide_data_urban_density_map_title()} />
      <GuideSubSectionBody content={m.guide_data_urban_density_map_description()}>
        <GuidePreviewCodeBlock
          label={m.guide_data_urban_density_map_code()}
          code={mapCode}
          editorIcon="material-symbols-light:map-rounded"
          language="typescript"
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          previewLabel={m.guide_code_block_preview()}
          showCodeLabel={m.guide_code_block_code()}
        >
          {#snippet preview()}
            <GuideUrbanDensityPreview />
          {/snippet}
        </GuidePreviewCodeBlock>
        <GuidePreviewCodeBlock
          label={m.guide_data_urban_density_metrics_code()}
          code={metricsCode}
          editorIcon="material-symbols-light:map-rounded"
          language="typescript"
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          previewLabel={m.guide_code_block_preview()}
          showCodeLabel={m.guide_code_block_code()}
        >
          {#snippet preview()}
            <GuideUrbanDensityPreview />
          {/snippet}
        </GuidePreviewCodeBlock>
        <GuidePreviewCodeBlock
          label={m.guide_data_urban_density_metrics_css()}
          code={metricsCss}
          editorIcon="material-symbols-light:palette-outline-rounded"
          language="css"
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          previewLabel={m.guide_code_block_preview()}
          showCodeLabel={m.guide_code_block_code()}
        >
          {#snippet preview()}
            <GuideUrbanDensityPreview />
          {/snippet}
        </GuidePreviewCodeBlock>
      </GuideSubSectionBody>
    </section>
  </div>
</section>
