<script lang="ts">
import type { Readable } from 'svelte/store'
import { IconButton } from '../../../../primitives/iconButton'
import { SelectMenu } from '../../../../primitives/selectMenu'
import type { Callbacks, ViewerUiState } from '../../../../../ctx/app'
import type { AppState } from '../../../../../types'
import type { ViewerText } from '../../i18n'
import ComparisonModes from './viewerHeaderComparisonModes.svelte'

let {
  callbacks,
  state: viewerState,
  ui,
  text,
}: {
  callbacks: Callbacks
  state: Readable<AppState>
  ui: Readable<ViewerUiState>
  text: ViewerText
} = $props()

const controlLabelClass =
  'grid gap-[3px] text-[9px] leading-[1.1] font-semibold tracking-[0.02em] text-(--bar-muted) uppercase'
</script>

<fieldset
  aria-label={text.mapControls}
  class="order-1 m-0 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto border-0 p-0 max-[1100px]:order-3 max-[1100px]:basis-full max-[1100px]:w-full max-[1100px]:pb-0.5 max-[700px]:gap-[5px]"
>
  <div class={`${controlLabelClass} shrink-0`}>
    <SelectMenu
      ariaLabel={text.region}
      disabled={!$ui.enabled}
      items={$ui.regions.map((region) => ({
        value: region.code,
        label: region.label ?? region.description,
      }))}
      onValueChange={callbacks.onRegion}
      optionClass="font-mono"
      placeholder={text.selectRegion}
      label={text.region}
      theme={$viewerState.theme}
      triggerClass="w-53.5 font-mono"
      value={$viewerState.regionCode ?? ''}
    />
  </div>

  <IconButton
    disabled={!$ui.enabled}
    icon="fullscreen"
    label={text.fitRegion}
    onclick={callbacks.onFit}
    theme={$viewerState.theme}
  />

  <div class={`${controlLabelClass} shrink-0`}>
    <SelectMenu
      ariaLabel={text.release}
      disabled={!$ui.enabled}
      items={[
        { value: 'latest', label: text.latest },
        ...$ui.versions.map((version) => ({ value: version, label: version })),
      ]}
      onValueChange={callbacks.onVersion}
      optionClass="font-mono"
      placeholder={text.latest}
      label={text.release}
      theme={$viewerState.theme}
      triggerClass="w-43.25 font-mono"
      value={$viewerState.version}
    />
  </div>

  <div class={`${controlLabelClass} shrink-0`}>
    <SelectMenu
      ariaLabel={text.compare}
      disabled={!$ui.enabled}
      items={[
        { value: 'off', label: text.noComparison },
        { value: 'latest', label: text.latest },
        ...$ui.versions.map((version) => ({ value: version, label: version })),
      ]}
      onValueChange={(value) => callbacks.onComparisonVersion(value === 'off' ? null : value)}
      optionClass="font-mono"
      placeholder={text.noComparison}
      label={text.compare}
      theme={$viewerState.theme}
      triggerClass="w-[202px] font-mono"
      value={$viewerState.comparisonVersion ?? 'off'}
    />
  </div>

  {#if $viewerState.comparisonVersion}
    <div class="shrink-0">
      <ComparisonModes mode={$viewerState.comparisonMode} {callbacks} {text} />
    </div>
  {/if}
</fieldset>
