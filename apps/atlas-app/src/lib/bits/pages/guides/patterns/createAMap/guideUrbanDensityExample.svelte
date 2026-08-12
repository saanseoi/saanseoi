<script lang="ts">
import { m } from '$lib/bits/internal/i18n'

import GuideCallout from '../../components/shared/guideCallout.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'

type Props = {
  calculateCode: string
  inputsCode: string
  installCode: string
  mapCode: string
  metricsCode: string
  metricsCss: string
  operatingSystem?: string
  writeCode: string
}

let {
  calculateCode,
  inputsCode,
  installCode,
  mapCode,
  metricsCode,
  metricsCss,
  operatingSystem,
  writeCode,
}: Props = $props()
</script>

<GuideCallout class="mt-8" size="generous">
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
  <div class="mt-6 space-y-6">
    <GuideCodeBlock
      label={m.guide_data_urban_density_install()}
      code={installCode}
      language={operatingSystem === 'windows' ? 'powershell' : 'bash'}
      copyLabel={m.common_copy()}
      copiedLabel={m.common_copied()}
    />
    <div>
      <h4 class="font-display text-title-lg font-bold text-primary">
        {@html m.guide_data_urban_density_inputs_title()}
      </h4>
      <p class="mt-2 max-w-3xl font-body text-body-sm leading-6 text-foreground-alt">
        {@html m.guide_data_urban_density_inputs_description()}
      </p>
      <div class="mt-4">
        <GuideCodeBlock
          label={m.guide_data_urban_density_inputs_code()}
          code={inputsCode}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      </div>
    </div>
    <div>
      <h4 class="font-display text-title-lg font-bold text-primary">
        {@html m.guide_data_urban_density_calculate_title()}
      </h4>
      <p class="mt-2 max-w-3xl font-body text-body-sm leading-6 text-foreground-alt">
        {@html m.guide_data_urban_density_calculate_description()}
      </p>
      <div class="mt-4">
        <GuideCodeBlock
          label={m.guide_data_urban_density_calculate_code()}
          code={calculateCode}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      </div>
      <div class="mt-4">
        <GuideCodeBlock
          label={m.guide_data_urban_density_write_code()}
          code={writeCode}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      </div>
    </div>
    <div>
      <h4 class="font-display text-title-lg font-bold text-primary">
        {@html m.guide_data_urban_density_map_title()}
      </h4>
      <p class="mt-2 max-w-3xl font-body text-body-sm leading-6 text-foreground-alt">
        {@html m.guide_data_urban_density_map_description()}
      </p>
      <div class="mt-4 space-y-4">
        <GuideCodeBlock
          label={m.guide_data_urban_density_map_code()}
          code={mapCode}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
        <GuideCodeBlock
          label={m.guide_data_urban_density_metrics_code()}
          code={metricsCode}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
        <GuideCodeBlock
          label={m.guide_data_urban_density_metrics_css()}
          code={metricsCss}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      </div>
    </div>
  </div>
  <p class="mt-6 max-w-3xl font-body text-body-sm leading-6 text-foreground-alt">
    {@html m.guide_data_urban_density_availability()}
  </p>
</GuideCallout>
