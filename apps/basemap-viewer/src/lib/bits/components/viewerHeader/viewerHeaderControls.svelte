<script lang="ts">
import type { Readable } from 'svelte/store'
import { IconButton } from '../../primitives/iconButton'
import { SelectMenu } from '../../primitives/selectMenu'
import type { Callbacks, ViewerUiState } from '../../../ctx/app'
import type { AppState } from '../../../types'
import type { ViewerText } from '../../pages/basemapViewer/i18n'
import {
  comparisonReleaseOptions,
  regionOptions,
  releaseOptions,
} from '../../pages/basemapViewer/controlOptions'

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
const wrappingClass = $derived(
  $viewerState.comparisonVersion
    ? 'max-[1556px]:order-3 max-[1556px]:basis-full max-[1556px]:w-full max-[1556px]:justify-center max-[1556px]:pb-0.5'
    : 'max-[1302px]:order-3 max-[1302px]:basis-full max-[1302px]:w-full max-[1302px]:justify-center max-[1302px]:pb-0.5',
)
</script>

<fieldset
  aria-label={text.mapControls}
  data-comparison-controls={$viewerState.comparisonVersion !== null}
  data-viewer-header-controls
  class={`order-1 m-0 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto border-0 p-0 ${wrappingClass} max-[720px]:gap-[5px]`}
>
  <div class={`${controlLabelClass} shrink-0`}>
    <SelectMenu
      ariaLabel={text.region}
      disabled={!$ui.catalogueReady}
      items={regionOptions($ui.regions, text)}
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
      disabled={!$ui.catalogueReady}
      items={releaseOptions($ui.versions, text)}
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
      disabled={!$ui.catalogueReady}
      items={comparisonReleaseOptions($ui.versions, text)}
      onValueChange={(value) => callbacks.onComparisonVersion(value === 'off' ? null : value)}
      optionClass="font-mono"
      placeholder={text.noComparison}
      label={text.compare}
      theme={$viewerState.theme}
      triggerClass="w-[202px] font-mono"
      value={$viewerState.comparisonVersion ?? 'off'}
    />
  </div>
</fieldset>
