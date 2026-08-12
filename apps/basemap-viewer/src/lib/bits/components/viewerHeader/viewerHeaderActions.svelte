<script lang="ts">
import { Popover } from 'bits-ui'
import type { Readable } from 'svelte/store'
import { Icon } from '../../primitives/icon'
import { IconButton } from '../../primitives/iconButton'
import { SelectMenu } from '../../primitives/selectMenu'
import type { Callbacks, ViewerUiState } from '../../../ctx/app'
import type { AppState, Locale, Theme } from '../../../types'
import { locales, themes, type ViewerText } from '../../pages/basemapViewer/i18n'
import {
  asFeatureKey,
  asLabelKey,
  layerItems,
} from '../../pages/basemapViewer/controlOptions'
import LayerGroup from './viewerHeaderLayerGroup.svelte'
import ComparisonModes from './viewerHeaderComparisonModes.svelte'
import UseThisMap from './viewerHeaderUseThisMap.svelte'

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

const themeLabel = (theme: Theme) => text[theme]
const localeLabel = (locale: Locale) =>
  locales.find(candidate => candidate.value === locale)?.label ?? locales[0].label
const layerButtonClass =
  'flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] border border-(--bar-border) bg-(--bar-control-background) px-2 text-(--bar-text) transition-[border-color,background-color] duration-150 hover:not-disabled:border-(--bar-hover-border) hover:not-disabled:bg-(--bar-hover-background) focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const tabletAlignmentClass = $derived(
  $viewerState.comparisonVersion ? 'max-[1556px]:flex-1' : 'max-[1302px]:flex-1',
)
const tabletPrimaryAlignmentClass = $derived(
  $viewerState.comparisonVersion
    ? 'max-[1556px]:flex-1 max-[1556px]:justify-center'
    : 'max-[1302px]:flex-1 max-[1302px]:justify-center',
)
const separatorClass = $derived(
  $viewerState.comparisonVersion ? 'max-[1556px]:hidden' : 'max-[1302px]:hidden',
)
const layers = $derived(layerItems($viewerState, $ui.enabled, text))
</script>

<div
  class={`order-2 ml-auto flex shrink-0 items-center gap-2 self-center ${tabletAlignmentClass} max-[720px]:gap-[5px]`}
  data-viewer-header-actions
>
  <div class={`flex shrink-0 items-center gap-2 ${tabletPrimaryAlignmentClass}`}>
    {#if $viewerState.comparisonVersion}
      <ComparisonModes mode={$viewerState.comparisonMode} {callbacks} {text} />
    {/if}
    <Popover.Root>
      <Popover.Trigger
        aria-label={text.mapLayers}
        class={layerButtonClass}
        disabled={!$ui.enabled}
      >
        <Icon class="size-4 shrink-0" name="layers" />
        <span
          class="font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.02em]"
        >
          {text.layersButton}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          class="z-20 w-46 overflow-hidden rounded-[7px] border border-(--bar-border) bg-(--bar-control-background) p-[9px] shadow-[0_8px_24px_var(--bar-shadow)]"
          data-bar-theme={$viewerState.theme}
          sideOffset={8}
        >
          <LayerGroup
            class="pb-2"
            items={layers.features}
            label={text.features}
            onChange={(key, enabled) =>
              callbacks.onFeature(asFeatureKey(key), enabled)}
          />
          <LayerGroup
            items={layers.labels}
            label={text.labels}
            onChange={(key, enabled) =>
              callbacks.onLabel(asLabelKey(key), enabled)}
            separated
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>

    <IconButton
      buttonText={text.identify}
      active={$ui.diagnostics.inspect}
      disabled={!$ui.enabled}
      icon="identify"
      label={text.inspect}
      onclick={() => callbacks.onInspect(!$ui.diagnostics.inspect)}
      theme={$viewerState.theme}
    />
    <IconButton
      buttonText={text.diagnostics}
      active={$ui.diagnostics.open}
      disabled={!$ui.enabled}
      icon="debug"
      label={text.diagnostics}
      onclick={() => callbacks.onDiagnostics(!$ui.diagnostics.open)}
      theme={$viewerState.theme}
    />
  </div>

  <div class="ml-auto flex shrink-0 items-center gap-2">
    <span
      aria-hidden="true"
      class={`h-5 w-px bg-(--bar-divider) ${separatorClass}`}
    ></span>

    <SelectMenu
      ariaLabel={`${text.mapTheme}: ${themeLabel($viewerState.theme)}`}
      align="end"
      buttonLabel={themeLabel($viewerState.theme)}
      disabled={!$ui.enabled}
      icon="color-palette"
      items={themes.map((theme) => ({ value: theme, label: themeLabel(theme) }))}
      onValueChange={(value) => callbacks.onTheme(value as Theme)}
      placeholder={text.mapTheme}
      theme={$viewerState.theme}
      value={$viewerState.theme}
    />
    <SelectMenu
      ariaLabel={`${text.mapLabelLanguage}: ${localeLabel($viewerState.locale)}`}
      align="end"
      disabled={!$ui.enabled}
      icon="language"
      items={[...locales]}
      onValueChange={(value) => callbacks.onLocale(value as Locale)}
      placeholder={text.mapLabelLanguage}
      theme={$viewerState.theme}
      value={$viewerState.locale}
    />
    <UseThisMap {text} theme={$viewerState.theme} />
  </div>
</div>
